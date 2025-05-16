/**
 * SQLite Manager for DNS Record Tracker
 * Handles database operations for record tracking using SQLite
 * Updated to work with the dual-table architecture
 */
const logger = require('../logger');

class SQLiteRecordManager {
  constructor(database) {
    this.database = database;
    this.dnsRepositoryManager = null;
    this.managedRecordsRepository = null;
    this.providerCacheRepository = null;
    this.legacyRepository = null;
    this.initialized = false;
    this.isReady = false;
    this.useNewArchitecture = false;
  }

  /**
   * Initialize the SQLite record manager
   * @returns {boolean} - Success status
   */
  initialize() {
    try {
      // Check if database is available
      if (!this.database || !this.database.isInitialized()) {
        logger.debug('SQLite database not initialized, record tracker will use JSON storage');
        return false;
      }

      // First try to initialize with new architecture
      if (this.database.repositories && 
          this.database.repositories.dnsRepositoryManager && 
          this.database.repositories.managedRecords && 
          this.database.repositories.providerCache) {
        
        this.dnsRepositoryManager = this.database.repositories.dnsRepositoryManager;
        this.managedRecordsRepository = this.database.repositories.managedRecords;
        this.providerCacheRepository = this.database.repositories.providerCache;
        this.useNewArchitecture = true;
        
        logger.info('DNS record tracker initialized with new dual-table architecture');
      } 
      // Fall back to legacy repository if new architecture is not available
      else if (this.database.repositories && this.database.repositories.dnsTrackedRecord) {
        this.legacyRepository = this.database.repositories.dnsTrackedRecord;
        this.useNewArchitecture = false;
        
        logger.info('DNS record tracker initialized with legacy SQLite storage');
      } else {
        logger.debug('DNS repositories not available, record tracker will use JSON storage');
        return false;
      }
      
      this.initialized = true;
      this.isReady = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SQLite record manager: ${error.message}`);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Check if SQLite is ready to use
   * @returns {boolean} - Whether SQLite is ready
   */
  isInitialized() {
    return this.initialized && this.isReady && 
      (this.useNewArchitecture ? 
        (this.dnsRepositoryManager !== null && 
         this.managedRecordsRepository !== null && 
         this.providerCacheRepository !== null) : 
        (this.legacyRepository !== null));
  }

  /**
   * Get the appropriate repository for the operation
   * @param {string} operation - The operation type ('managed', 'provider', or 'both')
   * @returns {Object} - The repository to use
   */
  getRepository(operation = 'managed') {
    if (!this.useNewArchitecture) {
      return this.legacyRepository;
    }
    
    switch (operation) {
      case 'provider':
        return this.providerCacheRepository;
      case 'both':
        return this.dnsRepositoryManager;
      case 'managed':
      default:
        return this.managedRecordsRepository;
    }
  }

  /**
   * Load tracked records from SQLite
   * @param {string} provider - Current DNS provider name
   * @returns {Promise<Object>} - Loaded records data
   */
  async loadTrackedRecordsFromDatabase(provider) {
    if (!this.isInitialized()) {
      return { providers: {} };
    }

    try {
      // Get the appropriate repository
      const repository = this.getRepository('managed');
      
      // Get records for this provider
      if (provider) {
        const providerRecords = await repository.getProviderRecords(provider);
        return { 
          providers: { 
            [provider]: providerRecords 
          } 
        };
      } 
      
      // Or get all records if no provider specified
      return await repository.getAllTrackedRecords();
    } catch (error) {
      logger.error(`Failed to load tracked records from SQLite: ${error.message}`);
      return { providers: {} };
    }
  }

  /**
   * Save tracked records to SQLite
   * @param {Object} data - Records data to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveTrackedRecordsToDatabase(data) {
    if (!this.isInitialized() || !data || !data.providers) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      let recordCount = 0;

      // Process all providers and their records
      for (const provider in data.providers) {
        const providerData = data.providers[provider];
        
        if (!providerData || !providerData.records) continue;
        
        for (const recordId in providerData.records) {
          const record = providerData.records[recordId];
          
          if (!record) continue;
          
          // Prepare metadata if available
          const metadata = {
            appManaged: true,
            source: 'record-tracker'
          };
          
          // Track the record in the database
          if (this.useNewArchitecture) {
            await repository.trackRecord(provider, {
              id: recordId,
              type: record.type,
              name: record.name,
              content: record.content || record.value || '',
              ttl: record.ttl || 1,
              proxied: !!record.proxied,
              metadata
            }, true);
          } else {
            // Use legacy repository format
            const recordToTrack = {
              provider: provider || 'unknown',  // Ensure provider is never null
              record_id: recordId,
              type: record.type || 'UNKNOWN',
              name: record.name || recordId,
              content: record.content || record.value || '',
              ttl: record.ttl || 1,
              proxied: !!record.proxied,
              is_orphaned: record.is_orphaned ? 1 : 0,
              orphaned_at: record.orphaned_at || null,
              tracked_at: record.tracked_at || new Date().toISOString(),
              metadata: JSON.stringify(metadata)
            };
            
            // Double-check the provider is set to prevent NULL constraint failures
            if (!recordToTrack.provider) {
              logger.warn('Provider still undefined after first check, forcing "unknown" provider');
              recordToTrack.provider = 'unknown';
            }
            
            await repository.trackRecord(recordToTrack);
          }
          
          recordCount++;
        }
      }
      
      logger.debug(`Saved ${recordCount} tracked records to SQLite database`);
      return true;
    } catch (error) {
      logger.error(`Failed to save tracked records to SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Track a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {Object} record - Record to track
   * @returns {Promise<boolean>} - Success status
   */
  async trackRecord(provider, record) {
    if (!this.isInitialized()) {
      return false;
    }

    if (!record || !record.id) {
      logger.warn(`Cannot track record without ID in SQLite: ${JSON.stringify(record)}`);
      return false;
    }

    try {
      // Ensure provider is not null or undefined
      if (!provider) {
        logger.warn(`Provider is undefined while tracking record ${record.name || 'unnamed'} (${record.type || 'untyped'}) - using record's provider or "unknown"`);
        provider = record.provider || 'unknown';
      }
      
      // Double-check to absolutely ensure provider is never null
      if (!provider) {
        logger.warn(`Provider still undefined after first check - forcing "unknown" for record ${JSON.stringify(record)}`);
        provider = 'unknown';
      }

      // Get record key for better identification
      const recordKey = `${record.type}:${record.name}`;
      logger.debug(`Tracking record in SQLite: ${recordKey} (ID: ${record.id}) for provider ${provider}`);

      // Prepare metadata
      const metadata = record.metadata || { appManaged: true };
      
      if (this.useNewArchitecture) {
        const repository = this.getRepository('managed');
        
        // Create a copy of the record with provider field always set
        const recordToTrack = { ...record };
        if (!recordToTrack.provider) {
          recordToTrack.provider = provider;
        }
        
        return await repository.trackRecord(provider, recordToTrack, true);
      } else {
        // Use legacy repository format
        await this.legacyRepository.trackRecord({
          provider: provider || 'unknown',  // Ensure provider is never null
          record_id: record.id,
          type: record.type || 'UNKNOWN',
          name: record.name || record.id,
          content: record.content || record.value || '',
          ttl: record.ttl || 1,
          proxied: !!record.proxied,
          tracked_at: record.tracked_at || new Date().toISOString(),
          metadata: JSON.stringify(metadata)
        });
      }

      return true;
    } catch (error) {
      // If it's a constraint error (duplicate), try to update instead
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        try {
          logger.debug(`Record already exists, attempting to update: ${record.name} (${record.type})`);
          const repository = this.getRepository('managed');

          if (this.useNewArchitecture) {
            // Use the repository manager to update the record
            return await repository.updateExistingRecord(provider, record.type, record.name, record);
          } else {
            // Check if record exists with a different ID using legacy repository
            const exists = await this.legacyRepository.isTrackedByTypeAndName(provider, record.type, record.name);
            if (exists) {
              // Try to update the existing record
              logger.debug(`Found existing record with same type and name, updating ID: ${record.name} (${record.type})`);
              await this.legacyRepository.updateRecordByTypeAndName(provider, record.type, record.name, record.id);

              // Also update metadata if provided
              if (record.metadata) {
                if (this.legacyRepository.updateRecordMetadata) {
                  await this.legacyRepository.updateRecordMetadata(provider, record.id, JSON.stringify(record.metadata));
                } else {
                  logger.debug('Repository does not support updateRecordMetadata method');
                }
              }

              return true;
            }
          }
        } catch (updateError) {
          logger.error(`Failed to update existing record in SQLite: ${updateError.message}`);
        }
      }

      logger.error(`Failed to track record in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Untrack a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async untrackRecord(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.untrackRecord(provider, recordId);
    } catch (error) {
      logger.error(`Failed to untrack record in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is tracked in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.isTracked(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is tracked in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Update record ID in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} oldRecordId - Old record ID
   * @param {string} newRecordId - New record ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateRecordId(provider, oldRecordId, newRecordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.updateRecordId(provider, oldRecordId, newRecordId);
    } catch (error) {
      logger.error(`Failed to update record ID in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Mark a record as orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async markRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.markRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to mark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Unmark a record as orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async unmarkRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.unmarkRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to unmark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is orphaned
   */
  async isRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.isRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Get orphaned time of a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} - Orphaned time or null
   */
  async getRecordOrphanedTime(provider, recordId) {
    if (!this.isInitialized()) {
      return null;
    }

    try {
      const repository = this.getRepository('managed');
      const result = await repository.getRecordOrphanedTime(provider, recordId);

      // Handle all possible formats of result to ensure we return a proper ISO string or null
      if (!result) {
        return null;
      } else if (typeof result === 'string') {
        return result; // Already a string, assume it's in ISO format
      } else if (result instanceof Date) {
        return result.toISOString(); // It's a Date object, convert to ISO string
      } else {
        try {
          // Try to convert to a Date and then to ISO string
          return new Date(result).toISOString();
        } catch (e) {
          logger.warn(`Failed to convert orphaned time to ISO string: ${e.message}`);
          return null;
        }
      }
    } catch (error) {
      logger.error(`Failed to get record orphaned time from SQLite: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all tracked records in SQLite
   * @returns {Promise<Object>} - All tracked records
   */
  async getAllTrackedRecords() {
    if (!this.isInitialized()) {
      return { providers: {} };
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.getAllTrackedRecords();
    } catch (error) {
      logger.error(`Failed to get all tracked records from SQLite: ${error.message}`);
      return { providers: {} };
    }
  }

  /**
   * Get records for a provider in SQLite
   * @param {string} provider - DNS provider name
   * @returns {Promise<Object>} - Provider records
   */
  async getProviderRecords(provider) {
    if (!this.isInitialized()) {
      return { records: {} };
    }

    try {
      const repository = this.getRepository('managed');
      return await repository.getProviderRecords(provider);
    } catch (error) {
      logger.error(`Failed to get provider records from SQLite: ${error.message}`);
      return { records: {} };
    }
  }

  /**
   * Synchronize provider records with tracked records
   * @param {string} provider - DNS provider name
   * @returns {Promise<Object>} - Synchronization results
   */
  async synchronizeWithProviderCache(provider) {
    if (!this.isInitialized() || !this.useNewArchitecture) {
      logger.debug('Cannot synchronize with provider cache: new architecture not available');
      return { success: false, message: 'New architecture not available' };
    }

    try {
      const result = await this.dnsRepositoryManager.synchronizeRecords(provider);
      logger.info(`Successfully synchronized ${provider} records between managed and provider cache`);
      return result;
    } catch (error) {
      logger.error(`Failed to synchronize with provider cache: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find orphaned records in provider cache
   * @param {string} provider - DNS provider name
   * @param {Object} options - Options for finding orphaned records
   * @returns {Promise<Array>} - Array of orphaned records
   */
  async findOrphanedRecords(provider, options = {}) {
    if (!this.isInitialized()) {
      return [];
    }

    try {
      if (this.useNewArchitecture) {
        // Use the repository manager to find orphaned records
        return await this.dnsRepositoryManager.findOrphanedRecords(provider, options);
      } else {
        // Use legacy repository
        const records = await this.legacyRepository.getOrphanedRecords(provider);
        return Object.values(records || {});
      }
    } catch (error) {
      logger.error(`Failed to find orphaned records: ${error.message}`);
      return [];
    }
  }

  /**
   * Get records that exist in provider but not in managed records
   * @param {string} provider - DNS provider name
   * @returns {Promise<Array>} - Untracked records
   */
  async getUntrackedProviderRecords(provider) {
    if (!this.isInitialized() || !this.useNewArchitecture) {
      return [];
    }

    try {
      return await this.dnsRepositoryManager.getUntrackedProviderRecords(provider);
    } catch (error) {
      logger.error(`Failed to get untracked provider records: ${error.message}`);
      return [];
    }
  }
}

module.exports = SQLiteRecordManager;