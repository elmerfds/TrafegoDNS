/**
 * Database Module
 * Central entry point for database operations
 */
const logger = require('../utils/logger');
const connection = require('./connection');
const { migrateDnsTables } = require('./migrations/dnsTablesMigration');

// Import repositories
const UserRepository = require('./repository/userRepository');
const RevokedTokenRepository = require('./repository/revokedTokenRepository');
const SettingRepository = require('./repository/settingRepository');
const AuditLogRepository = require('./repository/auditLogRepository');
const DNSRepositoryManager = require('./repository/dnsRepositoryManager');

// Database singleton
let db = null;
let repositories = {};
let initialized = false;
let forceInitialized = false;

/**
 * Initialize database connection and repositories
 * @param {boolean} migrate - Whether to run migrations
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
async function initialize(migrate = true) {
  if (initialized) {
    return true;
  }

  try {
    logger.info('Initializing database connection...');
    db = await connection.connect();

    // Create repositories
    repositories = {
      user: new UserRepository(db),
      revokedToken: new RevokedTokenRepository(db),
      setting: new SettingRepository(db),
      auditLog: new AuditLogRepository(db),
      dnsManager: new DNSRepositoryManager(db)
    };
    
    // Initialize repositories
    for (const [name, repository] of Object.entries(repositories)) {
      if (repository.initialize && typeof repository.initialize === 'function') {
        await repository.initialize();
        logger.debug(`Initialized ${name} repository`);
      }
    }
    
    // Run migrations
    if (migrate) {
      logger.info('Database needs migration, running migrations...');
      await runMigrations();
    }

    // Special DNS tables synchronization
    if (repositories.dnsManager) {
      try {
        // Perform this after regular migrations
        await migrateDnsTables(db, repositories.dnsManager);
      } catch (error) {
        logger.error(`Failed to synchronize DNS tables: ${error.message}`);
        // Continue initialization - this isn't critical
      }
    }

    initialized = true;
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    throw error;
  }
}

/**
 * Run database migrations
 * @returns {Promise<boolean>}
 */
async function runMigrations() {
  try {
    // Run migrations here (schema changes, etc.)
    await createTables();
    
    return true;
  } catch (error) {
    logger.error(`Error running migrations: ${error.message}`);
    throw error;
  }
}

/**
 * Create database tables if they don't exist
 * This is a simple migration function
 * @returns {Promise<boolean>}
 */
async function createTables() {
  try {
    // Try to use repositories to create tables
    // This is typically already done in the repository initialization
    return true;
  } catch (error) {
    logger.error(`Error creating database tables: ${error.message}`);
    throw error;
  }
}

/**
 * Close database connection
 * @returns {Promise<boolean>}
 */
async function close() {
  if (!db) {
    return true;
  }

  try {
    await connection.close(db);
    db = null;
    initialized = false;
    return true;
  } catch (error) {
    logger.error(`Error closing database connection: ${error.message}`);
    return false;
  }
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return initialized || forceInitialized;
}

/**
 * Force initialized flag (used for testing and recovery)
 * @param {boolean} value - Value to set
 */
function setForceInitialized(value) {
  forceInitialized = value;
}

// Export the database module
module.exports = {
  initialize,
  isInitialized,
  setForceInitialized,
  close,
  runMigrations,
  db,
  repositories,
  get forceInitialized() {
    return forceInitialized;
  },
  set forceInitialized(value) {
    forceInitialized = value;
  }
};