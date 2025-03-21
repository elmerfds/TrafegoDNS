// src/utils/enhancedRecordTracker.js
// Enhanced Record Tracker with robust fallback mechanisms

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('./logger');

class EnhancedRecordTracker {
  constructor(config, dataStore) {
    this.config = config;
    this.dataStore = dataStore;
    
    // Create a data directory path that we'll use for fallback storage if needed
    this.dataDir = path.join('/config', 'data');
    
    // Path for fallback storage files
    this.trackedRecordsPath = path.join(this.dataDir, 'tracked-records.json');
    this.preservedHostnamesPath = path.join(this.dataDir, 'preserved-hostnames.json');
    this.managedHostnamesPath = path.join(this.dataDir, 'managed-hostnames.json');
    
    // Initialize tracking data
    this.trackedRecords = [];
    this.preservedHostnames = [];
    this.managedHostnames = [];
    
    // Track initialization
    this.initialized = false;
  }
  
  /**
   * Initialize record tracker
   */
  async init() {
    try {
      logger.debug('Initializing EnhancedRecordTracker...');
      
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load tracked records
      await this.loadTrackedRecords();
      
      // Load preserved hostnames
      await this.loadPreservedHostnames();
      
      // Load managed hostnames
      await this.loadManagedHostnames();
      
      this.initialized = true;
      logger.success('EnhancedRecordTracker initialized successfully');
      
      // Log stats
      logger.info(`Loaded ${this.trackedRecords.length} tracked records, ` +
                  `${this.preservedHostnames.length} preserved hostnames, ` +
                  `${this.managedHostnames.length} managed hostnames`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize EnhancedRecordTracker: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Load tracked records from multiple possible sources
   */
  async loadTrackedRecords() {
    try {
      // Try to load from dataStore if available
      if (this.dataStore && typeof this.dataStore.getDnsRecords === 'function') {
        logger.debug('Loading tracked records from dataStore');
        this.trackedRecords = await this.dataStore.getDnsRecords();
        return;
      }
      
      // Try to load from file
      if (fsSync.existsSync(this.trackedRecordsPath)) {
        logger.debug(`Loading tracked records from file: ${this.trackedRecordsPath}`);
        const data = await fs.readFile(this.trackedRecordsPath, 'utf8');
        this.trackedRecords = JSON.parse(data);
        return;
      }
      
      // Fallback to empty array
      logger.debug('No tracked records source found, using empty array');
      this.trackedRecords = [];
    } catch (error) {
      logger.error(`Error loading tracked records: ${error.message}`);
      this.trackedRecords = [];
    }
  }
  
  /**
   * Load preserved hostnames from multiple possible sources
   */
  async loadPreservedHostnames() {
    try {
      // Try to load from dataStore if available
      if (this.dataStore && typeof this.dataStore.getPreservedHostnames === 'function') {
        logger.debug('Loading preserved hostnames from dataStore');
        this.preservedHostnames = await this.dataStore.getPreservedHostnames();
        return;
      }
      
      // Try to load from file
      if (fsSync.existsSync(this.preservedHostnamesPath)) {
        logger.debug(`Loading preserved hostnames from file: ${this.preservedHostnamesPath}`);
        const data = await fs.readFile(this.preservedHostnamesPath, 'utf8');
        this.preservedHostnames = JSON.parse(data);
        return;
      }
      
      // Try from environment variable
      if (process.env.PRESERVED_HOSTNAMES) {
        logger.debug('Loading preserved hostnames from environment variable');
        this.preservedHostnames = process.env.PRESERVED_HOSTNAMES
          .split(',')
          .map(hostname => hostname.trim())
          .filter(hostname => hostname.length > 0);
        return;
      }
      
      // Fallback to empty array
      logger.debug('No preserved hostnames source found, using empty array');
      this.preservedHostnames = [];
    } catch (error) {
      logger.error(`Error loading preserved hostnames: ${error.message}`);
      this.preservedHostnames = [];
    }
  }
  
  /**
   * Load managed hostnames from multiple possible sources
   */
  async loadManagedHostnames() {
    try {
      // Try to load from dataStore if available
      if (this.dataStore && typeof this.dataStore.getManagedHostnames === 'function') {
        logger.debug('Loading managed hostnames from dataStore');
        this.managedHostnames = await this.dataStore.getManagedHostnames();
        return;
      }
      
      // Try to load from file
      if (fsSync.existsSync(this.managedHostnamesPath)) {
        logger.debug(`Loading managed hostnames from file: ${this.managedHostnamesPath}`);
        const data = await fs.readFile(this.managedHostnamesPath, 'utf8');
        this.managedHostnames = JSON.parse(data);
        return;
      }
      
      // Try from environment variable
      if (process.env.MANAGED_HOSTNAMES) {
        logger.debug('Loading managed hostnames from environment variable');
        const managedHostnamesStr = process.env.MANAGED_HOSTNAMES;
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
              content: parts[2] || '',
              ttl: parseInt(parts[3] || '3600', 10),
              proxied: parts[4] ? parts[4].toLowerCase() === 'true' : false
            };
          })
          .filter(config => config && config.hostname && config.hostname.length > 0);
        return;
      }
      
      // Fallback to empty array
      logger.debug('No managed hostnames source found, using empty array');
      this.managedHostnames = [];
    } catch (error) {
      logger.error(`Error loading managed hostnames: ${error.message}`);
      this.managedHostnames = [];
    }
  }
  
