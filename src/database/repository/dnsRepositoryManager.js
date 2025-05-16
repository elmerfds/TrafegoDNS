/**
 * DNS Repository Manager
 * Manages the coordination between provider cache and managed records repositories
 * This provides a unified interface for DNS record operations while maintaining
 * clear separation between the provider's records and the app-managed records
 */
const logger = require('../../utils/logger');
const ProviderCacheRepository = require('./providerCacheRepository');
const ManagedRecordsRepository = require('./managedRecordsRepository');

class DNSRepositoryManager {
  constructor(db) {
    this.db = db;
    
    // Initialize both repositories
    this.providerCache = new ProviderCacheRepository(db);
    this.managedRecords = new ManagedRecordsRepository(db);
    
    // Set initialized flag
    this.initialized = false;
    
    logger.debug('DNS Repository Manager created');
  }

  /**
   * Initialize the repositories
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    try {
      await this.providerCache.initialize();
      await this.managedRecords.initialize();
      this.initialized = true;
      logger.info('DNS Repository Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DNS Repository Manager: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if the repository manager is initialized
   * @returns {boolean} - Whether the manager is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Refresh the provider cache with records from the DNS provider
   * @param {Array} records - Records from the provider
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Results of the refresh operation
   */
  async refreshProviderCache(records, provider) {
    try {
      logger.info(`Refreshing provider cache for ${provider} with ${records.length} records`);
      
      // Refresh the provider cache
      const refreshedCount = await this.providerCache.refreshCache(records, provider);
      
      // Return refresh results
      return {
        success: true,
        refreshedCount,
        provider
      };
    } catch (error) {
      logger.error(`Failed to refresh provider cache: ${error.message}`);
      return {
        success: false,
        error: error.message,
        provider
      };
    }
  }

  /**
   * Track a DNS record (add to managed records)
   * @param {Object} record - Record to track
   * @param {string} provider - Provider name
   * @param {boolean} isAppManaged - Whether the record is managed by the app
   * @returns {Promise<boolean>} - Success status
   */
  async trackRecord(record, provider, isAppManaged = true) {
    try {
      // Ensure provider is not null or undefined
      if (!provider) {
        logger.warn(`Provider is undefined for record ${record.name} (${record.type}) - using record's provider value or "unknown"`);
        provider = record.provider || 'unknown';
      }

      // Ensure record has all required fields
      if (!record.provider) {
        record.provider = provider;
      }
      
      logger.debug(`Tracking record ${record.name} (${record.type}) with ID ${record.id} for provider ${provider}`);
      
      return await this.managedRecords.trackRecord(provider, record, isAppManaged);
    } catch (error) {
      logger.error(`Failed to track record: ${error.message}`);
      return false;
    }
  }

  /**
   * Untrack a DNS record (remove from managed records)
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Success status
   */
  async untrackRecord(recordId, provider) {
    try {
      return await this.managedRecords.untrackRecord(provider, recordId);
    } catch (error) {
      logger.error(`Failed to untrack record: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is being tracked
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTracked(recordId, provider) {
    try {
      return await this.managedRecords.isTracked(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is tracked: ${error.message}`);
      return false;
    }
  }

