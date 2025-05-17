/**
 * SQLite Manager for Record Tracking
 */
const logger = require('../logger');
const database = require('../../database');

class SQLiteManager {
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
      if (!database.isInitialized()) {
        logger.debug('Database not initialized, initializing now');
        const initPromise = database.initialize();
        
        // We'll continue and check later if initialization completed
        logger.debug('Continuing with initialization in background');
      }
      
      // Set initialized flag - we'll check actual database status when needed
      this.initialized = true;
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SQLite manager: ${error.message}`);
      this.initialized = false;
      return false;
    }
  }
  
  /**
   * Check if SQLite is ready to use
   * @returns {boolean} Whether SQLite is ready
   */
  isInitialized() {
    return this.initialized && database.isInitialized();
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
      // Ensure database is initialized - use the main database instead of database
      // This prevents duplicate warnings when database fails
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.repositories && mainDatabase.repositories.dnsTrackedRecords) {
        try {
          // Track the record using the main database system
          const result = await mainDatabase.repositories.dnsTrackedRecords.trackRecord({
            provider: provider,
            record_id: record.id || record.record_id,
            type: record.type || 'UNKNOWN',
            name: record.name || (record.id || record.record_id),
            content: record.content || '',
            ttl: record.ttl || 1,
            proxied: record.proxied === true ? 1 : 0,
            priority: record.priority || 0,
            metadata: JSON.stringify({
              appManaged: record.metadata?.appManaged === true,
              trackedAt: new Date().toISOString()
            })
          });
          return true;
        } catch (mainDbError) {
          // If main tracking fails, log at debug level and continue with database
          logger.debug(`Main database tracking failed: ${mainDbError.message}`);
        }
      }
      
      // If database isn't initialized yet, try to initialize it
      if (!database.isInitialized()) {
        // Try to initialize the database again
        try {
          await database.initialize();
        } catch (initError) {
          // Log at debug level to reduce noise
          logger.debug(`Database initialization failed: ${initError.message}`);
          return false;
        }
        
        // Check if initialization succeeded
        if (!database.isInitialized()) {
          // Log at debug level to reduce noise
          logger.debug('Database not initialized after retry');
          return false;
        }
      }
      
      // Get tracked records repository
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        // Silently fail to avoid duplicate logs
        return false;
      }
      
      // Track the record
      return await repository.trackRecord(provider, record);
    } catch (error) {
      // Update the record in memory and continue silently
      if (!this.memoryRecords) {
        this.memoryRecords = new Map();
      }
      
      // Store in memory as fallback
      const recordKey = `${provider}:${record.id || record.record_id}`;
      this.memoryRecords.set(recordKey, {
        ...record,
        provider,
        tracked_at: new Date().toISOString()
      });
      
      // Log at debug level to reduce noise
      logger.debug(`Using memory-only tracking for record: ${recordKey}`);
      return true;
    }
  }
  
  /**
   * Get all tracked records
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} Tracked records
   */
  async loadTrackedRecordsFromDatabase(provider) {
    try {
      // Try using the main database first since that's more likely to work
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsTrackedRecords) {
        try {
          // Get all tracked records for this provider from the main database
          const records = await mainDatabase.repositories.dnsTrackedRecords.findByProvider(provider);
          
          // Convert to the expected format
          const formattedRecords = {};
          for (const record of records) {
            formattedRecords[record.providerId] = {
              id: record.providerId,
              record_id: record.providerId,
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied === 1,
              priority: record.priority,
              provider: record.provider,
              metadata: {
                appManaged: record.isAppManaged === 1,
                orphaned: record.isOrphaned === 1,
                orphanedAt: record.orphanedAt
              }
            };
          }
          
          return { 
            providers: { 
              [provider || 'unknown']: { 
                records: formattedRecords 
              } 
            } 
          };
        } catch (dbError) {
          // Fall back to database
          logger.debug(`Failed to load records from main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database if main database failed
      // Ensure database is initialized
      if (!database.isInitialized()) {
        // Log at debug level instead of warn to reduce noise
        logger.debug('Database not fully initialized, returning empty records');
        return { providers: { [provider || 'unknown']: { records: {} } } };
      }
      
      // Get tracked records repository
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        // Log at debug level instead of warn to reduce noise
        logger.debug('Tracked records repository not available');
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
      logger.debug(`Failed to load tracked records from SQLite: ${error.message}`);
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
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsTrackedRecords) {
        try {
          // Check if record exists in main database
          return await mainDatabase.repositories.dnsTrackedRecords.isTracked(recordId, provider);
        } catch (dbError) {
          // Fall back to database
          logger.debug(`Failed to check tracking in main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        // Log at debug level instead of warn to reduce noise
        logger.debug('Database not fully initialized, cannot check if record is tracked');
        return false;
      }
      
      // Get tracked records repository
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        // Log at debug level instead of warn to reduce noise
        logger.debug('Tracked records repository not available');
        return false;
      }
      
      return await repository.isTracked(provider, recordId);
    } catch (error) {
      logger.debug(`Failed to check if record is tracked in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Update record ID
   * @param {string} provider - Provider name
   * @param {string} oldRecordId - Old record ID
   * @param {string} newRecordId - New record ID
   * @returns {Promise<boolean>} Success status
   */
  async updateRecordId(provider, oldRecordId, newRecordId) {
    // Implementation to be added if needed
    return false;
  }

  /**
   * Mark record as orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Success status
   */
  async markRecordOrphaned(provider, recordId) {
    // Implementation to be added if needed
    return false;
  }

  /**
   * Unmark record as orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Success status
   */
  async unmarkRecordOrphaned(provider, recordId) {
    // Implementation to be added if needed
    return false;
  }

  /**
   * Check if record is orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Whether record is orphaned
   */
  async isRecordOrphaned(provider, recordId) {
    // Implementation to be added if needed
    return false;
  }

  /**
   * Get record orphaned time
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} Orphaned time or null
   */
  async getRecordOrphanedTime(provider, recordId) {
    // Implementation to be added if needed
    return null;
  }
}

// Export a singleton instance
module.exports = new SQLiteManager();