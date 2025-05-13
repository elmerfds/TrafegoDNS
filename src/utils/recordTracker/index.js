/**
 * DNS Record Tracker
 * Tracks which DNS records have been created/managed by this tool
 * for consistent cleanup across different DNS providers
 * Modular implementation that orchestrates specialized sub-modules
 */
const logger = require('../logger');

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
const SQLiteRecordManager = require('./sqliteManager');

class RecordTracker {
  constructor(config) {
    this.config = config;

    // Initialize file paths
    const paths = initializePaths();
    this.trackerFile = paths.trackerFile;
    this.legacyTrackerFile = paths.legacyTrackerFile;

    this.providerDomain = config.getProviderDomain();
    this.provider = config.dnsProvider;

    // Load preserved hostnames from config, but suppress the log for now
    // We'll display the log at a more appropriate time in the startup sequence
    this.preservedHostnames = loadPreservedHostnames(config, true);

    // Load managed hostnames from config
    this.managedHostnames = loadManagedHostnames(config);

    // Initialize SQLite manager if available
    this.sqliteManager = null;
    this.usingSQLite = false;
    this.initialized = false;

    // Try to use SQLite database if available
    try {
      const database = require('../../database');

      // First check - check if database is initialized
      if (database) {
        if (!database.isInitialized()) {
          logger.info('SQLite database not initialized yet, will use JSON storage for now');
          // We'll check again when loadTrackedRecords is called
        } else {
          // Try to initialize the SQLite manager
          this.sqliteManager = new SQLiteRecordManager(database);

          // Check if repositories are available
          if (!database.repositories.dnsTrackedRecord) {
            logger.info('SQLite repositories not initialized yet, will use JSON storage for now');
          } else {
            this.sqliteManager = new SQLiteRecordManager(database);
            this.usingSQLite = this.sqliteManager.initialize();

            if (this.usingSQLite) {
              logger.info('DNS record tracker using SQLite for storage');
            } else {
              logger.warn('SQLite available but initialization failed, using JSON fallback');
            }
          }
        }
      } else {
        logger.debug('SQLite database module not available, using JSON storage for DNS records');
      }
    } catch (error) {
      logger.debug(`Could not initialize SQLite for DNS records: ${error.message}`);
    }

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
   * Load tracked records from storage (SQLite or file)
   */
  async loadTrackedRecords() {
    // Try to load from SQLite first if available
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
        logger.warn('Falling back to JSON file storage for DNS records');
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    this.data = loadTrackedRecordsFromFile(
      this.trackerFile,
      this.legacyTrackerFile,
      this.provider
    );

    // Log the number of tracked records
    const recordCount = Object.keys(this.data.providers[this.provider].records || {}).length;
    logger.debug(`Loaded ${recordCount} tracked records for provider: ${this.provider} from JSON file`);

    return this.data;
  }

  /**
   * Save tracked records to storage (SQLite or file)
   */
  async saveTrackedRecords() {
    // Try to save to SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        // Save to SQLite database
        const success = await this.sqliteManager.saveTrackedRecordsToDatabase(this.data);

        if (success) {
          logger.debug('Saved tracked records to SQLite database');
          return true;
        } else {
          logger.warn('Failed to save to SQLite, falling back to JSON file');
        }
      } catch (error) {
        logger.error(`Failed to save tracked records to SQLite: ${error.message}`);
        logger.warn('Falling back to JSON file storage for DNS records');
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    saveTrackedRecordsToFile(this.trackerFile, this.data);
    return true;
  }
  
  /**
   * Track a new DNS record
   * @param {Object} record - The record to track
   * @param {boolean} [isAppManaged=true] - Whether this record was created by the application
   */
  async trackRecord(record, isAppManaged = true) {
    // Check if we have a valid record
    if (!record || !record.id || !record.name || !record.type) {
      logger.warn(`Cannot track invalid record: ${JSON.stringify(record)}`);
      return false;
    }

    // Add provider if not present (using the current provider)
    const recordToTrack = { ...record };
    if (!recordToTrack.provider) {
      recordToTrack.provider = this.provider;
    }

    // Add metadata to indicate if the record is managed by the app
    if (!recordToTrack.metadata) {
      recordToTrack.metadata = {};
    }
    recordToTrack.metadata.appManaged = isAppManaged;
    recordToTrack.metadata.trackedAt = new Date().toISOString();

    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const success = await this.sqliteManager.trackRecord(this.provider, recordToTrack);
        if (success) {
          // Also update in-memory data
          trackRecordOperation(this.data, this.trackerFile, this.provider, recordToTrack);
          logger.debug(`Successfully tracked ${recordToTrack.type} record for ${recordToTrack.name} in SQLite (appManaged: ${isAppManaged})`);
          return true;
        } else {
          logger.warn(`Failed to track record in SQLite: ${recordToTrack.name} (${recordToTrack.type})`);
        }
      } catch (error) {
        logger.error(`Failed to track record in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    const result = trackRecordOperation(this.data, this.trackerFile, this.provider, recordToTrack);
    if (result) {
      logger.debug(`Successfully tracked ${recordToTrack.type} record for ${recordToTrack.name} in JSON (appManaged: ${isAppManaged})`);
    }
    return result;
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
        if (oldRecord.type && oldRecord.name && this.sqliteManager.repository.updateRecordByTypeAndName) {
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
   * Track all active records from the provider
   * This is useful for bootstrapping the tracker with existing records
   * @param {Array<Object>} records - Array of records from the provider
   * @returns {Promise<number>} - Number of newly tracked records
   */
  async trackAllActiveRecords(records) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      logger.debug('No active records to track');
      return 0;
    }

    logger.info(`Tracking ${records.length} active DNS records`);
    let newlyTrackedCount = 0;

    for (const record of records) {
      if (!record || !record.id || !record.type || !record.name) {
        continue;
      }

      try {
        // Check if this record is already tracked
        const isAlreadyTracked = await this.isTracked(record);

        if (!isAlreadyTracked) {
          // Track the record
          const success = await this.trackRecord(record);
          if (success) {
            newlyTrackedCount++;
          }
        }
      } catch (error) {
        logger.error(`Failed to track active record ${record.name} (${record.type}): ${error.message}`);
      }
    }

    logger.info(`Tracked ${newlyTrackedCount} new active DNS records`);
    return newlyTrackedCount;
  }
}

module.exports = RecordTracker;