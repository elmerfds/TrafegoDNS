/**
 * SQLite Database Connection Manager
 * A simplified approach to database connections that's more reliable
 */
const logger = require('../utils/logger');
const sqliteCore = require('./sqlite-core');

// Singleton connection
let isInitialized = false;
let initializationPromise = null;

/**
 * Initialize the database connection
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  // If already initialized, return success
  if (isInitialized) {
    return true;
  }
  
  // If initialization is already in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Start initialization
  initializationPromise = (async () => {
    try {
      logger.info('Initializing database connection with optimized approach');
      const success = await sqliteCore.initialize();
      
      if (success) {
        isInitialized = true;
        logger.info('Database successfully initialized with optimized approach');
        return true;
      } else {
        logger.error('Failed to initialize database with optimized approach');
        return false;
      }
    } catch (error) {
      logger.error(`Error initializing database: ${error.message}`);
      return false;
    } finally {
      // Reset the initialization promise
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

/**
 * Check if the database is initialized
 * @returns {boolean} Whether the database is initialized
 */
function getInitializationStatus() {
  return isInitialized;
}

/**
 * Get the database connection
 * @returns {Object} Database connection
 */
function getConnection() {
  if (!isInitialized) {
    logger.warn('Attempting to get database connection before initialization');
  }
  
  return sqliteCore;
}

/**
 * Close the database connection
 * @returns {Promise<boolean>} Success status
 */
async function close() {
  try {
    if (isInitialized) {
      sqliteCore.close();
      isInitialized = false;
      logger.info('Database connection closed');
    }
    
    return true;
  } catch (error) {
    logger.error(`Error closing database connection: ${error.message}`);
    return false;
  }
}
}

module.exports = {
  initialize,
  isInitialized: getInitializationStatus,
  db: sqliteCore,
  close
};