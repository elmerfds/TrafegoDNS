/**
 * Database module entry point
 * Initializes and exports database connection, repositories, and utilities
 */
const db = require('./connection');
const logger = require('../utils/logger');

// Import repositories
const DnsRecordRepository = require('./repository/dnsRecordRepository');
const UserRepository = require('./repository/userRepository');
const RevokedTokenRepository = require('./repository/revokedTokenRepository');
const SettingRepository = require('./repository/settingRepository');
const AuditLogRepository = require('./repository/auditLogRepository');

// Import migrator
const DatabaseMigrator = require('./migrator');

// Repository instances
const repositories = {
  dnsRecord: new DnsRecordRepository(db),
  user: new UserRepository(db),
  revokedToken: new RevokedTokenRepository(db),
  setting: new SettingRepository(db),
  auditLog: new AuditLogRepository(db)
};

// Migrator instance
const migrator = new DatabaseMigrator(db, repositories);

/**
 * Initialize the database and repositories
 * @param {boolean} migrateJson - Whether to migrate from JSON files
 * @returns {Promise<boolean>} - Success status
 */
async function initialize(migrateJson = true) {
  try {
    // Initialize database connection
    const dbInitSuccess = await db.initialize();
    
    if (!dbInitSuccess) {
      logger.warn('Failed to initialize SQLite database, falling back to JSON storage');
      return false;
    }
    
    // Migrate from JSON if needed
    if (migrateJson) {
      await migrator.migrateFromJson();
    }
    
    // Set initialized flag
    initialized = true;
    logger.info('Database and repositories initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    return false;
  }
}

// Global state
let initialized = false;

/**
 * Check if database is initialized
 * @returns {boolean} - Whether database is initialized
 */
function isInitialized() {
  return initialized && db.isConnected;
}

module.exports = {
  db,
  repositories,
  migrator,
  initialize,
  isInitialized
};