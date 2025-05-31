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
const { createOrphanedRecordsHistory } = require('./migrations/createOrphanedRecordsHistory');

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
 * @param {Object} options - Additional initialization options
 * @param {Array<string>} [options.onlyRepositories] - Only initialize specific repositories
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
async function initialize(migrate = true, options = {}) {
  // If already initialized, return early unless forced
  if (initialized && !options.force) {
    return true;
  }

  try {
    logger.info('Initializing database connection...');
    
    // Initialize connection
    const success = await connection.initialize();
    if (!success) {
      throw new Error('Failed to initialize database connection');
    }
    
    // Set db reference to the actual database object
    db = connection.db;

    // Determine which repositories to initialize
    const onlyRepositories = options.onlyRepositories || null;
    const shouldInitializeRepo = (name) => !onlyRepositories || onlyRepositories.includes(name);
    
    // Create repositories if they don't exist yet or reinitialization is forced
    if (!repositories || Object.keys(repositories).length === 0 || options.force) {
      repositories = repositories || {};
      
      // Core repositories that should always be available
      if (shouldInitializeRepo('user') && (!repositories.user || options.force)) {
        repositories.user = new UserRepository(db);
      }
      
      if (shouldInitializeRepo('revokedToken') && (!repositories.revokedToken || options.force)) {
        repositories.revokedToken = new RevokedTokenRepository(db);
      }
      
      if (shouldInitializeRepo('setting') && (!repositories.setting || options.force)) {
        repositories.setting = new SettingRepository(db);
      }
      
      if (shouldInitializeRepo('auditLog') && (!repositories.auditLog || options.force)) {
        repositories.auditLog = new AuditLogRepository(db);
      }
      
      // DNS Manager repository
      if (shouldInitializeRepo('dnsManager') && (!repositories.dnsManager || options.force)) {
        repositories.dnsManager = new DNSRepositoryManager(db);
      }
    }
    
    // Initialize each repository if it has an initialize method
    const initPromises = [];
    const initializedRepos = [];
    
    // Prioritize DNSRepositoryManager initialization to ensure it's available early
    // This helps avoid the "DNS Repository Manager not available" errors during startup
    const repoPriority = {
      dnsManager: 10,   // Highest priority
      setting: 5,       // Medium priority
      user: 3,          // Medium-low priority
      revokedToken: 2,  // Low priority
      auditLog: 1       // Lowest priority
    };
    
    // Sort repository entries by priority
    const sortedRepoEntries = Object.entries(repositories)
      .filter(([name]) => shouldInitializeRepo(name))
      .sort(([nameA], [nameB]) => {
        const priorityA = repoPriority[nameA] || 0;
        const priorityB = repoPriority[nameB] || 0;
        return priorityB - priorityA; // Higher priority first
      });
    
    // Process in priority order
    for (const [name, repository] of sortedRepoEntries) {
      if (repository && repository.initialize && typeof repository.initialize === 'function') {
        try {
          // Add to promises array for initialization
          const initPromise = repository.initialize()
            .then(() => {
              logger.debug(`Initialized ${name} repository`);
              initializedRepos.push(name);
              return true;
            })
            .catch(repoInitError => {
              logger.warn(`⚠️ Error initializing ${name} repository: ${repoInitError.message}`);
              return false;
            });
          
          initPromises.push(initPromise);
        } catch (syncError) {
          logger.error(`Synchronous error during ${name} repository initialization setup: ${syncError.message}`);
        }
      }
    }
    
    // Wait for all repository initializations to complete
    if (initPromises.length > 0) {
      const results = await Promise.allSettled(initPromises);
      const failedRepos = results
        .map((result, index) => result.status === 'rejected' ? initializedRepos[index] : null)
        .filter(Boolean);
      
      if (failedRepos.length > 0) {
        logger.warn(`Some repositories failed to initialize: ${failedRepos.join(', ')}`);
      }
    }
    
    // Special DNS tables synchronization if migrations are requested and dnsManager exists
    if (migrate && repositories.dnsManager) {
      try {
        // Run all migrations in parallel for faster initialization
        await Promise.allSettled([
          // Last refreshed column migration
          (async () => {
            try {
              await addLastRefreshedToProviderCache(db);
              logger.info('last_refreshed column migration completed');
            } catch (migrationError) {
              logger.error(`Failed to run last_refreshed column migration: ${migrationError.message}`);
            }
          })(),
          
          // Ensure last_refreshed column exists
          (async () => {
            try {
              await ensureLastRefreshedColumn(db);
              logger.info('Ensured last_refreshed column exists in dns_records table');
            } catch (ensureError) {
              logger.error(`Failed to ensure last_refreshed column: ${ensureError.message}`);
            }
          })(),
          
          // Apply the constraint fixes
          (async () => {
            try {
              await fixSqliteConstraints(db);
              logger.info('Applied SQLite constraint fixes');
            } catch (constraintError) {
              logger.error(`Failed to fix SQLite constraints: ${constraintError.message}`);
            }
          })(),
          
          // Create orphaned records history table
          (async () => {
            try {
              await createOrphanedRecordsHistory(db);
              logger.info('Orphaned records history table ready');
            } catch (historyError) {
              logger.error(`Failed to create orphaned records history table: ${historyError.message}`);
            }
          })()
        ]);
        
        // Perform DNS tables synchronization
        // This needs to run after the other migrations complete
        try {
          await migrateDnsTables(db, repositories.dnsManager);
          logger.info('DNS tables migration completed successfully');
        } catch (migrateError) {
          logger.error(`Failed to migrate DNS tables: ${migrateError.message}`);
        }
      } catch (error) {
        logger.error(`Failed to synchronize DNS tables: ${error.message}`);
        // Continue initialization - this isn't critical
      }
    }

    // Mark as initialized - even partial initialization is better than none
    initialized = true;
    
    // Return the successful initialization result
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    
    // Check if we can mark as partially initialized for operations that don't need everything
    if (db && db.isInitialized && repositories && Object.keys(repositories).length > 0) {
      logger.warn('Database partially initialized - some features may be limited');
      initialized = true;
      return true;
    }
    
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
 * Reinitialize database after corruption recovery
 * This updates all repository references to use the new database connection
 * @returns {Promise<boolean>}
 */
async function reinitializeAfterRecovery() {
  try {
    logger.info('Reinitializing database repositories after recovery...');
    
    // Get the new database connection
    db = connection;
    
    // Update all repository database references
    for (const [name, repository] of Object.entries(repositories)) {
      if (repository && typeof repository === 'object') {
        // Update the db reference in each repository
        if (repository.repositories) {
          // This is a manager with sub-repositories
          for (const [subName, subRepo] of Object.entries(repository.repositories)) {
            if (subRepo && subRepo.db !== undefined) {
              subRepo.db = db;
              logger.debug(`Updated database reference for ${name}.${subName}`);
            }
          }
        } else if (repository.db !== undefined) {
          // This is a direct repository
          repository.db = db;
          logger.debug(`Updated database reference for ${name}`);
        }
      }
    }
    
    logger.info('Database repositories reinitialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to reinitialize repositories: ${error.message}`);
    return false;
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
  reinitializeAfterRecovery,
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