/**
 * DNS Record Tracker
 * Tracks which DNS records have been created/managed by this tool
 * for consistent cleanup across different DNS providers
 * Modular implementation that orchestrates specialized sub-modules
 */
const logger = require('../logger');
const database = require('../../database');

// Import sub-modules
const {
  initializePaths,
  loadTrackedRecordsFromFile,
  saveTrackedRecordsToFile
} = require('./fileManager');

const {
  getRecordKey
} = require('./keyManager');

const {
  loadPreservedHostnames,
  shouldPreserveHostname,
  loadManagedHostnames
} = require('./hostnameManager');

const {
  markRecordOrphaned,
  unmarkRecordOrphaned,
  isRecordOrphaned,
  getRecordOrphanedTime
} = require('./orphanManager');

const {
  trackRecord: trackRecordOperation,
  untrackRecord: untrackRecordOperation,
  isTracked: isTrackedOperation,
  updateRecordId: updateRecordIdOperation,
  getAllTrackedRecords,
  getCurrentProviderRecords
} = require('./trackingOperations');

// SQLite Manager for database operations
const SQLiteManager = require('./sqliteManager');

class RecordTracker {
  constructor(config) {
    this.config = config;

    // Initialize file paths
    const paths = initializePaths();
    this.trackerFile = paths.trackerFile;
    this.legacyTrackerFile = paths.legacyTrackerFile;

    // Safely get provider domain with error handling
    try {
      this.providerDomain = config.getProviderDomain();
    } catch (error) {
      logger.error(`Failed to get provider domain: ${error.message}`);
      this.providerDomain = '';
    }
    
    this.provider = config.dnsProvider;

    // Load preserved hostnames from config, but suppress the log for now
    // We'll display the log at a more appropriate time in the startup sequence
    this.preservedHostnames = loadPreservedHostnames(config, true);

    // Load managed hostnames from config
    this.managedHostnames = loadManagedHostnames(config);

    // Initialize SQLite manager if available
    this.sqliteManager = null;
    this.simpleManager = null;
    this.usingSQLite = false;
    this.initialized = false;

    // Initialize the SQLite manager
    try {
      logger.info('Initializing SQLite manager for record tracking');
      this.sqliteManager = SQLiteManager;
      const initSuccess = this.sqliteManager.initialize();
      
      if (initSuccess) {
        logger.info('SQLite manager initialized successfully for record tracking');
        this.usingSQLite = true;
      } else {
        logger.warn('SQLite manager initialization failed');
        this.usingSQLite = false;
      }
    } catch (error) {
      logger.debug(`Could not initialize SQLite manager: ${error.message}`);
      this.usingSQLite = false;
    }

    // Display important info message about DNS record management behavior
    logger.info("--- IMPORTANT DNS RECORD MANAGEMENT BEHAVIOR ---");
    logger.info("TrafegoDNS only marks DNS records as app-managed if they exactly match active hostnames from Traefik or Docker");
    logger.info("Records not marked as app-managed will be preserved and NEVER deleted during cleanup");
    logger.info("This prevents accidental deletion of important records like MX, TXT, etc.");
    logger.info("-----------------------------------------------");
    
    // Initialize the tracker - this will be done asynchronously
    // We'll use "initialized" flag to track completion status
    this._initializeTracker();
  }

  /**
   * Initialize the tracker asynchronously
   * @private
   */
  async _initializeTracker() {
    try {
      await this.loadTrackedRecords();
      this.initialized = true;
      logger.debug('Record tracker fully initialized');
    } catch (error) {
      logger.error(`Error initializing record tracker: ${error.message}`);
    }
  }
  
  /**
   * Load preserved hostnames from environment variable
   */
  loadPreservedHostnames() {
    this.preservedHostnames = loadPreservedHostnames(this.config);
  }
  
  /**
   * Check if a hostname should be preserved (not deleted during cleanup)
   */
  shouldPreserveHostname(hostname) {
    return shouldPreserveHostname(this.preservedHostnames, hostname);
  }
  
  /**
   * Load managed hostnames from environment variable
   */
  loadManagedHostnames() {
    this.managedHostnames = loadManagedHostnames(this.config);
  }
  
