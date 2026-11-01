/**
 * DNS Record Tracker
 * Tracks which DNS records have been created/managed by this tool
 * for consistent cleanup across different DNS providers
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class RecordTracker {
  constructor(config) {
    this.config = config;
    this.trackedRecords = new Map();
    
    // Define config directory path for data storage
    const configDir = path.join('/config', 'data');
    
    // Ensure the config directory exists with secure permissions
    if (!fs.existsSync(configDir)) {
      try {
        // Security: Create directory with restrictive permissions (owner rwx only)
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
        logger.debug(`Created directory: ${configDir}`);
      } catch (error) {
        logger.error(`Failed to create config directory: ${error.message}`);
      }
    }
    
    // Define the new path for the tracker file
    this.trackerFile = path.join(configDir, 'dns-records.json');
    
    // Also check for the legacy location
    this.legacyTrackerFile = path.join(process.cwd(), 'dns-records.json');
    
    this.providerDomain = config.getProviderDomain();
    this.provider = config.dnsProvider;
    
    // Load preserved hostnames from config
    this.loadPreservedHostnames();

    // Load managed hostnames from config
    this.loadManagedHostnames();    
    
    // Initialise the tracker
    this.loadTrackedRecords();
  }
  
  /**
   * Load preserved hostnames from environment variable
   */
  loadPreservedHostnames() {
    try {
      const preservedHostnamesStr = process.env.PRESERVED_HOSTNAMES || '';
      
      // Split by comma and trim each hostname
      this.preservedHostnames = preservedHostnamesStr
        .split(',')
        .map(hostname => hostname.trim())
        .filter(hostname => hostname.length > 0);
      
      // Don't log here - will be displayed in startup banner by StatusReporter
      if (this.preservedHostnames.length === 0) {
        logger.debug('No preserved hostnames configured');
        this.preservedHostnames = [];
      }
    } catch (error) {
      logger.error(`Error loading preserved hostnames: ${error.message}`);
      this.preservedHostnames = [];
    }
  }
  
  /**
   * Load tracked records from file
   */
  loadTrackedRecords() {
    // Start with an empty map
    this.trackedRecords = new Map();
    
    try {
      // First check if we have data in the new location
      if (fs.existsSync(this.trackerFile)) {
        const data = fs.readFileSync(this.trackerFile, 'utf8');
        const records = JSON.parse(data);
        
        // Process each record
        for (const record of records) {
          const key = this.getRecordKey(record.provider, record.domain, record.name, record.type);
          this.trackedRecords.set(key, record);
        }
        
        logger.debug(`Loaded ${this.trackedRecords.size} tracked DNS records from ${this.trackerFile}`);
      } 
      // If not, check the legacy location
      else if (fs.existsSync(this.legacyTrackerFile)) {
        logger.info(`No records found at ${this.trackerFile}, checking legacy location ${this.legacyTrackerFile}`);
        
        const data = fs.readFileSync(this.legacyTrackerFile, 'utf8');
        const records = JSON.parse(data);
        
        // Process each record
        for (const record of records) {
          const key = this.getRecordKey(record.provider, record.domain, record.name, record.type);
          this.trackedRecords.set(key, record);
        }
        
        logger.info(`Loaded ${this.trackedRecords.size} tracked DNS records from legacy location ${this.legacyTrackerFile}`);
        logger.info(`Will save to new location ${this.trackerFile} on next update`);
        
        // Save to the new location right away
        this.saveTrackedRecords();
        
        // Create a backup of the legacy file
        try {
          const backupFile = `${this.legacyTrackerFile}.backup`;
          fs.copyFileSync(this.legacyTrackerFile, backupFile);
          logger.info(`Created backup of legacy tracker file at ${backupFile}`);
        } catch (backupError) {
          logger.warn(`Could not create backup of legacy file: ${backupError.message}`);
        }
      }
      // If neither exists, start fresh
      else {
        logger.debug(`No DNS record tracker file found, starting fresh`);
        this.saveTrackedRecords();
      }
    } catch (error) {
      logger.error(`Error loading tracked DNS records: ${error.message}`);
    }
  }
  
  /**
   * Save tracked records to file
   * Security: Sets restrictive file permissions (0600 - owner read/write only)
   */
  saveTrackedRecords() {
    try {
      const records = Array.from(this.trackedRecords.values());
      // Security: Write with restrictive permissions (owner read/write only)
      fs.writeFileSync(this.trackerFile, JSON.stringify(records, null, 2), {
        encoding: 'utf8',
        mode: 0o600 // rw------- (owner read/write only)
      });
      logger.debug(`Saved ${records.length} tracked DNS records to ${this.trackerFile}`);
    } catch (error) {
      logger.error(`Error saving tracked DNS records: ${error.message}`);
    }
  }
  
  /**
   * Create a unique key for a record
   */
  getRecordKey(provider, domain, name, type) {
    return `${provider}:${domain}:${name}:${type}`.toLowerCase();
  }
  
  /**
   * Track a new DNS record
   */
  trackRecord(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    this.trackedRecords.set(key, {
      id: record.id,
      provider: this.provider,
      domain: this.providerDomain,
      name: record.name,
      type: record.type,
      createdAt: new Date().toISOString(),
      managedBy: 'TráfegoDNS'
    });
    
    // Save after each new record to prevent data loss
    this.saveTrackedRecords();
    
    logger.debug(`Tracked new DNS record: ${record.name} (${record.type})`);
  }
  
  /**
   * Remove a tracked record
   */
  untrackRecord(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    const wasTracked = this.trackedRecords.delete(key);
    
    if (wasTracked) {
      // Save after removing a record
      this.saveTrackedRecords();
      logger.debug(`Removed tracked DNS record: ${record.name} (${record.type})`);
    }
    
    return wasTracked;
  }
  
  /**
   * Check if a record is tracked
   */
  isTracked(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    return this.trackedRecords.has(key);
  }
  
  /**
   * Get all tracked records
   */
  getAllTrackedRecords() {
    return Array.from(this.trackedRecords.values());
  }
  
  /**
   * Get tracked records for current provider and domain
   */
  getCurrentProviderRecords() {
    const records = [];
    
    for (const [key, record] of this.trackedRecords.entries()) {
      if (record.provider === this.provider && record.domain === this.providerDomain) {
        records.push(record);
      }
    }
    
    return records;
  }
  
  /**
   * Check if a hostname is in the preserved list
   * @param {string} hostname - The hostname to check
   * @returns {boolean} - True if the hostname should be preserved
   */
  shouldPreserveHostname(hostname) {
    // Normalize hostname for comparison (trim, lowercase)
    const normalizedHostname = hostname.trim().toLowerCase();
    
    // Check exact match
    if (this.preservedHostnames.some(h => h.toLowerCase() === normalizedHostname)) {
      logger.debug(`Hostname ${hostname} is in the preserved list (exact match)`);
      return true;
    }
    
    // Check for wildcard match (*.example.com)
    for (const preservedHostname of this.preservedHostnames) {
      if (preservedHostname.startsWith('*.')) {
        const wildcardDomain = preservedHostname.substring(2).toLowerCase();
        if (normalizedHostname.endsWith(wildcardDomain) && 
            normalizedHostname.length > wildcardDomain.length) {
          logger.debug(`Hostname ${hostname} matched wildcard pattern ${preservedHostname}`);
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Update a record ID (when a record is updated/recreated)
   */
  updateRecordId(oldRecord, newRecord) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      oldRecord.name,
      oldRecord.type
    );
    
    if (this.trackedRecords.has(key)) {
      const record = this.trackedRecords.get(key);
      record.id = newRecord.id;
      record.updatedAt = new Date().toISOString();
      this.trackedRecords.set(key, record);
      this.saveTrackedRecords();
      logger.debug(`Updated tracked DNS record ID: ${oldRecord.name} (${oldRecord.type})`);
    }
  }

  /**
   * Mark a record as orphaned with current timestamp
   * @param {Object} record - The record to mark
   * @returns {boolean} - True if the record was successfully marked
   */
  markRecordOrphaned(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    if (this.trackedRecords.has(key)) {
      const trackedRecord = this.trackedRecords.get(key);
      trackedRecord.orphanedAt = new Date().toISOString();
      this.trackedRecords.set(key, trackedRecord);
      this.saveTrackedRecords();
      logger.debug(`Marked DNS record as orphaned: ${record.name} (${record.type})`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Remove orphaned mark from a record
   * @param {Object} record - The record to unmark
   * @returns {boolean} - True if the record was successfully unmarked
   */
  unmarkRecordOrphaned(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    if (this.trackedRecords.has(key)) {
      const trackedRecord = this.trackedRecords.get(key);
      if (trackedRecord.orphanedAt) {
        delete trackedRecord.orphanedAt;
        this.trackedRecords.set(key, trackedRecord);
        this.saveTrackedRecords();
        logger.debug(`Removed orphaned mark from DNS record: ${record.name} (${record.type})`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if a record is marked as orphaned
   * @param {Object} record - The record to check
   * @returns {boolean} - True if the record is marked as orphaned
   */
  isRecordOrphaned(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    if (this.trackedRecords.has(key)) {
      return !!this.trackedRecords.get(key).orphanedAt;
    }
    
    return false;
  }
  
  /**
   * Get the timestamp when a record was marked as orphaned
   * @param {Object} record - The record to check
   * @returns {Date|null} - Date object when the record was orphaned, or null if not orphaned
   */
  getRecordOrphanedTime(record) {
    const key = this.getRecordKey(
      this.provider,
      this.providerDomain,
      record.name,
      record.type
    );
    
    if (this.trackedRecords.has(key)) {
      const orphanedAt = this.trackedRecords.get(key).orphanedAt;
      if (orphanedAt) {
        return new Date(orphanedAt);
      }
    }
    
    return null;
  }

  /**
   * Load managed hostnames from environment variable
   */
  loadManagedHostnames() {
    try {
      const managedHostnamesStr = this.config.managedHostnames || '';
      
      // Split by comma and process each hostname configuration
      this.managedHostnames = managedHostnamesStr
        .split(',')
        .map(hostnameConfig => {
          const parts = hostnameConfig.trim().split(':');
          if (parts.length < 1) return null;
          
          const hostname = parts[0];
          
          // Return basic record with defaults if parts are missing
          return {
            hostname: hostname,
            type: parts[1] || 'A',
            content: parts[2] || (parts[1] === 'CNAME' ? this.config.getProviderDomain() : this.config.getPublicIPSync()),
            ttl: parseInt(parts[3] || '3600', 10),
            proxied: parts[4] ? parts[4].toLowerCase() === 'true' : this.config.defaultProxied
          };
        })
        .filter(config => config && config.hostname && config.hostname.length > 0);
      
      if (this.managedHostnames.length === 0) {
        logger.debug('No managed hostnames configured');
        this.managedHostnames = [];
      } else {
        logger.info(`Loaded ${this.managedHostnames.length} managed hostnames from configuration`);
      }
    } catch (error) {
      logger.error(`Error loading managed hostnames: ${error.message}`);
      this.managedHostnames = [];
    }
  }
}

module.exports = RecordTracker;