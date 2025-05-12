/**
 * Database module entry point
 * Initializes and exports database connection, repositories, and utilities
 */
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Global state
let initialized = false;
let dbInitializing = false;
let migrationInProgress = false;

// Configuration
const DATA_DIR = path.join(process.env.CONFIG_DIR || '/config', 'data');
const DB_FILE = path.join(DATA_DIR, 'trafegodns.db');
const MIGRATION_LOCK_FILE = path.join(DATA_DIR, '.migration.lock');

// Helper function to check if migration is in progress
function checkMigrationLock() {
  try {
    if (fs.existsSync(MIGRATION_LOCK_FILE)) {
      // Check if lock is stale (older than 5 minutes)
      const stats = fs.statSync(MIGRATION_LOCK_FILE);
      const lockAge = Date.now() - stats.mtimeMs;
      if (lockAge > 5 * 60 * 1000) {
        // Lock is stale, remove it
        logger.warn('Removing stale migration lock file');
        fs.unlinkSync(MIGRATION_LOCK_FILE);
        return false;
      }
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error checking migration lock: ${error.message}`);
    return false;
  }
}

// Helper function to create migration lock
function createMigrationLock() {
  try {
    fs.writeFileSync(MIGRATION_LOCK_FILE, new Date().toISOString());
    migrationInProgress = true;
    return true;
  } catch (error) {
    logger.error(`Error creating migration lock: ${error.message}`);
    return false;
  }
}

// Helper function to release migration lock
function releaseMigrationLock() {
  try {
    if (fs.existsSync(MIGRATION_LOCK_FILE)) {
      fs.unlinkSync(MIGRATION_LOCK_FILE);
    }
    migrationInProgress = false;
    return true;
  } catch (error) {
    logger.error(`Error releasing migration lock: ${error.message}`);
    return false;
  }
}

// Try to determine which SQLite implementation to use
let db;
let repositories = {};
let migrator;

try {
  // Check if data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    logger.info(`Creating data directory: ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Check if better-sqlite3 is installed and can be loaded
  try {
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
      logger.error('No SQLite implementation available. Some features may not work.');
      logger.error('Please install one of the following packages:');
      logger.error('  npm install better-sqlite3 --save');
      logger.error('  or npm install sqlite3 --save');

      // Create a dummy db object
      db = {
        initialize: async () => false,
        isInitialized: () => false,
        isConnected: false,
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
  const DnsTrackedRecordRepository = require('./repository/dnsTrackedRecordRepository');

  // Repository instances
  repositories = {
    dnsRecord: new DnsRecordRepository(db),
    user: new UserRepository(db),
    revokedToken: new RevokedTokenRepository(db),
    setting: new SettingRepository(db),
    auditLog: new AuditLogRepository(db),
    dnsTrackedRecord: new DnsTrackedRecordRepository(db)
  };

  // Import migrator
  const DatabaseMigrator = require('./migrator');
  migrator = new DatabaseMigrator(db, repositories);

} catch (error) {
  logger.error(`Error setting up database module: ${error.message}`);
}

/**
 * Initialize the database and repositories
 * @param {boolean} migrateJson - Whether to migrate from JSON files if they exist
 * @returns {Promise<boolean>} - Success status
 */
async function initialize(migrateJson = true) {
  if (initialized) return true;
  if (dbInitializing) {
    logger.warn('Database initialization already in progress, waiting...');
    // Wait for initialization to complete
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (initialized) return true;
    }
    return false;
  }

  dbInitializing = true;

  try {
    logger.info('Initializing database connection...');

    // Check if database file exists and has permissions
    if (fs.existsSync(DB_FILE)) {
      try {
        const stats = fs.statSync(DB_FILE);
        const fileMode = stats.mode & parseInt('777', 8);
        logger.debug(`Database file exists with permissions: ${fileMode.toString(8)}`);

        // Check if file is readable and writable
        const readable = (fileMode & parseInt('444', 8)) !== 0;
        const writable = (fileMode & parseInt('222', 8)) !== 0;

        if (!readable || !writable) {
          logger.warn(`Database file has insufficient permissions: ${fileMode.toString(8)}`);
          logger.warn('Attempting to fix permissions...');
          fs.chmodSync(DB_FILE, 0o644);
          logger.info('Updated database file permissions to 644');
        }
      } catch (statError) {
        logger.warn(`Failed to check database file permissions: ${statError.message}`);
      }
    } else {
      logger.info(`Database file not found at ${DB_FILE}, it will be created`);

      // Ensure parent directory exists and is writable
      try {
        const dirStats = fs.statSync(DATA_DIR);
        const dirMode = dirStats.mode & parseInt('777', 8);

        if ((dirMode & parseInt('222', 8)) === 0) {
          logger.warn(`Data directory is not writable: ${dirMode.toString(8)}`);
          logger.warn('Attempting to fix permissions...');
          fs.chmodSync(DATA_DIR, 0o755);
          logger.info('Updated data directory permissions to 755');
        }
      } catch (dirError) {
        logger.warn(`Failed to check data directory permissions: ${dirError.message}`);
      }
    }

    // Check if another instance is running migration
    if (checkMigrationLock()) {
      logger.info('Migration already in progress by another process, skipping...');
      // We'll let the database connect without running migrations
      // Modified to connect to database without migrations
      try {
        // Initialize the db object directly, but tell it to skip migrations
        logger.debug('Connecting to database without running migrations...');
        if (typeof db.connectWithoutMigrations === 'function') {
          // If the db implementation has the connectWithoutMigrations function
          await db.connectWithoutMigrations();
        } else {
          // For compatibility with other implementations
          db.skipMigrations = true;
          await db.initialize();
          db.skipMigrations = false;
        }

        // Safe to continue without migration
        initialized = true;
        dbInitializing = false;
        logger.info('Connected to database successfully (migrations skipped)');
        return true;
      } catch (connectError) {
        logger.error(`Failed to connect to database without migrations: ${connectError.message}`);
        initialized = false;
        dbInitializing = false;
        return false;
      }
    }

    // Acquire migration lock
    createMigrationLock();

    try {
      // Initialize database connection with full migration support
      logger.debug('Calling db.initialize() with migrations...');
      const dbInitSuccess = await db.initialize();

      if (!dbInitSuccess) {
        logger.error('Failed to initialize SQLite database');
        logger.warn('Some features may not work without SQLite');
        releaseMigrationLock();
        dbInitializing = false;
        return false;
      }

      // Perform one-time migration from JSON if needed and files exist
      if (migrateJson) {
        try {
          // Perform data migration if needed
          logger.debug('Checking for JSON data to migrate...');
          const migrationResult = await migrator.migrateFromJson();

          if (migrationResult > 0) {
            logger.info(`Successfully migrated ${migrationResult} records from JSON to SQLite`);
            logger.info('All data is now stored in SQLite database. JSON files are kept as backup.');
          }
        } catch (migrationError) {
          // Log migration error but continue since the database itself is initialized
          logger.warn(`Could not migrate from JSON: ${migrationError.message}`);
          logger.warn('Will continue with SQLite database without migration');
        }
      }

      // Release migration lock after all migrations are complete
      releaseMigrationLock();
    } catch (error) {
      // Make sure to release the lock on error
      releaseMigrationLock();
      throw error;
    }

    // Set initialized flag
    initialized = true;
    dbInitializing = false;
    logger.info('Database and repositories initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    logger.error(error.stack);
    initialized = false;
    dbInitializing = false;
    return false;
  }
}

/**
 * Check if database is initialized
 * @returns {boolean} - Whether database is initialized
 */
function isInitialized() {
  return initialized && (db && db.isConnected !== undefined ? db.isConnected : true);
}

module.exports = {
  db,
  repositories,
  migrator,
  initialize,
  isInitialized
};