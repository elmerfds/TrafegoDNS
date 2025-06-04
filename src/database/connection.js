/**
 * SQLite Database Connection Manager
 * Enhanced with connection pooling and transaction support
 */
const logger = require('../utils/logger');
const sqliteCore = require('./sqlite-core');
const { pool } = require('./connectionPool');

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
      logger.info('Initializing database connection with connection pooling');
      
      // Initialize core SQLite connection
      const coreSuccess = await sqliteCore.initialize();
      if (!coreSuccess) {
        logger.error('Failed to initialize SQLite core');
        return false;
      }
      
      // Initialize connection pool
      const poolSuccess = await pool.initialize();
      if (!poolSuccess) {
        logger.error('Failed to initialize connection pool');
        return false;
      }
      
      isInitialized = true;
      logger.info('Database successfully initialized with connection pooling');
      return true;
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
 * Get the connection pool
 * @returns {Object} Connection pool
 */
function getPool() {
  if (!isInitialized) {
    logger.warn('Attempting to get connection pool before initialization');
  }
  
  return pool;
}

/**
 * Close the database connection
 * @returns {Promise<boolean>} Success status
 */
async function close() {
  try {
    if (isInitialized) {
      // Shutdown connection pool first
      await pool.shutdown();
      
      // Then close the core connection
      sqliteCore.close();
      isInitialized = false;
      logger.info('Database connection and pool closed');
    }
    
    return true;
  } catch (error) {
    logger.error(`Error closing database connection: ${error.message}`);
    return false;
  }
}

module.exports = {
  initialize,
  isInitialized: getInitializationStatus,
  db: sqliteCore,
  pool: getPool,
  close
};