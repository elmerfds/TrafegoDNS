/**
 * Simple SQLite Manager for Record Tracking
 */
const logger = require('../logger');
const simpleDatabase = require('../../database/simple-database');

class SimpleSqliteManager {
  constructor() {
    this.initialized = false;
    this.trackedRepository = null;
  }
  
  /**
   * Initialize the SQLite manager
   * @returns {boolean} Success status
   */
  initialize() {
    try {
      // Check if database is available
      if (!simpleDatabase.isInitialized()) {
        logger.debug('Simple database not initialized, initializing now');
        const initPromise = simpleDatabase.initialize();
        
        // We'll continue and check later if initialization completed
        logger.debug('Continuing with initialization in background');
      }
      
      // Set initialized flag - we'll check actual database status when needed
      this.initialized = true;
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize simple SQLite manager: ${error.message}`);
      this.initialized = false;
      return false;
    }
  }
  
  /**
   * Check if SQLite is ready to use
   * @returns {boolean} Whether SQLite is ready
   */
  isInitialized() {
    return this.initialized && simpleDatabase.isInitialized();
  }
  
  /**
   * Track a record in SQLite
   * @param {string} provider - Provider name
   * @param {Object} record - Record to track
   * @returns {Promise<boolean>} Success status
   */
  async trackRecord(provider, record) {
    // Ensure we have a valid record to track
    if (!record) {
      logger.warn('Cannot track null/undefined record');
      return false;
    }
    
    // Validate provider
    provider = provider || 'unknown';
    
    try {
      // Ensure database is initialized
      if (!simpleDatabase.isInitialized()) {
        logger.warn('Simple database not fully initialized, cannot track record');
        return false;
      }
      
      // Get tracked records repository
      const repository = simpleDatabase.repositories.trackedRecords;
      if (!repository) {
        logger.warn('Tracked records repository not available');
        return false;
      }
      
      // Track the record
      return await repository.trackRecord(provider, record);
    } catch (error) {
      logger.error(`Failed to track record in simple SQLite: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get all tracked records
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Tracked records
   */
  async loadTrackedRecordsFromDatabase(provider) {
    try {
      // Ensure database is initialized
      if (!simpleDatabase.isInitialized()) {
        logger.warn('Simple database not fully initialized, returning empty records');
        return { providers: { [provider || 'unknown']: { records: {} } } };
      }
      
      // Get tracked records repository
      const repository = simpleDatabase.repositories.trackedRecords;
      if (!repository) {
        logger.warn('Tracked records repository not available');
        return { providers: { [provider || 'unknown']: { records: {} } } };
      }
      
      // Get provider-specific records if provider specified
      if (provider) {
        const providerRecords = await repository.getProviderRecords(provider);
        return { 
          providers: { 
            [provider]: providerRecords 
          } 
        };
      }
      
      // Otherwise get all records
      return await repository.getAllTrackedRecords();
    } catch (error) {
      logger.error(`Failed to load tracked records from simple SQLite: ${error.message}`);
      return { providers: { [provider || 'unknown']: { records: {} } } };
    }
  }
  
  /**
   * Check if a record is tracked
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    try {
      // Ensure database is initialized
      if (!simpleDatabase.isInitialized()) {
        logger.warn('Simple database not fully initialized, cannot check if record is tracked');
        return false;
      }
      
      // Get tracked records repository
      const repository = simpleDatabase.repositories.trackedRecords;
      if (!repository) {
        logger.warn('Tracked records repository not available');
        return false;
      }
      
      return await repository.isTracked(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is tracked in simple SQLite: ${error.message}`);
      return false;
    }
  }
}

// Export a singleton instance
module.exports = new SimpleSqliteManager();