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

    try {
      let totalMigrated = 0;

      // Migrate DNS records first
      const dnsRecordsMigrated = await this.migrateDnsRecords();
      totalMigrated += dnsRecordsMigrated;

      // Migrate users
      const usersMigrated = await this.migrateUsers();
      totalMigrated += usersMigrated;

      // Migrate tokens
      const tokensMigrated = await this.migrateRevokedTokens();
      totalMigrated += tokensMigrated;

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
}

module.exports = DatabaseMigrator;