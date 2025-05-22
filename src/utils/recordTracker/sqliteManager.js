/**
 * SQLite Manager for Record Tracking
 */
const logger = require('../logger');
const database = require('../../database');

class SQLiteManager {
  constructor() {
    this.initialized = false;
    this.trackedRepository = null;
    this.repository = null; // Reference to the tracked records repository
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
      
      // Try to get the repository reference
      if (database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.trackedRecords) {
        this.repository = database.repositories.dnsManager.trackedRecords;
        logger.debug('SQLite manager connected to tracked records repository');
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
    
    // Update repository reference if needed
    if (!this.repository && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.trackedRecords) {
      this.repository = database.repositories.dnsManager.trackedRecords;
    }
    
    try {
      // Import the DNS Manager Bridge
      const dnsManagerBridge = require('../../database/repository/dnsManagerBridge');
      
      // Try to track the record using the bridge
      const success = await dnsManagerBridge.trackRecord(provider, record);
      if (success) {
        return true;
      }
      
      // If bridge fails, fall back to direct database access
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked record repository
          const repository = mainDatabase.repositories.dnsManager.getTrackedRecordRepository();
          if (repository) {
            // Track the record using the repository
            await repository.trackRecord({
              provider: provider,
              record_id: record.id || record.record_id,
              type: record.type || 'UNKNOWN',
              name: record.name || (record.id || record.record_id),
              content: record.content || '',
              ttl: record.ttl || 1,
              proxied: record.proxied === true ? 1 : 0,
              metadata: {
                appManaged: record.metadata?.appManaged === true,
                trackedAt: new Date().toISOString()
              }
            });
            return true;
          }
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
      // Import the DNS Manager Bridge
      const dnsManagerBridge = require('../../database/repository/dnsManagerBridge');
      
      // Try to get the records using the bridge
      await dnsManagerBridge.initializeDnsRepositories();
      const providerRecords = await dnsManagerBridge.getProviderRecords(provider);
      
      if (providerRecords && providerRecords.records) {
        return { 
          providers: { 
            [provider || 'unknown']: providerRecords
          } 
        };
      }
      
      // If bridge fails, fall back to direct database access
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked record repository
          const repository = mainDatabase.repositories.dnsManager.getTrackedRecordRepository();
          if (repository) {
            // Get all records for this provider
            const records = await repository.getProviderRecords(provider);
            
            if (records && records.records) {
              return { 
                providers: { 
                  [provider || 'unknown']: records
                } 
              };
            }
          }
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
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            // Check if record exists in main database
            return await trackedRecordsRepo.isTracked(provider, recordId);
          }
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
    try {
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            return await trackedRecordsRepo.updateRecordId(provider, oldRecordId, newRecordId);
          }
        } catch (dbError) {
          logger.debug(`Failed to update record ID in main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        logger.debug('Database not fully initialized, cannot update record ID');
        return false;
      }
      
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        logger.debug('Tracked records repository not available');
        return false;
      }
      
      return await repository.updateRecordId(provider, oldRecordId, newRecordId);
    } catch (error) {
      logger.error(`Failed to update record ID in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Mark record as orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Success status
   */
  async markRecordOrphaned(provider, recordId) {
    try {
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            return await trackedRecordsRepo.markRecordOrphaned(provider, recordId);
          }
        } catch (dbError) {
          logger.debug(`Failed to mark record as orphaned in main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        logger.debug('Database not fully initialized, cannot mark record as orphaned');
        return false;
      }
      
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        logger.debug('Tracked records repository not available');
        return false;
      }
      
      return await repository.markRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to mark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Unmark record as orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Success status
   */
  async unmarkRecordOrphaned(provider, recordId) {
    try {
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            return await trackedRecordsRepo.unmarkRecordOrphaned(provider, recordId);
          }
        } catch (dbError) {
          logger.debug(`Failed to unmark record as orphaned in main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        logger.debug('Database not fully initialized, cannot unmark record as orphaned');
        return false;
      }
      
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        logger.debug('Tracked records repository not available');
        return false;
      }
      
      return await repository.unmarkRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to unmark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if record is orphaned
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} Whether record is orphaned
   */
  async isRecordOrphaned(provider, recordId) {
    try {
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            return await trackedRecordsRepo.isRecordOrphaned(provider, recordId);
          }
        } catch (dbError) {
          logger.debug(`Failed to check if record is orphaned in main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        logger.debug('Database not fully initialized, cannot check if record is orphaned');
        return false;
      }
      
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        logger.debug('Tracked records repository not available');
        return false;
      }
      
      return await repository.isRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Get record orphaned time
   * @param {string} provider - Provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} Orphaned time or null
   */
  async getRecordOrphanedTime(provider, recordId) {
    try {
      // Try using the main database first
      const mainDatabase = require('../../database');
      if (mainDatabase && mainDatabase.isInitialized() && mainDatabase.repositories && mainDatabase.repositories.dnsManager) {
        try {
          // Get the tracked records repository from DNS manager
          const trackedRecordsRepo = mainDatabase.repositories.dnsManager.trackedRecords;
          if (trackedRecordsRepo) {
            return await trackedRecordsRepo.getRecordOrphanedTime(provider, recordId);
          }
        } catch (dbError) {
          logger.debug(`Failed to get record orphaned time from main database: ${dbError.message}`);
        }
      }
      
      // Fall back to database
      if (!database.isInitialized()) {
        logger.debug('Database not fully initialized, cannot get record orphaned time');
        return null;
      }
      
      const repository = database.repositories.trackedRecords;
      if (!repository) {
        logger.debug('Tracked records repository not available');
        return null;
      }
      
      return await repository.getRecordOrphanedTime(provider, recordId);
    } catch (error) {
      logger.error(`Failed to get record orphaned time from SQLite: ${error.message}`);
      return null;
    }
  }

  /**
   * Save tracked records to database
   * @param {Object} recordData - Tracked records data structure
   * @returns {Promise<boolean>} Success status
   */
  async saveTrackedRecordsToDatabase(recordData) {
    try {
      logger.debug('SQLite Manager: saveTrackedRecordsToDatabase called');
      
      // Validate input
      if (!recordData || !recordData.providers) {
        logger.warn('Invalid recordData structure provided to saveTrackedRecordsToDatabase');
        return false;
      }

      // Since we store records directly in the database when they're created or updated,
      // we don't need to re-save the entire record set. This method exists for backward
      // compatibility with the RecordTracker class.
      
      // Return success to avoid error messages
      return true;
    } catch (error) {
      logger.error(`Failed to save tracked records to SQLite: ${error.message}`);
      return false;
    }
  }
}

// Export a singleton instance
module.exports = new SQLiteManager();