/**
 * Database Module
 * A reliable approach to database operations
 */
const logger = require('../utils/logger');
const connection = require('./connection');
const TrackedRepository = require('./tracked-repository');

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
    logger.info('Initializing database system');
    
    // Initialize connection
    const connectionSuccess = await connection.initialize();
    if (!connectionSuccess) {
      throw new Error('Failed to initialize database connection');
    }
    
    // Create repositories
    repositories = {
      trackedRecords: new TrackedRepository(db)
    };
    
    initialized = true;
    logger.info('Database system initialized successfully');
    
    return true;
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
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
    logger.info('Database closed');
    return true;
  } catch (error) {
    logger.error(`Error closing database: ${error.message}`);
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