  /**
   * Save tracked records to file
   */
  async saveTrackedRecords() {
    try {
      // Try to save to dataStore if available
      if (this.dataStore && typeof this.dataStore.setDnsRecords === 'function') {
        logger.debug('Saving tracked records to dataStore');
        await this.dataStore.setDnsRecords(this.trackedRecords);
        return true;
      }
      
      // Save to file as fallback
      logger.debug(`Saving tracked records to file: ${this.trackedRecordsPath}`);
      await fs.writeFile(
        this.trackedRecordsPath,
        JSON.stringify(this.trackedRecords, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      logger.error(`Error saving tracked records: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Save preserved hostnames to file
   */
  async savePreservedHostnames() {
    try {
      // Try to save to dataStore if available
      if (this.dataStore && typeof this.dataStore.setPreservedHostnames === 'function') {
        logger.debug('Saving preserved hostnames to dataStore');
        await this.dataStore.setPreservedHostnames(this.preservedHostnames);
        return true;
      }
      
      // Save to file as fallback
      logger.debug(`Saving preserved hostnames to file: ${this.preservedHostnamesPath}`);
      await fs.writeFile(
        this.preservedHostnamesPath,
        JSON.stringify(this.preservedHostnames, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      logger.error(`Error saving preserved hostnames: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Save managed hostnames to file
   */
  async saveManagedHostnames() {
    try {
      // Try to save to dataStore if available
      if (this.dataStore && typeof this.dataStore.setManagedHostnames === 'function') {
        logger.debug('Saving managed hostnames to dataStore');
        await this.dataStore.setManagedHostnames(this.managedHostnames);
        return true;
      }
      
      // Save to file as fallback
      logger.debug(`Saving managed hostnames to file: ${this.managedHostnamesPath}`);
      await fs.writeFile(
        this.managedHostnamesPath,
        JSON.stringify(this.managedHostnames, null, 2),
        'utf8'
      );
      return true;
    } catch (error) {
      logger.error(`Error saving managed hostnames: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Track a DNS record
   * @param {Object} record - DNS record to track
   */
  trackRecord(record) {
    if (!record || !record.name || !record.type) {
      logger.warn('Cannot track invalid record');
      return false;
    }
    
    // Check if record already exists
    const existingIndex = this.trackedRecords.findIndex(r => 
      r.name === record.name && r.type === record.type
    );
    
    const timestamp = new Date().toISOString();
    
    if (existingIndex !== -1) {
      // Update existing record
      this.trackedRecords[existingIndex] = {
        ...this.trackedRecords[existingIndex],
        ...record,
        updatedAt: timestamp
      };
    } else {
      // Add new record
      this.trackedRecords.push({
        ...record,
        createdAt: timestamp,
        managedBy: 'TráfegoDNS'
      });
    }
    
    // Save changes
    this.saveTrackedRecords();
    
    return true;
  }
  
  /**
   * Untrack a DNS record
   * @param {Object} record - DNS record to untrack
   */
  untrackRecord(record) {
    if (!record || !record.name || !record.type) {
      logger.warn('Cannot untrack invalid record');
      return false;
    }
    
    const initialLength = this.trackedRecords.length;
    
    // Remove record
    this.trackedRecords = this.trackedRecords.filter(r => 
      !(r.name === record.name && r.type === record.type)
    );
    
    // If record was found and removed
    if (this.trackedRecords.length < initialLength) {
      this.saveTrackedRecords();
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if a record is tracked
   * @param {Object} record - DNS record to check
   */
  isTracked(record) {
    if (!record || !record.name || !record.type) {
      return false;
    }
    
    return this.trackedRecords.some(r => 
      r.name === record.name && r.type === record.type
    );
  }
  
  /**
   * Update a tracked record's ID
   * @param {Object} oldRecord - Old record to find
   * @param {Object} newRecord - New record data
   */
  updateRecordId(oldRecord, newRecord) {
    if (!oldRecord || !oldRecord.name || !oldRecord.type || !newRecord || !newRecord.id) {
      return false;
    }
    
    const existingIndex = this.trackedRecords.findIndex(r => 
      r.name === oldRecord.name && r.type === oldRecord.type
    );
    
    if (existingIndex !== -1) {
      // Update record with new ID and data
      this.trackedRecords[existingIndex] = {
        ...this.trackedRecords[existingIndex],
        ...newRecord,
        updatedAt: new Date().toISOString()
      };
      
      this.saveTrackedRecords();
      return true;
    }
    
    return false;
  }
  
  /**
   * Get all tracked records
   */
  getAllTrackedRecords() {
    return [...this.trackedRecords];
  }
  
  /**
   * Check if a hostname should be preserved
   * @param {string} hostname - Hostname to check
   */
  shouldPreserveHostname(hostname) {
    if (!hostname) {
      return false;
    }
    
    // Normalize hostname
    const normalizedHostname = hostname.toLowerCase();
    
    // Check for exact match
    if (this.preservedHostnames.some(h => h.toLowerCase() === normalizedHostname)) {
      return true;
    }
    
    // Check for wildcard match
    for (const pattern of this.preservedHostnames) {
      if (pattern.startsWith('*.')) {
        const wildcardDomain = pattern.substring(1).toLowerCase();
        if (normalizedHostname.endsWith(wildcardDomain)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Add a preserved hostname
   * @param {string} hostname - Hostname to preserve
   */
  async addPreservedHostname(hostname) {
    if (!hostname) {
      return false;
    }
    
    // Check if already exists
    if (this.preservedHostnames.includes(hostname)) {
      return true;
    }
    
    // Add hostname
    this.preservedHostnames.push(hostname);
    
    // Save changes
    await this.savePreservedHostnames();
    
    return true;
  }
  
  /**
   * Remove a preserved hostname
   * @param {string} hostname - Hostname to remove
   */
  async removePreservedHostname(hostname) {
    if (!hostname) {
      return false;
    }
    
    const initialLength = this.preservedHostnames.length;
    
    // Remove hostname
    this.preservedHostnames = this.preservedHostnames.filter(h => h !== hostname);
    
    // If hostname was found and removed
    if (this.preservedHostnames.length < initialLength) {
      await this.savePreservedHostnames();
      return true;
    }
    
    return false;
  }
  
  /**
   * Add a managed hostname
   * @param {Object} hostnameData - Hostname data
   */
  async addManagedHostname(hostnameData) {
    if (!hostnameData || !hostnameData.hostname || !hostnameData.type) {
      return false;
    }
    
    // Check if already exists
    const existingIndex = this.managedHostnames.findIndex(h => 
      h.hostname === hostnameData.hostname && h.type === hostnameData.type
    );
    
    if (existingIndex !== -1) {
      // Update existing
      this.managedHostnames[existingIndex] = hostnameData;
    } else {
      // Add new
      this.managedHostnames.push(hostnameData);
    }
    
    // Save changes
    await this.saveManagedHostnames();
    
    return true;
  }
  
  /**
   * Remove a managed hostname
   * @param {string} hostname - Hostname to remove
   */
  async removeManagedHostname(hostname) {
    if (!hostname) {
      return false;
    }
    
    const initialLength = this.managedHostnames.length;
    
    // Remove hostname
    this.managedHostnames = this.managedHostnames.filter(h => h.hostname !== hostname);
    
    // If hostname was found and removed
    if (this.managedHostnames.length < initialLength) {
      await this.saveManagedHostnames();
      return true;
    }
    
    return false;
  }
  
  /**
   * Ensure record tracker is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }
}

module.exports = EnhancedRecordTracker;