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
   * @returns {Promise<boolean>} - Success status
   */
  async migrateFromJson() {
    logger.info('Starting migration from JSON files to SQLite database');
    
    try {
      // Migrate DNS records first
      await this.migrateDnsRecords();
      
      // Migrate users
      await this.migrateUsers();
      
      // Migrate tokens
      await this.migrateRevokedTokens();
      
      logger.info('Migration from JSON to SQLite completed successfully');
      return true;
    } catch (error) {
      logger.error(`Migration failed: ${error.message}`);
      return false;
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
      if (fs.existsSync(dnsRecordsFile)) {
        fileContent = fs.readFileSync(dnsRecordsFile, 'utf8');
      } else {
        fileContent = fs.readFileSync(legacyDnsRecordsFile, 'utf8');
      }
      
      const jsonData = JSON.parse(fileContent);
      
      // Migrate records
      const migratedCount = await this.repositories.dnsRecord.migrateFromJson(jsonData);
      logger.info(`Migrated ${migratedCount} DNS records from JSON`);
      
      // Keep JSON file as backup with timestamp
      if (migratedCount > 0) {
        const backupFile = `${dnsRecordsFile}.bak.${Date.now()}`;
        fs.copyFileSync(fs.existsSync(dnsRecordsFile) ? dnsRecordsFile : legacyDnsRecordsFile, backupFile);
        logger.info(`Created backup of DNS records JSON at ${backupFile}`);
      }
      
      return migratedCount;
    } catch (error) {
      logger.error(`Failed to migrate DNS records: ${error.message}`);
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