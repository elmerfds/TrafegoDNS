/**
 * Database module entry point
 * Initializes and exports database connection, repositories, and utilities
 */
const logger = require('../utils/logger');

// Try to determine which SQLite implementation to use
let db;
try {
  // Check if better-sqlite3 is installed and can be loaded
  require.resolve('better-sqlite3');
  logger.debug('Using better-sqlite3 implementation');
  db = require('./better-sqlite');
} catch (error) {
  try {
    // Check if sqlite3/sqlite is installed and can be loaded
    require.resolve('sqlite3');
    logger.debug('Using sqlite3 implementation');
    db = require('./connection');
  } catch (error2) {
    logger.warn('No SQLite implementation available, will use JSON storage');
    // Create a dummy db object that will always return false for isInitialized
    db = {
      initialize: async () => false,
      isInitialized: () => false,
      close: async () => {}
    };
  }
}

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
 * @param {boolean} migrateJson - Whether to migrate from JSON files if they exist
 * @returns {Promise<boolean>} - Success status
 */
async function initialize(migrateJson = true) {
  try {
    // Initialize database connection
    const dbInitSuccess = await db.initialize();

    if (!dbInitSuccess) {
      logger.error('Failed to initialize SQLite database. Application requires SQLite to function.');
      return false;
    }

    // Perform one-time migration from JSON if needed and files exist
    if (migrateJson) {
      // Perform data migration if needed
      const migrationResult = await migrator.migrateFromJson();

      if (migrationResult > 0) {
        logger.info(`Successfully migrated ${migrationResult} records from JSON to SQLite`);
        logger.info('All data is now stored in SQLite database. JSON files are no longer used.');
      }
    }

    // Set initialized flag
    initialized = true;
    logger.info('Database and repositories initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    logger.error('Application requires SQLite to function. Please check your installation.');
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