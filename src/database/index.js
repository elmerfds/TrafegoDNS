/**
 * Database Module
 * Central entry point for database operations
 */
const logger = require('../utils/logger');
const connection = require('./connection');
const { migrateDnsTables } = require('./migrations/dnsTablesMigration');
const { addLastRefreshedToProviderCache } = require('./migrations/addLastRefreshedToProviderCache');
const { ensureLastRefreshedColumn } = require('./migrations/ensureLastRefreshedColumn');
const { fixSqliteConstraints } = require('./migrations/fixSqliteConstraints');

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
    
    // Initialize connection
    const success = await connection.initialize();
    if (!success) {
      throw new Error('Failed to initialize database connection');
    }
    
    // Set db reference to the connection
    db = connection;

    // Create repositories
    try {
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
          try {
            await repository.initialize();
            logger.debug(`Initialized ${name} repository`);
          } catch (repoInitError) {
            logger.warn(`⚠️ Error initializing ${name} repository: ${repoInitError.message}`);
            // Continue with other repositories
          }
        }
      }
    } catch (repoError) {
      logger.error(`Failed to create repositories: ${repoError.message}`);
      logger.debug(repoError.stack);
      // Continue with initialization, treat repositories as partial
    }
    
    // Special DNS tables synchronization
    if (repositories.dnsManager) {
      try {
        // Run custom migrations
        try {
          await addLastRefreshedToProviderCache(db);
          logger.info('last_refreshed column migration completed');
        } catch (migrationError) {
          logger.error(`Failed to run last_refreshed column migration: ${migrationError.message}`);
          // Continue with other migrations
        }
        
        // Additional attempt to ensure last_refreshed column exists
        try {
          await ensureLastRefreshedColumn(db);
          logger.info('Ensured last_refreshed column exists in dns_records table');
        } catch (ensureError) {
          logger.error(`Failed to ensure last_refreshed column: ${ensureError.message}`);
          // Continue with other migrations
        }
        
        // Apply the constraint fixes
        try {
          await fixSqliteConstraints(db);
          logger.info('Applied SQLite constraint fixes');
        } catch (constraintError) {
          logger.error(`Failed to fix SQLite constraints: ${constraintError.message}`);
          // Continue with other migrations
        }
        
        // Perform DNS tables synchronization
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
 * Check if database is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return initialized || forceInitialized || (db && db.isInitialized === true);
}

/**
 * Force initialized flag (used for testing and recovery)
 * @param {boolean} value - Value to set
 */
function setForceInitialized(value) {
  forceInitialized = value;
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
    await connection.close();
    db = null;
    initialized = false;
    return true;
  } catch (error) {
    logger.error(`Error closing database connection: ${error.message}`);
    return false;
  }
}

// Export the database module with proper getters for db and repositories
module.exports = {
  initialize,
  isInitialized,
  setForceInitialized,
  close,
  get db() {
    return db;
  },
  get repositories() {
    return repositories;
  },
  get forceInitialized() {
    return forceInitialized;
  },
  set forceInitialized(value) {
    forceInitialized = value;
  }
};