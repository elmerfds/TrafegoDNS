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
    logger.error('No SQLite implementation available. Application requires SQLite to function.');
    logger.error('Please install one of the following packages:');
    logger.error('  npm install better-sqlite3 --save');
    logger.error('  or npm install sqlite3 --save');
    throw new Error('SQLite implementation not found. Cannot continue without a database.');
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
      logger.error('Failed to initialize SQLite database');
      logger.error('Application requires SQLite to function properly');
      logger.error('Please check database permissions and ensure SQLite is properly configured');
      initialized = false;
      return false;
    }

    // Perform one-time migration from JSON if needed and files exist
    if (migrateJson) {
      try {
        // Perform data migration if needed
        const migrationResult = await migrator.migrateFromJson();

        if (migrationResult > 0) {
          logger.info(`Successfully migrated ${migrationResult} records from JSON to SQLite`);
          logger.info('All data is now stored in SQLite database. JSON files are no longer used.');
        }
      } catch (migrationError) {
        // Log migration error but continue since the database itself is initialized
        logger.warn(`Could not migrate from JSON: ${migrationError.message}`);
        logger.warn('Will continue with SQLite database without migration');
      }
    }

    // Set initialized flag
    initialized = true;
    logger.info('Database and repositories initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    logger.error('Application requires SQLite to function properly');
    initialized = false;
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
  return initialized && (db.isConnected !== undefined ? db.isConnected : true);
}

module.exports = {
  db,
  repositories,
  migrator,
  initialize,
  isInitialized
};