  /**
   * Load tracked records from storage (SQLite only)
   */
  async loadTrackedRecords() {
    // Try SQLite manager if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        // Load from SQLite database
        this.data = await this.sqliteManager.loadTrackedRecordsFromDatabase(this.provider);

        // Log success
        const providerData = this.data.providers[this.provider] || { records: {} };
        const recordCount = Object.keys(providerData.records || {}).length;
        logger.debug(`Loaded ${recordCount} tracked records for provider ${this.provider} from SQLite`);

        return this.data;
      } catch (error) {
        logger.error(`Failed to load tracked records from SQLite: ${error.message}`);
      }
    }

    // If all attempts failed, initialize empty data structure
    logger.warn('All SQLite attempts failed - using temporary storage');
    this.data = { providers: { [this.provider]: { records: {} } } };
    return this.data;
  }

  /**
   * Save tracked records to storage (SQLite only)
   */
  async saveTrackedRecords() {
    // We only use SQLite now - JSON storage is permanently disabled
    if (this.usingSQLite && this.sqliteManager) {
      try {
        // Save to SQLite database
        const success = await this.sqliteManager.saveTrackedRecordsToDatabase(this.data);

        if (success) {
          logger.debug('Saved tracked records to SQLite database');
          return true;
        } else {
          logger.error('Failed to save to SQLite database');
          return false;
        }
      } catch (error) {
        logger.error(`Failed to save tracked records to SQLite: ${error.message}`);
        return false;
      }
    } else {
      // Check if initialization is in progress
      const database = require('../../database');
      
      // Try to initialize SQLite again
      try {
        if (database && database.isInitialized()) {
          // Use the singleton SQLiteManager instance (not instantiate new one)
          this.sqliteManager = require('./sqliteManager');
          this.usingSQLite = this.sqliteManager.initialize();
          
          if (this.usingSQLite) {
            logger.info('Successfully initialized SQLite for DNS record tracking on retry');
            return await this.sqliteManager.saveTrackedRecordsToDatabase(this.data);
          }
        }
      } catch (retryError) {
        logger.debug(`Retry SQLite initialization failed: ${retryError.message}`);
      }
      
      logger.warn('SQLite is required but not fully available yet - using temporary storage');
      return false;
    }
  }
  
  /**
   * Track a new DNS record
   * @param {Object} record - The record to track
   * @param {boolean} [isAppManaged=true] - Whether this record was created by the application
   */
  async trackRecord(record, isAppManaged = true) {
    // Check if we have a valid record
    if (!record) {
      logger.warn('Cannot track null or undefined record');
      return false;
    }
    
    // Add minimal validation to allow records even with missing fields
    if (!record.id && !record.record_id) {
      logger.warn(`Cannot track record without ID: ${JSON.stringify(record)}`);
      return false;
    }

    // Add provider if not present (using the current provider)
    const recordToTrack = { ...record };
    if (!recordToTrack.provider) {
      recordToTrack.provider = this.provider || 'unknown';
    }
    
    // Ensure provider is never null or undefined
    recordToTrack.provider = recordToTrack.provider || 'unknown';

    // Add minimal fields if missing
    recordToTrack.type = recordToTrack.type || 'UNKNOWN';
    recordToTrack.name = recordToTrack.name || (recordToTrack.id || recordToTrack.record_id);
    
    // Add metadata to indicate if the record is managed by the app
    if (!recordToTrack.metadata) {
      recordToTrack.metadata = {};
    }
    recordToTrack.metadata.appManaged = isAppManaged;
    recordToTrack.metadata.trackedAt = new Date().toISOString();

    // Try the SQLite manager
    if (this.sqliteManager) {
      try {
        const success = await this.sqliteManager.trackRecord(this.provider, recordToTrack);
        if (success) {
          logger.debug(`Successfully tracked ${recordToTrack.type} record for ${recordToTrack.name} in SQLite`);
          return true;
        }
      } catch (sqliteError) {
        logger.warn(`SQLite manager failed to track record: ${sqliteError.message}`);
        // Fall back to in-memory tracking
      }
    }

    // SQLite failed, continue to in-memory tracking
    
    // Last resort: update in-memory data
    try {
      // Only show warning message for first few records to avoid log spam
      if (!this._memoryTrackingWarningShown) {
        logger.warn('SQLite tracking not available - using memory-only tracking as fallback');
        this._memoryTrackingWarningShown = true;
        this._memoryTrackedCount = 1;
      } else {
        this._memoryTrackedCount = (this._memoryTrackedCount || 0) + 1;
        
        // Only log a summary message every 10 records
        if (this._memoryTrackedCount % 10 === 0) {
          logger.debug(`Now tracking ${this._memoryTrackedCount} records in memory-only mode`);
        }
      }
      
      // Track in memory
      if (!this.data) {
        this.data = { providers: {} };
      }
      
      if (!this.data.providers[this.provider]) {
        this.data.providers[this.provider] = { records: {} };
      }
      
      const key = recordToTrack.id || recordToTrack.record_id;
      this.data.providers[this.provider].records[key] = recordToTrack;
      
      return true;
    } catch (memoryError) {
      logger.error(`Failed to track record in memory: ${memoryError.message}`);
      return false;
    }
  }

  /**
   * Untrack (stop tracking) a DNS record
   */
  async untrackRecord(record) {
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        const success = await this.sqliteManager.untrackRecord(this.provider, recordId);
        if (success) {
          // Also update in-memory data
          untrackRecordOperation(this.data, this.trackerFile, this.provider, record);
          return true;
        }
      } catch (error) {
        logger.error(`Failed to untrack record in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    return untrackRecordOperation(this.data, this.trackerFile, this.provider, record);
  }

  /**
   * Check if a record is being tracked
   */
  async isTracked(record) {
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        return await this.sqliteManager.isTracked(this.provider, recordId);
      } catch (error) {
        logger.error(`Failed to check if record is tracked in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    return isTrackedOperation(this.data, this.provider, record);
  }

  /**
   * Update a record's ID in the tracker
   */
  async updateRecordId(oldRecord, newRecord) {
    // Check if record is already tracked, if not, track it automatically
    const isTracked = await this.isTracked(oldRecord);

    if (!isTracked) {
      logger.debug(`Auto-tracking record before ID update: ${oldRecord.name || oldRecord} (${oldRecord.type || 'unknown'})`);
      await this.trackRecord(oldRecord);

      // If the oldRecord had no ID but the newRecord does, we can just return since we've tracked with the new ID
      if ((!oldRecord.id || oldRecord.id === oldRecord) && newRecord.id) {
        return true;
      }
    }

    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const oldRecordId = oldRecord.id || oldRecord;
        const newRecordId = newRecord.id || newRecord;

        // If we can identify by type and name, try that first
        if (oldRecord.type && oldRecord.name) {
          // Update repository reference if needed
          if (!this.sqliteManager.repository && database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.trackedRecords) {
            this.sqliteManager.repository = database.repositories.dnsManager.trackedRecords;
          }
          
          if (this.sqliteManager.repository && this.sqliteManager.repository.updateRecordByTypeAndName) {
            const success = await this.sqliteManager.repository.updateRecordByTypeAndName(
              this.provider,
              oldRecord.type,
              oldRecord.name,
              newRecordId
            );

          if (success) {
            // Also update in-memory data (use dummy key if needed)
            const dummyOldRecord = oldRecord.id ? oldRecord : { ...newRecord, id: 'temp-id' };
            updateRecordIdOperation(this.data, this.trackerFile, this.provider, dummyOldRecord, newRecord);
            return true;
          }
        }

        // Otherwise try normal ID update
        const success = await this.sqliteManager.updateRecordId(this.provider, oldRecordId, newRecordId);
        if (success) {
          // Also update in-memory data
          updateRecordIdOperation(this.data, this.trackerFile, this.provider, oldRecord, newRecord);
          return true;
        }
      } catch (error) {
        logger.error(`Failed to update record ID in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    // If the record isn't tracked in JSON either, try to track it first
    if (!isTracked) {
      trackRecordOperation(this.data, this.trackerFile, this.provider, oldRecord);
    }

    return updateRecordIdOperation(this.data, this.trackerFile, this.provider, oldRecord, newRecord);
  }
  
  /**
   * Get record key
   */
  getRecordKey(record) {
    return getRecordKey(record);
  }
  
  /**
   * Mark a record as orphaned
   */
  async markRecordOrphaned(record) {
    // Check if record is already tracked, if not, track it automatically
    const isTracked = await this.isTracked(record);

    if (!isTracked) {
      logger.debug(`Auto-tracking record before marking as orphaned: ${record.name || record} (${record.type || 'unknown'})`);
      await this.trackRecord(record);
    }

    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        const success = await this.sqliteManager.markRecordOrphaned(this.provider, recordId);
        if (success) {
          // Also update in-memory data
          markRecordOrphaned(this.data, this.provider, record);
          return true;
        }
      } catch (error) {
        logger.error(`Failed to mark record as orphaned in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    markRecordOrphaned(this.data, this.provider, record);
    await this.saveTrackedRecords();
    return true;
  }

  /**
   * Unmark a record as orphaned (reactivate it)
   */
  async unmarkRecordOrphaned(record) {
    // Check if record is already tracked, if not, track it automatically
    const isTracked = await this.isTracked(record);

    if (!isTracked) {
      logger.debug(`Auto-tracking record before unmarking as orphaned: ${record.name || record} (${record.type || 'unknown'})`);
      await this.trackRecord(record);
      // No need to unmark as the newly tracked record won't be orphaned
      return true;
    }

    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        const success = await this.sqliteManager.unmarkRecordOrphaned(this.provider, recordId);
        if (success) {
          // Also update in-memory data
          unmarkRecordOrphaned(this.data, this.provider, record);
          return true;
        }
      } catch (error) {
        logger.error(`Failed to unmark record as orphaned in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    unmarkRecordOrphaned(this.data, this.provider, record);
    await this.saveTrackedRecords();
    return true;
  }

  /**
   * Check if a record is marked as orphaned
   */
  async isRecordOrphaned(record) {
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        return await this.sqliteManager.isRecordOrphaned(this.provider, recordId);
      } catch (error) {
        logger.error(`Failed to check if record is orphaned in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    return isRecordOrphaned(this.data, this.provider, record);
  }

  /**
   * Get the timestamp when a record was marked as orphaned
   */
  async getRecordOrphanedTime(record) {
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const recordId = record.id || record;
        return await this.sqliteManager.getRecordOrphanedTime(this.provider, recordId);
      } catch (error) {
        logger.error(`Failed to get record orphaned time from SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    return getRecordOrphanedTime(this.data, this.provider, record);
  }
  
  /**
   * Get all tracked records
   */
  getAllTrackedRecords() {
    return getAllTrackedRecords(this.data);
  }
  
  /**
   * Get tracked records for the current provider
   */
  getCurrentProviderRecords() {
    return getCurrentProviderRecords(this.data, this.provider);
  }
  
  /**
   * Check if a record is marked as app-managed
   * @param {Object} record - Record to check
   * @returns {Promise<boolean>} Whether the record is app-managed
   */
  async isRecordAppManaged(record) {
    try {
      // Check if this record is tracked
      const isTracked = await this.isTracked(record);
      if (!isTracked) {
        return false;
      }
      
      // Get the record ID
      const recordId = record.id;
      
      // Try SQLite first if available
      if (this.sqliteManager) {
        try {
          // Update repository reference if needed
          if (!this.sqliteManager.repository && database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.trackedRecords) {
            this.sqliteManager.repository = database.repositories.dnsManager.trackedRecords;
          }
          
          if (this.sqliteManager.repository && this.sqliteManager.repository.isAppManaged) {
            return await this.sqliteManager.repository.isAppManaged(this.provider, recordId);
          }
        } catch (error) {
          logger.debug(`Failed to check if record is app-managed in SQLite: ${error.message}`);
        }
      }
      
      // Fall back to in-memory check
      const providerData = this.data?.providers?.[this.provider];
      const recordData = providerData?.records?.[recordId];
      
      return !!(recordData && recordData.metadata && recordData.metadata.appManaged === true);
    } catch (error) {
      logger.error(`Failed to check if record is app-managed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update a record's app-managed status
   * @param {Object} record - Record to update
   * @param {boolean} isAppManaged - Whether the record should be app-managed
   * @returns {Promise<boolean>} Success status
   */
  async updateRecordAppManaged(record, isAppManaged) {
    try {
      // Check if this record is tracked
      const isTracked = await this.isTracked(record);
      
      if (!isTracked) {
        // Track it first
        await this.trackRecord(record, isAppManaged);
        return true;
      }
      
      // Get the record ID
      const recordId = record.id;
      
      // Try SQLite first if available
      if (this.sqliteManager) {
        try {
          // Update repository reference if needed
          if (!this.sqliteManager.repository && database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.trackedRecords) {
            this.sqliteManager.repository = database.repositories.dnsManager.trackedRecords;
          }
          
          if (this.sqliteManager.repository && this.sqliteManager.repository.updateRecordMetadata) {
            // Get current metadata
            const currentMetadata = await this.sqliteManager.repository.getRecordMetadata(this.provider, recordId) || {};
          
          // Update app-managed status
          const newMetadata = {
            ...currentMetadata,
            appManaged: isAppManaged,
            updatedAt: new Date().toISOString()
          };
          
          // Save updated metadata
          await this.sqliteManager.repository.updateRecordMetadata(this.provider, recordId, JSON.stringify(newMetadata));
          return true;
        } catch (error) {
          logger.debug(`Failed to update record app-managed status in SQLite: ${error.message}`);
        }
      }
      
      // Fall back to in-memory update
      if (this.data?.providers?.[this.provider]?.records?.[recordId]) {
        // Update metadata
        if (!this.data.providers[this.provider].records[recordId].metadata) {
          this.data.providers[this.provider].records[recordId].metadata = {};
        }
        
        this.data.providers[this.provider].records[recordId].metadata.appManaged = isAppManaged;
        this.data.providers[this.provider].records[recordId].metadata.updatedAt = new Date().toISOString();
        
        // Save to disk
        await this.saveTrackedRecords();
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Failed to update record app-managed status: ${error.message}`);
      return false;
    }
  }

  /**
   * Track all active records from the provider
   * This is useful for bootstrapping the tracker with existing records
   * @param {Array<Object>} records - Array of records from the provider
   * @param {boolean} [markAsAppManaged=true] - Default setting for whether to mark newly tracked records as app-managed
   * @param {Map<string, Object>} [recordsToMarkAsManaged=null] - Optional map of record IDs to records that should be marked as managed
   * @returns {Promise<number>} - Number of newly tracked records
   */
  async trackAllActiveRecords(records, markAsAppManaged = true, recordsToMarkAsManaged = null) {
    if (!records || !Array.isArray(records)) {
      logger.debug('No active records to track (null or not an array)');
      return 0;
    }
    
    // Ensure records is always an array
    const recordsToTrack = Array.isArray(records) ? records : [];
    
    if (recordsToTrack.length === 0) {
      logger.debug('No active records to track (empty array)');
      return 0;
    }

    // Determine if we have specific records to mark as managed (for first run matching)
    const hasSpecificRecordsToMark = recordsToMarkAsManaged instanceof Map && recordsToMarkAsManaged.size > 0;
    
    if (hasSpecificRecordsToMark) {
      logger.info(`Tracking ${recordsToTrack.length} active DNS records with ${recordsToMarkAsManaged.size} specifically marked as managed`);
    } else {
      logger.info(`Tracking ${recordsToTrack.length} active DNS records (default markAsAppManaged: ${markAsAppManaged})`);
    }
    
    let newlyTrackedCount = 0;
    let specificlyManagedCount = 0;

    for (const record of recordsToTrack) {
      if (!record || !record.id || !record.type || !record.name) {
        continue;
      }

      try {
        // Check if this record is already tracked
        const isAlreadyTracked = await this.isTracked(record);

        if (!isAlreadyTracked) {
          // Determine if this specific record should be marked as managed
          // Only mark records as app-managed if they specifically match active hostnames
          // We should never use the default markAsAppManaged value if we have specific records to mark
          const shouldBeManaged = hasSpecificRecordsToMark ? 
            recordsToMarkAsManaged.has(record.id) : markAsAppManaged;
            
          // Count specifically managed records for logging
          if (hasSpecificRecordsToMark && shouldBeManaged) {
            specificlyManagedCount++;
          }
          
          // Track the record with the appropriate app-managed setting
          const success = await this.trackRecord(record, shouldBeManaged);
          
          if (success) {
            // Add a timestamp for when the record was first seen
            if (this.usingSQLite && this.sqliteManager) {
              try {
                await this.sqliteManager.repository.setRecordFirstSeen(
                  this.provider, 
                  record.id, 
                  new Date().toISOString()
                );
              } catch (error) {
                logger.debug(`Could not set first_seen timestamp: ${error.message}`);
              }
            }
            
            newlyTrackedCount++;
          }
        }
      } catch (error) {
        logger.error(`Failed to track active record ${record.name} (${record.type}): ${error.message}`);
      }
    }

    if (hasSpecificRecordsToMark && specificlyManagedCount > 0) {
      logger.info(`Tracked ${newlyTrackedCount} new active DNS records (${specificlyManagedCount} specifically marked as managed)`);
    } else {
      logger.info(`Tracked ${newlyTrackedCount} new active DNS records (appManaged: ${markAsAppManaged})`);
    }
    
    return newlyTrackedCount;
  }
}

module.exports = RecordTracker;