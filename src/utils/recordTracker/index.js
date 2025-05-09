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

class RecordTracker {
  constructor(config) {
    this.config = config;
    
    // Initialize file paths
    const paths = initializePaths();
    this.trackerFile = paths.trackerFile;
    this.legacyTrackerFile = paths.legacyTrackerFile;
    
    this.providerDomain = config.getProviderDomain();
    this.provider = config.dnsProvider;
    
    // Load preserved hostnames from config
    this.preservedHostnames = loadPreservedHostnames(config);

    // Load managed hostnames from config
    this.managedHostnames = loadManagedHostnames(config);    
    
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
   * Load tracked records from file
   */
  loadTrackedRecords() {
    this.data = loadTrackedRecordsFromFile(
      this.trackerFile, 
      this.legacyTrackerFile, 
      this.provider
    );
    
    // Log the number of tracked records
    const recordCount = Object.keys(this.data.providers[this.provider].records || {}).length;
    logger.debug(`Loaded ${recordCount} tracked records for provider: ${this.provider}`);
    
    return this.data;
  }
  
  /**
   * Save tracked records to file
   */
  saveTrackedRecords() {
    saveTrackedRecordsToFile(this.trackerFile, this.data);
  }
  
  /**
   * Track a new DNS record
   */
  trackRecord(record) {
    trackRecordOperation(this.data, this.trackerFile, this.provider, record);
  }
  
  /**
   * Untrack (stop tracking) a DNS record
   */
  untrackRecord(record) {
    untrackRecordOperation(this.data, this.trackerFile, this.provider, record);
  }
  
  /**
   * Check if a record is being tracked
   */
  isTracked(record) {
    return isTrackedOperation(this.data, this.provider, record);
  }
  
  /**
   * Update a record's ID in the tracker
   */
  updateRecordId(oldRecord, newRecord) {
    updateRecordIdOperation(this.data, this.trackerFile, this.provider, oldRecord, newRecord);
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
  markRecordOrphaned(record) {
    markRecordOrphaned(this.data, this.provider, record);
    this.saveTrackedRecords();
  }
  
  /**
   * Unmark a record as orphaned (reactivate it)
   */
  unmarkRecordOrphaned(record) {
    unmarkRecordOrphaned(this.data, this.provider, record);
    this.saveTrackedRecords();
  }
  
  /**
   * Check if a record is marked as orphaned
   */
  isRecordOrphaned(record) {
    return isRecordOrphaned(this.data, this.provider, record);
  }
  
  /**
   * Get the timestamp when a record was marked as orphaned
   */
  getRecordOrphanedTime(record) {
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