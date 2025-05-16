/**
 * Simple Database Module
 * A simpler approach to database operations
 */
const logger = require('../utils/logger');
const connection = require('./simple-connection');
const SimpleTrackedRepository = require('./simple-tracked-repository');

// Database singleton
const db = connection.db;
let repositories = {};
let initialized = false;

/**
 * Initialize database and repositories
 * @returns {Promise<boolean>} Success status
 */
async function initialize() {
  if (initialized) {
    return true;
  }
  
  try {
    logger.info('Initializing simplified database system');
    
    // Initialize connection
    const connectionSuccess = await connection.initialize();
    if (!connectionSuccess) {
      throw new Error('Failed to initialize database connection');
    }
    
    // Create repositories
    repositories = {
      trackedRecords: new SimpleTrackedRepository(db)
    };
    
    initialized = true;
    logger.info('Simplified database system initialized successfully');
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize simplified database: ${error.message}`);
    return false;
  }
}

/**
 * Check if database is initialized
 * @returns {boolean} Whether database is initialized
 */
function isInitialized() {
  return initialized && connection.isInitialized();
}

/**
 * Close database connection
 * @returns {Promise<boolean>} Success status
 */
async function close() {
  try {
    await connection.close();
    initialized = false;
    repositories = {};
    logger.info('Simple database closed');
    return true;
  } catch (error) {
    logger.error(`Error closing simple database: ${error.message}`);
    return false;
  }
}

module.exports = {
  initialize,
  isInitialized,
  close,
  get db() {
    return db;
  },
  get repositories() {
    return repositories;
  }
};