/**
 * Database Migration Utility
 * Handles migration from JSON files to SQLite database
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseMigrator {
  constructor(db, repositories) {
    this.db = db;
    this.repositories = repositories;
    this.dataDir = path.join(process.env.CONFIG_DIR || '/config', 'data');
  }

  /**
   * Run migration from JSON files to SQLite
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateFromJson() {
    logger.info('Starting migration from JSON files to SQLite database');

    let totalMigrated = 0;

    try {
      // FIXED: Don't use a global transaction but process each migration separately
      // This avoids nested transaction issues that cause "cannot start a transaction within a transaction" errors
      
      // Migrate DNS records first - each method handles its own transaction
      try {
        const dnsRecordsMigrated = await this.migrateDnsRecords(false);
        totalMigrated += dnsRecordsMigrated;
        logger.debug(`Successfully migrated ${dnsRecordsMigrated} DNS records`);
      } catch (dnsError) {
        logger.error(`Error migrating DNS records: ${dnsError.message}`);
        // Continue with other migrations
      }

      // Migrate users with independent transaction
      try {
        const usersMigrated = await this.migrateUsers(false);
        totalMigrated += usersMigrated;
        logger.debug(`Successfully migrated ${usersMigrated} users`);
      } catch (usersError) {
        logger.error(`Error migrating users: ${usersError.message}`);
        // Continue with other migrations
      }

      // Migrate tokens with independent transaction
      try {
        const tokensMigrated = await this.migrateRevokedTokens(false);
        totalMigrated += tokensMigrated;
        logger.debug(`Successfully migrated ${tokensMigrated} tokens`);
      } catch (tokensError) {
        logger.error(`Error migrating tokens: ${tokensError.message}`);
        // Continue with other migrations
      }

      // Migrate DNS tracked records with independent transaction
      try {
        const dnsTrackedRecordsMigrated = await this.migrateDnsTrackedRecords(false);
        totalMigrated += dnsTrackedRecordsMigrated;
        logger.debug(`Successfully migrated ${dnsTrackedRecordsMigrated} DNS tracked records`);
      } catch (trackedError) {
        logger.error(`Error migrating DNS tracked records: ${trackedError.message}`);
        // Continue to finish
      }

      if (totalMigrated > 0) {
        logger.info(`Migration from JSON to SQLite completed successfully (${totalMigrated} records)`);
      } else {
        logger.info('No records needed migration from JSON to SQLite');
      }

      return totalMigrated;
    } catch (error) {
      logger.error(`Migration failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Migrate DNS records from JSON
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateDnsRecords(insideTransaction = false) {
    const dnsRecordsFile = path.join(this.dataDir, 'dns-records.json');
    const legacyDnsRecordsFile = path.join(process.cwd(), 'dns-records.json');

    // Check if file exists
    if (!fs.existsSync(dnsRecordsFile) && !fs.existsSync(legacyDnsRecordsFile)) {
      logger.info('No DNS records JSON file found, skipping migration');
      return 0;
    }

    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    try {
      // Try to read from standard location first
      let fileContent;
      const sourceFile = fs.existsSync(dnsRecordsFile) ? dnsRecordsFile : legacyDnsRecordsFile;
      fileContent = fs.readFileSync(sourceFile, 'utf8');

      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        logger.error(`Failed to parse DNS records JSON: ${parseError.message}`);
        return 0;
      }

      // Start a transaction if we're not already in one
      if (!isInTransaction) {
        await this.db.beginTransaction();
        logger.debug('Started transaction for DNS records migration');
      }

      try {
        // Check if we're dealing with an array (old format) or object with providers (new format)
        let migratedCount = 0;

        if (Array.isArray(jsonData)) {
          // Old format - flat array of records
          logger.info('Detected legacy array format for DNS records');
          migratedCount = await this.migrateOldFormatDnsRecords(jsonData, true);
        } else if (jsonData.providers) {
          // New format - object with providers
          logger.info('Detected current provider-based format for DNS records');
          migratedCount = await this.repositories.dnsRecord.migrateFromJson(jsonData);
        } else {
          // Unknown format
          logger.warn('Unknown DNS records JSON format, skipping migration');

          // Commit transaction if we started one
          if (!isInTransaction) {
            await this.db.commit();
            logger.debug('Committed transaction for DNS records migration (empty)');
          }

          return 0;
        }

        // Commit transaction if we started one
        if (!isInTransaction) {
          await this.db.commit();
          logger.debug('Committed transaction for DNS records migration');
        }

        logger.info(`Migrated ${migratedCount} DNS records from JSON`);

        // Rename JSON file to indicate it's been migrated
        if (migratedCount > 0) {
          const migratedFile = `${sourceFile}.migrated`;
          fs.renameSync(sourceFile, migratedFile);
          logger.info(`Renamed migrated file to ${path.basename(migratedFile)}`);
        }

        return migratedCount;
      } catch (error) {
        // Rollback transaction if we started one
        if (!isInTransaction) {
          await this.db.rollback();
          logger.error('Rolled back transaction due to DNS records migration error');
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate DNS records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate DNS records from old array format
   * @param {Array} records - Array of DNS records
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateOldFormatDnsRecords(records, insideTransaction = false) {
    if (!Array.isArray(records) || records.length === 0) {
      logger.warn('No records to migrate from legacy format');
      return 0;
    }

    let migratedCount = 0;

    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    // Start a transaction if we're not already in one
    if (!isInTransaction) {
      await this.db.beginTransaction();
      logger.debug('Started transaction for legacy DNS records migration');
    }

    try {
      for (const record of records) {
        if (!record.id || !record.provider || !record.name || !record.type) {
          logger.warn(`Skipping incomplete record: ${JSON.stringify(record)}`);
          continue;
        }

        // Check if record already exists
        const existingRecord = await this.repositories.dnsRecord.findByRecordId(record.id, record.provider);
        if (existingRecord) {
          logger.debug(`Record already exists: ${record.name} (${record.type})`);
          continue;
        }

        // Skip invalid records
        if (record.type === 'UNKNOWN' || record.name === 'unknown') {
          logger.debug(`Skipping invalid record during migration: ${record.id} (${record.type}:${record.name})`);
          continue;
        }

        // Get content with fallbacks
        const content = record.content || record.value || record.domain || '';

        // Skip records with no content (unless they're special record types)
        if (!content && !['NS', 'MX', 'SRV'].includes(record.type)) {
          logger.debug(`Skipping record with empty content: ${record.type}:${record.name}`);
          continue;
        }

        // Prepare record for database
        const dbRecord = {
          record_id: record.id,
          provider: record.provider,
          type: record.type,
          name: record.name,
          content: content,
          ttl: record.ttl || 1,
          proxied: record.proxied === true ? 1 : 0,
          tracked_at: record.createdAt || record.updatedAt || new Date().toISOString(),
          is_orphaned: 0, // Assume not orphaned during migration
          orphaned_at: null,
          fingerprint: `${record.type}::${record.name}::${content}::${record.ttl || 1}::${record.proxied === true ? 1 : 0}`
        };

        await this.repositories.dnsRecord.create(dbRecord);
        migratedCount++;
        logger.debug(`Migrated record: ${record.name} (${record.type})`);
      }

      // Commit the transaction if we started one
      if (!isInTransaction) {
        await this.db.commit();
        logger.debug('Committed transaction for legacy DNS records migration');
      }

      logger.info(`Migrated ${migratedCount} DNS records from legacy format`);

      return migratedCount;
    } catch (error) {
      // Rollback on error if we started the transaction
      if (!isInTransaction) {
        await this.db.rollback();
        logger.error('Rolled back transaction due to legacy DNS records migration error');
      }
      logger.error(`Failed to migrate legacy format DNS records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate users from JSON
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated users
   */
  async migrateUsers(insideTransaction = false) {
    const usersFile = path.join(this.dataDir, 'users.json');

    // Check if file exists
    if (!fs.existsSync(usersFile)) {
      logger.info('No users JSON file found, skipping migration');
      return 0;
    }

    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    try {
      const fileContent = fs.readFileSync(usersFile, 'utf8');
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        logger.error(`Failed to parse users JSON: ${parseError.message}`);
        return 0;
      }

      // Start a transaction if we're not already in one
      if (!isInTransaction) {
        await this.db.beginTransaction();
        logger.debug('Started transaction for users migration');
      }

      try {
        // Check if this is just the default admin user (fresh install)
        const isDefaultOnly = Array.isArray(jsonData) && 
                             jsonData.length === 1 && 
                             jsonData[0].username === 'admin' &&
                             jsonData[0].id === '1' &&
                             !jsonData[0].lastLogin;

        if (isDefaultOnly) {
          logger.info('Detected fresh install with default admin user only, skipping migration');
          // Delete the file instead of migrating
          fs.unlinkSync(usersFile);
          logger.debug('Removed default users.json file');
          
          // Commit empty transaction
          if (!isInTransaction) {
            await this.db.commit();
          }
          return 0;
        }

        // Migrate users
        const migratedCount = await this.repositories.user.migrateFromJson(jsonData);

        // Commit if we started the transaction
        if (!isInTransaction) {
          await this.db.commit();
          logger.debug('Committed transaction for users migration');
        }

        logger.info(`Migrated ${migratedCount} users from JSON`);

        // Rename JSON file to indicate it's been migrated
        if (migratedCount > 0) {
          const migratedFile = `${usersFile}.migrated`;
          fs.renameSync(usersFile, migratedFile);
          logger.info(`Renamed migrated file to ${path.basename(migratedFile)}`);
        }

        return migratedCount;
      } catch (error) {
        // Rollback if we started the transaction
        if (!isInTransaction) {
          await this.db.rollback();
          logger.error('Rolled back transaction due to users migration error');
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate revoked tokens from JSON
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated tokens
   */
  async migrateRevokedTokens(insideTransaction = false) {
    const tokensFile = path.join(this.dataDir, 'revoked-tokens.json');

    // Check if file exists
    if (!fs.existsSync(tokensFile)) {
      logger.info('No revoked tokens JSON file found, skipping migration');
      return 0;
    }

    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    try {
      const fileContent = fs.readFileSync(tokensFile, 'utf8');
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        logger.error(`Failed to parse revoked tokens JSON: ${parseError.message}`);
        return 0;
      }

      if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        logger.info('No revoked tokens to migrate (empty file)');
        // Delete the empty file instead of migrating
        fs.unlinkSync(tokensFile);
        logger.debug('Removed empty revoked-tokens.json file');
        return 0;
      }

      // Filter out expired tokens
      const now = Date.now();
      const validTokens = jsonData.filter(token => token.expiresAt > now);

      if (validTokens.length === 0) {
        logger.info('All tokens have expired, skipping migration');
        return 0;
      }

      // Start a transaction if we're not already in one
      if (!isInTransaction) {
        await this.db.beginTransaction();
        logger.debug('Started transaction for revoked tokens migration');
      }

      try {
        // Migrate tokens
        let migratedCount = 0;

        for (const token of validTokens) {
          await this.repositories.revokedToken.create({
            token_hash: token.token,
            revoked_at: new Date(token.revokedAt || Date.now()).toISOString(),
            expires_at: new Date(token.expiresAt).toISOString()
          });
          migratedCount++;
        }

        // Commit if we started the transaction
        if (!isInTransaction) {
          await this.db.commit();
          logger.debug('Committed transaction for revoked tokens migration');
        }

        logger.info(`Migrated ${migratedCount} revoked tokens from JSON`);

        // Rename JSON file to indicate it's been migrated
        if (migratedCount > 0) {
          const migratedFile = `${tokensFile}.migrated`;
          fs.renameSync(tokensFile, migratedFile);
          logger.info(`Renamed migrated file to ${path.basename(migratedFile)}`);
        }

        return migratedCount;
      } catch (error) {
        // Rollback if we started the transaction
        if (!isInTransaction) {
          await this.db.rollback();
          logger.error('Rolled back transaction due to revoked tokens migration error');
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate revoked tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate DNS tracked records from JSON
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateDnsTrackedRecords(insideTransaction = false) {
    const trackerFile = path.join(this.dataDir, 'dns-records.json');
    const legacyTrackerFile = path.join(process.cwd(), 'dns-records.json');
    let totalMigrated = 0;

    // Check if file exists
    if (!fs.existsSync(trackerFile) && !fs.existsSync(legacyTrackerFile)) {
      logger.info('No DNS tracked records JSON file found, attempting to migrate from active DNS records');

      // Even without a JSON file, we'll try to migrate from active DNS records
      try {
        totalMigrated = await this.migrateActiveRecords(insideTransaction);
        if (totalMigrated > 0) {
          logger.info(`Migrated ${totalMigrated} active DNS records to tracker`);
        }
        return totalMigrated;
      } catch (activeError) {
        logger.error(`Failed to migrate active DNS records: ${activeError.message}`);
        return 0;
      }
    }

    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    try {
      // Check if dnsTrackedRecord repository exists
      if (!this.repositories.dnsTrackedRecord) {
        logger.warn('DNS tracked record repository not available, skipping migration');
        return 0;
      }

      // Try to read from standard location first
      let fileContent;
      const sourceFile = fs.existsSync(trackerFile) ? trackerFile : legacyTrackerFile;
      fileContent = fs.readFileSync(sourceFile, 'utf8');

      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        logger.error(`Failed to parse DNS tracked records JSON: ${parseError.message}`);
        return 0;
      }

      // Check if we have a valid file format
      if (!jsonData || !jsonData.providers) {
        logger.warn('Invalid DNS tracked records JSON format, skipping migration');
        return 0;
      }

      // Start a transaction if we're not already in one
      if (!isInTransaction) {
        await this.db.beginTransaction();
        logger.debug('Started transaction for DNS tracked records migration');
      }

      try {
        // Migrate tracked records using the repository
        const migratedCount = await this.repositories.dnsTrackedRecord.migrateFromJson(jsonData);

        // As a final step, try to also migrate any active DNS records that weren't in the JSON file
        let additionalMigrated = 0;
        try {
          additionalMigrated = await this.migrateActiveRecords(true);
          if (additionalMigrated > 0) {
            logger.info(`Migrated ${additionalMigrated} additional active DNS records to tracker`);
          }
        } catch (activeError) {
          logger.warn(`Failed to migrate additional active records: ${activeError.message}`);
        }

        // Commit if we started the transaction
        if (!isInTransaction) {
          await this.db.commit();
          logger.debug('Committed transaction for DNS tracked records migration');
        }

        logger.info(`Migrated ${migratedCount} DNS tracked records from JSON`);
        totalMigrated = migratedCount + additionalMigrated;

        // Rename JSON file to indicate it's been migrated
        if (migratedCount > 0) {
          const migratedFile = `${sourceFile}.migrated`;
          fs.renameSync(sourceFile, migratedFile);
          logger.info(`Renamed migrated file to ${path.basename(migratedFile)}`);
        }

        return totalMigrated;
      } catch (error) {
        // Rollback if we started the transaction
        if (!isInTransaction) {
          await this.db.rollback();
          logger.error('Rolled back transaction due to DNS tracked records migration error');
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate DNS tracked records: ${error.message}`);

      // Even if JSON migration fails, try active records if we're not in a transaction
      if (!isInTransaction) {
        try {
          logger.info('Attempting to migrate from active DNS records instead');
          const activeMigrated = await this.migrateActiveRecords(false);
          if (activeMigrated > 0) {
            logger.info(`Migrated ${activeMigrated} active DNS records to tracker`);
            return activeMigrated;
          }
        } catch (activeError) {
          logger.error(`Failed to migrate active DNS records: ${activeError.message}`);
        }
      }

      return 0; // Return 0 instead of re-throwing to avoid stopping other migrations
    }
  }

  /**
   * Migrate active DNS records from the DNS repository to the tracking system
   * @param {boolean} insideTransaction - Whether this is being called within an existing transaction
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateActiveRecords(insideTransaction = false) {
    // Check if a transaction is already in progress
    const isInTransaction = this.db.inTransaction || insideTransaction;

    try {
      // Check if both repositories exist
      if (!this.repositories.dnsRecord || !this.repositories.dnsTrackedRecord) {
        logger.warn('Required repositories not available for active record migration');
        return 0;
      }

      logger.info('Migrating active DNS records to tracking system');

      // Get all active DNS records
      const dnsRecords = await this.repositories.dnsRecord.findAll();

      if (!dnsRecords || dnsRecords.length === 0) {
        logger.info('No active DNS records found to migrate to tracker');
        return 0;
      }

      logger.info(`Found ${dnsRecords.length} active DNS records for migration to tracker`);

      // Start a transaction if we're not already in one
      if (!isInTransaction) {
        await this.db.beginTransaction();
        logger.debug('Started transaction for active records migration');
      }

      try {
        // Track each active record in the tracking system
        let migratedCount = 0;

        for (const record of dnsRecords) {
          // Skip invalid records
          if (record.type === 'UNKNOWN' || record.name === 'unknown' || !record.content) {
            logger.debug(`Skipping invalid record during migration: ${record.record_id} (${record.type}:${record.name})`);
            continue;
          }

          // Check if this record is already being tracked
          const isTracked = await this.repositories.dnsTrackedRecord.isTracked(
            record.provider,
            record.record_id
          );

          if (!isTracked) {
            // Add metadata to track that this record was created by the app
            const metadata = {
              appManaged: true,
              migratedAt: new Date().toISOString()
            };

            await this.repositories.dnsTrackedRecord.trackRecord({
              provider: record.provider,
              record_id: record.record_id,
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied,
              tracked_at: record.created_at || new Date().toISOString(),
              metadata: JSON.stringify(metadata)
            });

            migratedCount++;
          }
        }

        // Commit if we started the transaction
        if (!isInTransaction) {
          await this.db.commit();
          logger.debug('Committed transaction for active records migration');
        }

        logger.info(`Successfully migrated ${migratedCount} active DNS records to tracking system`);

        return migratedCount;
      } catch (error) {
        // Rollback if we started the transaction
        if (!isInTransaction) {
          await this.db.rollback();
          logger.error('Rolled back transaction due to active records migration error');
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate active DNS records: ${error.message}`);
      return 0;
    }
  }
}

module.exports = DatabaseMigrator;