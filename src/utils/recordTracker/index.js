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

    // Try to use SQLite database if available
    try {
      const database = require('../../database');

      if (database && database.isInitialized()) {
        this.sqliteManager = new SQLiteRecordManager(database);
        this.usingSQLite = this.sqliteManager.initialize();

        if (this.usingSQLite) {
          logger.info('DNS record tracker using SQLite for storage');
        } else {
          logger.warn('SQLite available but initialization failed, using JSON fallback');
        }
      } else {
        logger.debug('SQLite database not available, using JSON storage for DNS records');
      }
    } catch (error) {
      logger.debug(`Could not initialize SQLite for DNS records: ${error.message}`);
    }

    // Initialize the tracker
    this.loadTrackedRecords();
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
   */
  async trackRecord(record) {
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const success = await this.sqliteManager.trackRecord(this.provider, record);
        if (success) {
          // Also update in-memory data
          trackRecordOperation(this.data, this.trackerFile, this.provider, record);
          return true;
        }
      } catch (error) {
        logger.error(`Failed to track record in SQLite: ${error.message}`);
        this.usingSQLite = false;
      }
    }

    // Fall back to JSON storage
    return trackRecordOperation(this.data, this.trackerFile, this.provider, record);
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
    // Try to use SQLite first if available
    if (this.usingSQLite && this.sqliteManager) {
      try {
        const oldRecordId = oldRecord.id || oldRecord;
        const newRecordId = newRecord.id || newRecord;
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
}

module.exports = RecordTracker;