  /**
   * Mark a record as orphaned
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Success status
   */
  async markRecordOrphaned(recordId, provider) {
    try {
      return await this.managedRecords.markRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to mark record as orphaned: ${error.message}`);
      return false;
    }
  }

  /**
   * Unmark a record as orphaned
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Success status
   */
  async unmarkRecordOrphaned(recordId, provider) {
    try {
      return await this.managedRecords.unmarkRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to unmark record as orphaned: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is orphaned
   * @param {string} recordId - Record ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} - Whether the record is orphaned
   */
  async isRecordOrphaned(recordId, provider) {
    try {
      return await this.managedRecords.isRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is orphaned: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all managed records
   * @param {string} provider - Provider name
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of managed records
   */
  async getManagedRecords(provider, options = {}) {
    try {
      return await this.managedRecords.getRecords(provider, options);
    } catch (error) {
      logger.error(`Failed to get managed records: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all records from provider cache
   * @param {string} provider - Provider name
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Array of provider records
   */
  async getProviderRecords(provider, options = {}) {
    try {
      return await this.providerCache.getRecords(provider, options);
    } catch (error) {
      logger.error(`Failed to get provider records: ${error.message}`);
      return [];
    }
  }

  /**
   * Find managed records that match a certain criteria
   * @param {string} provider - Provider name
   * @param {Object} criteria - Criteria to match (type, name, content)
   * @returns {Promise<Array>} - Array of matching records
   */
  async findManagedRecords(provider, criteria) {
    try {
      const options = {};
      
      if (criteria.type) options.type = criteria.type;
      if (criteria.name) options.name = criteria.name;
      if (criteria.isOrphaned !== undefined) options.isOrphaned = criteria.isOrphaned;
      if (criteria.isAppManaged !== undefined) options.isAppManaged = criteria.isAppManaged;
      
      const records = await this.managedRecords.getRecords(provider, options);
      
      // Further filter by content if provided
      if (criteria.content && records.length > 0) {
        return records.filter(record => record.content === criteria.content);
      }
      
      return records;
    } catch (error) {
      logger.error(`Failed to find managed records: ${error.message}`);
      return [];
    }
  }

  /**
   * Find provider records that match a certain criteria
   * @param {string} provider - Provider name
   * @param {Object} criteria - Criteria to match (type, name, content)
   * @returns {Promise<Array>} - Array of matching records
   */
  async findProviderRecords(provider, criteria) {
    try {
      const options = {};
      
      if (criteria.type) options.type = criteria.type;
      if (criteria.name) options.name = criteria.name;
      if (criteria.isOrphaned !== undefined) options.isOrphaned = criteria.isOrphaned;
      
      const records = await this.providerCache.getRecords(provider, options);
      
      // Further filter by content if provided
      if (criteria.content && records.length > 0) {
        return records.filter(record => record.content === criteria.content);
      }
      
      return records;
    } catch (error) {
      logger.error(`Failed to find provider records: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if provider cache needs a refresh
   * @param {string} provider - Provider name
   * @param {number} cacheTtl - Cache TTL in seconds (default 3600)
   * @returns {Promise<boolean>} - Whether cache needs refresh
   */
  async needsCacheRefresh(provider, cacheTtl = 3600) {
    try {
      return await this.providerCache.needsRefresh(provider, cacheTtl);
    } catch (error) {
      logger.error(`Failed to check if cache needs refresh: ${error.message}`);
      // On error, assume refresh is needed
      return true;
    }
  }

  /**
   * Compare provider cache with managed records
   * Identifies records that:
   * 1. Exist in provider but not in managed records (untracked)
   * 2. Exist in managed records but not in provider (orphaned)
   * 3. Exist in both but have different content (changed)
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Comparison results
   */
  async compareProviderWithManaged(provider) {
    try {
      // Get all records from both repositories
      const managedRecords = await this.managedRecords.getRecords(provider);
      const providerRecords = await this.providerCache.getRecords(provider);
      
      // Build maps for efficient lookup
      const managedMap = new Map();
      for (const record of managedRecords) {
        managedMap.set(record.providerId, record);
      }
      
      const providerMap = new Map();
      for (const record of providerRecords) {
        providerMap.set(record.providerId, record);
      }
      
      // Find untracked records (in provider but not managed)
      const untracked = [];
      for (const [id, record] of providerMap.entries()) {
        if (!managedMap.has(id)) {
          untracked.push(record);
        }
      }
      
      // Find orphaned records (in managed but not provider)
      const orphaned = [];
      for (const [id, record] of managedMap.entries()) {
        if (!providerMap.has(id)) {
          orphaned.push(record);
        }
      }
      
      // Find changed records (in both but different content)
      const changed = [];
      for (const [id, managedRecord] of managedMap.entries()) {
        const providerRecord = providerMap.get(id);
        if (providerRecord) {
          // Compare relevant fields
          if (managedRecord.type !== providerRecord.type ||
              managedRecord.name !== providerRecord.name ||
              managedRecord.content !== providerRecord.content ||
              managedRecord.ttl !== providerRecord.ttl ||
              managedRecord.proxied !== providerRecord.proxied) {
            changed.push({
              managed: managedRecord,
              provider: providerRecord
            });
          }
        }
      }
      
      return {
        untracked,
        orphaned,
        changed,
        managedCount: managedRecords.length,
        providerCount: providerRecords.length
      };
    } catch (error) {
      logger.error(`Failed to compare provider with managed records: ${error.message}`);
      return {
        untracked: [],
        orphaned: [],
        changed: [],
        managedCount: 0,
        providerCount: 0,
        error: error.message
      };
    }
  }

  /**
   * Ensure an orphaned record is properly marked
   * This is useful when a record is detected as orphaned but
   * hasn't been marked as such in the managed records
   * @param {string} provider - Provider name
   * @returns {Promise<number>} - Number of records marked as orphaned
   */
  async ensureOrphanedRecordsMarked(provider) {
    try {
      // Get the comparison
      const comparison = await this.compareProviderWithManaged(provider);
      
      let markedCount = 0;
      
      // Mark orphaned records
      for (const record of comparison.orphaned) {
        // Only mark if not already marked
        if (!record.isOrphaned) {
          const success = await this.managedRecords.markRecordOrphaned(
            provider, 
            record.providerId
          );
          
          if (success) {
            markedCount++;
          }
        }
      }
      
      logger.info(`Marked ${markedCount} records as orphaned for provider ${provider}`);
      return markedCount;
    } catch (error) {
      logger.error(`Failed to ensure orphaned records are marked: ${error.message}`);
      return 0;
    }
  }

  /**
   * Reset orphaned status for records that exist in provider
   * This is useful when a record was previously marked as orphaned
   * but now exists in the provider again
   * @param {string} provider - Provider name
   * @returns {Promise<number>} - Number of records unmarked
   */
  async resetOrphanedStatusForExistingRecords(provider) {
    try {
      // Get the comparison
      const comparison = await this.compareProviderWithManaged(provider);
      
      // Get all managed records
      const managedRecords = await this.managedRecords.getRecords(provider, { isOrphaned: true });
      
      // Build map of provider records
      const providerMap = new Map();
      const providerRecords = await this.providerCache.getRecords(provider);
      for (const record of providerRecords) {
        providerMap.set(record.providerId, record);
      }
      
      let unmarkedCount = 0;
      
      // Unmark orphaned records that exist in provider
      for (const record of managedRecords) {
        if (providerMap.has(record.providerId)) {
          const success = await this.managedRecords.unmarkRecordOrphaned(
            provider, 
            record.providerId
          );
          
          if (success) {
            unmarkedCount++;
          }
        }
      }
      
      logger.info(`Unmarked ${unmarkedCount} previously orphaned records for provider ${provider}`);
      return unmarkedCount;
    } catch (error) {
      logger.error(`Failed to reset orphaned status: ${error.message}`);
      return 0;
    }
  }

  /**
   * Sync all managed records to reflect their current status in the provider
   * This ensures that orphaned status is correct and content is up to date
   * @param {string} provider - Provider name
   * @returns {Promise<Object>} - Sync results
   */
  async syncManagedRecordsWithProvider(provider) {
    try {
      // Get all records from both repositories
      const managedRecords = await this.managedRecords.getRecords(provider);
      const providerRecords = await this.providerCache.getRecords(provider);
      
      // Build maps for efficient lookup
      const managedMap = new Map();
      for (const record of managedRecords) {
        managedMap.set(record.providerId, record);
      }
      
      const providerMap = new Map();
      for (const record of providerRecords) {
        providerMap.set(record.providerId, record);
      }
      
      let markedOrphaned = 0;
      let unmarkedOrphaned = 0;
      let contentUpdated = 0;
      
      // Start a transaction
      await this.db.beginTransaction();
      
      try {
        // Check each managed record
        for (const managedRecord of managedRecords) {
          const providerRecord = providerMap.get(managedRecord.providerId);
          
          if (!providerRecord) {
            // Record doesn't exist in provider - should be marked orphaned
            if (!managedRecord.isOrphaned) {
              const success = await this.managedRecords.markRecordOrphaned(
                provider, 
                managedRecord.providerId
              );
              
              if (success) {
                markedOrphaned++;
              }
            }
          } else {
            // Record exists in provider
            
            // If it was marked orphaned, unmark it
            if (managedRecord.isOrphaned) {
              const success = await this.managedRecords.unmarkRecordOrphaned(
                provider, 
                managedRecord.providerId
              );
              
              if (success) {
                unmarkedOrphaned++;
              }
            }
            
            // TODO: If we want to keep managed records in sync with provider changes,
            // we could update the managed record content here
          }
        }
        
        // Commit the transaction
        await this.db.commit();
        
        return {
          success: true,
          markedOrphaned,
          unmarkedOrphaned,
          contentUpdated,
          provider
        };
      } catch (error) {
        // Rollback on error
        await this.db.rollback();
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to sync managed records with provider: ${error.message}`);
      return {
        success: false,
        error: error.message,
        provider
      };
    }
  }
}

module.exports = DNSRepositoryManager;