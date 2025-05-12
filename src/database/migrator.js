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
      // Migrate DNS records first, but don't let errors stop the whole process
      try {
        const dnsRecordsMigrated = await this.migrateDnsRecords();
        totalMigrated += dnsRecordsMigrated;
      } catch (dnsError) {
        logger.error(`DNS records migration failed but continuing with other migrations: ${dnsError.message}`);
      }

      // Migrate users
      try {
        const usersMigrated = await this.migrateUsers();
        totalMigrated += usersMigrated;
      } catch (usersError) {
        logger.error(`Users migration failed but continuing with other migrations: ${usersError.message}`);
      }

      // Migrate tokens
      try {
        const tokensMigrated = await this.migrateRevokedTokens();
        totalMigrated += tokensMigrated;
      } catch (tokensError) {
        logger.error(`Tokens migration failed but continuing with other migrations: ${tokensError.message}`);
      }

      // Migrate DNS tracked records
      try {
        const dnsTrackedRecordsMigrated = await this.migrateDnsTrackedRecords();
        totalMigrated += dnsTrackedRecordsMigrated;
      } catch (dnsTrackedError) {
        logger.error(`DNS tracked records migration failed but continuing: ${dnsTrackedError.message}`);
      }

      // Create a marker file to indicate successful migration
      if (totalMigrated > 0) {
        const markerFile = path.join(this.dataDir, '.json_migration_complete');
        fs.writeFileSync(markerFile, new Date().toISOString());
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
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateDnsRecords() {
    const dnsRecordsFile = path.join(this.dataDir, 'dns-records.json');
    const legacyDnsRecordsFile = path.join(process.cwd(), 'dns-records.json');
    
    // Check if file exists
    if (!fs.existsSync(dnsRecordsFile) && !fs.existsSync(legacyDnsRecordsFile)) {
      logger.info('No DNS records JSON file found, skipping migration');
      return 0;
    }
    
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
      
      // Check if we're dealing with an array (old format) or object with providers (new format)
      let migratedCount = 0;
      
      if (Array.isArray(jsonData)) {
        // Old format - flat array of records
        logger.info('Detected legacy array format for DNS records');
        migratedCount = await this.migrateOldFormatDnsRecords(jsonData);
      } else if (jsonData.providers) {
        // New format - object with providers
        logger.info('Detected current provider-based format for DNS records');
        migratedCount = await this.repositories.dnsRecord.migrateFromJson(jsonData);
      } else {
        // Unknown format
        logger.warn('Unknown DNS records JSON format, skipping migration');
        return 0;
      }
      
      logger.info(`Migrated ${migratedCount} DNS records from JSON`);
      
      // Keep JSON file as backup with timestamp
      if (migratedCount > 0) {
        const backupFile = `${sourceFile}.bak.${Date.now()}`;
        fs.copyFileSync(sourceFile, backupFile);
        logger.info(`Created backup of DNS records JSON at ${backupFile}`);

        // Create a marker file to indicate migration
        const markerFile = path.join(this.dataDir, '.dns_records_migrated');
        fs.writeFileSync(markerFile, new Date().toISOString());
      }
      
      return migratedCount;
    } catch (error) {
      logger.error(`Failed to migrate DNS records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate DNS records from old array format
   * @param {Array} records - Array of DNS records
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateOldFormatDnsRecords(records) {
    if (!Array.isArray(records) || records.length === 0) {
      logger.warn('No records to migrate from legacy format');
      return 0;
    }
    
    let migratedCount = 0;
    
    // Start a transaction
    await this.db.beginTransaction();
    
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
        
        // Prepare record for database
        const dbRecord = {
          record_id: record.id,
          provider: record.provider,
          type: record.type,
          name: record.name,
          content: record.content || record.value || record.domain || '',
          ttl: record.ttl || 1,
          proxied: record.proxied === true ? 1 : 0,
          tracked_at: record.createdAt || record.updatedAt || new Date().toISOString(),
          is_orphaned: 0, // Assume not orphaned during migration
          orphaned_at: null,
          fingerprint: `${record.type}::${record.name}::${record.content || record.value || record.domain || ''}::${record.ttl || 1}::${record.proxied === true ? 1 : 0}`
        };
        
        await this.repositories.dnsRecord.create(dbRecord);
        migratedCount++;
        logger.debug(`Migrated record: ${record.name} (${record.type})`);
      }
      
      // Commit the transaction
      await this.db.commit();
      logger.info(`Migrated ${migratedCount} DNS records from legacy format`);
      
      return migratedCount;
    } catch (error) {
      // Rollback on error
      await this.db.rollback();
      logger.error(`Failed to migrate legacy format DNS records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate users from JSON
   * @returns {Promise<number>} - Number of migrated users
   */
  async migrateUsers() {
    const usersFile = path.join(this.dataDir, 'users.json');
    
    // Check if file exists
    if (!fs.existsSync(usersFile)) {
      logger.info('No users JSON file found, skipping migration');
      return 0;
    }
    
    try {
      const fileContent = fs.readFileSync(usersFile, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      // Migrate users
      const migratedCount = await this.repositories.user.migrateFromJson(jsonData);
      logger.info(`Migrated ${migratedCount} users from JSON`);
      
      // Keep JSON file as backup with timestamp
      if (migratedCount > 0) {
        const backupFile = `${usersFile}.bak.${Date.now()}`;
        fs.copyFileSync(usersFile, backupFile);
        logger.info(`Created backup of users JSON at ${backupFile}`);

        // Create a marker file to indicate migration
        const markerFile = path.join(this.dataDir, '.users_migrated');
        fs.writeFileSync(markerFile, new Date().toISOString());
      }
      
      return migratedCount;
    } catch (error) {
      logger.error(`Failed to migrate users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate revoked tokens from JSON
   * @returns {Promise<number>} - Number of migrated tokens
   */
  async migrateRevokedTokens() {
    const tokensFile = path.join(this.dataDir, 'revoked-tokens.json');
    
    // Check if file exists
    if (!fs.existsSync(tokensFile)) {
      logger.info('No revoked tokens JSON file found, skipping migration');
      return 0;
    }
    
    try {
      const fileContent = fs.readFileSync(tokensFile, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
        logger.info('No revoked tokens to migrate');
        return 0;
      }
      
      // Filter out expired tokens
      const now = Date.now();
      const validTokens = jsonData.filter(token => token.expiresAt > now);
      
      if (validTokens.length === 0) {
        logger.info('All tokens have expired, skipping migration');
        return 0;
      }
      
      // Migrate tokens
      let migratedCount = 0;
      
      await this.db.beginTransaction();
      
      try {
        for (const token of validTokens) {
          await this.repositories.revokedToken.create({
            token_hash: token.token,
            revoked_at: new Date(token.revokedAt || Date.now()).toISOString(),
            expires_at: new Date(token.expiresAt).toISOString()
          });
          migratedCount++;
        }
        
        await this.db.commit();
        logger.info(`Migrated ${migratedCount} revoked tokens from JSON`);
        
        // Keep JSON file as backup with timestamp
        if (migratedCount > 0) {
          const backupFile = `${tokensFile}.bak.${Date.now()}`;
          fs.copyFileSync(tokensFile, backupFile);
          logger.info(`Created backup of revoked tokens JSON at ${backupFile}`);

          // Create a marker file to indicate migration
          const markerFile = path.join(this.dataDir, '.tokens_migrated');
          fs.writeFileSync(markerFile, new Date().toISOString());
        }
        
        return migratedCount;
      } catch (error) {
        await this.db.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to migrate revoked tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Migrate DNS tracked records from JSON
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateDnsTrackedRecords() {
    const trackerFile = path.join(this.dataDir, 'dns-records.json');
    const legacyTrackerFile = path.join(process.cwd(), 'dns-records.json');
    let totalMigrated = 0;

    // Check if file exists
    if (!fs.existsSync(trackerFile) && !fs.existsSync(legacyTrackerFile)) {
      logger.info('No DNS tracked records JSON file found, attempting to migrate from active DNS records');

      // Even without a JSON file, we'll try to migrate from active DNS records
      try {
        totalMigrated = await this.migrateActiveRecords();
        if (totalMigrated > 0) {
          logger.info(`Migrated ${totalMigrated} active DNS records to tracker`);
        }
        return totalMigrated;
      } catch (activeError) {
        logger.error(`Failed to migrate active DNS records: ${activeError.message}`);
        return 0;
      }
    }

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

      // Migrate tracked records using the repository
      const migratedCount = await this.repositories.dnsTrackedRecord.migrateFromJson(jsonData);
      logger.info(`Migrated ${migratedCount} DNS tracked records from JSON`);

      totalMigrated += migratedCount;

      // Keep JSON file as backup with timestamp
      if (migratedCount > 0) {
        const backupFile = `${sourceFile}.bak.${Date.now()}`;
        fs.copyFileSync(sourceFile, backupFile);
        logger.info(`Created backup of DNS tracked records JSON at ${backupFile}`);

        // Create a marker file to indicate migration
        const markerFile = path.join(this.dataDir, '.dns_tracked_records_migrated');
        fs.writeFileSync(markerFile, new Date().toISOString());
      }

      // As a final step, try to also migrate any active DNS records that weren't in the JSON file
      try {
        const additionalMigrated = await this.migrateActiveRecords();
        if (additionalMigrated > 0) {
          logger.info(`Migrated ${additionalMigrated} additional active DNS records to tracker`);
          totalMigrated += additionalMigrated;
        }
      } catch (activeError) {
        logger.warn(`Failed to migrate additional active records: ${activeError.message}`);
      }

      return totalMigrated;
    } catch (error) {
      logger.error(`Failed to migrate DNS tracked records: ${error.message}`);

      // Even if JSON migration fails, try active records
      try {
        logger.info('Attempting to migrate from active DNS records instead');
        const activeMigrated = await this.migrateActiveRecords();
        if (activeMigrated > 0) {
          logger.info(`Migrated ${activeMigrated} active DNS records to tracker`);
          return activeMigrated;
        }
      } catch (activeError) {
        logger.error(`Failed to migrate active DNS records: ${activeError.message}`);
      }

      return 0; // Return 0 instead of re-throwing to avoid stopping other migrations
    }
  }

  /**
   * Migrate active DNS records from the DNS repository to the tracking system
   * @returns {Promise<number>} - Number of migrated records
   */
  async migrateActiveRecords() {
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

      // Track each active record in the tracking system
      let migratedCount = 0;

      await this.db.beginTransaction();

      try {
        for (const record of dnsRecords) {
          // Check if this record is already being tracked
          const isTracked = await this.repositories.dnsTrackedRecord.isTracked(
            record.provider,
            record.record_id
          );

          if (!isTracked) {
            await this.repositories.dnsTrackedRecord.trackRecord({
              provider: record.provider,
              record_id: record.record_id,
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied,
              tracked_at: record.created_at || new Date().toISOString()
            });

            migratedCount++;
          }
        }

        await this.db.commit();
        logger.info(`Successfully migrated ${migratedCount} active DNS records to tracking system`);

        return migratedCount;
      } catch (transactionError) {
        await this.db.rollback();
        throw transactionError;
      }
    } catch (error) {
      logger.error(`Failed to migrate active DNS records: ${error.message}`);
      return 0;
    }
  }
}

module.exports = DatabaseMigrator;