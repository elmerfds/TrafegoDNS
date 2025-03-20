/**
 * DataStore.js
 * Central data store for TráfegoDNS
 * Manages all persistent data with transaction support
 */
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('../utils/logger');
const TransactionManager = require('./TransactionManager');
const FileStorage = require('./FileStorage');

class DataStore {
  constructor(config) {
    this.config = config;
    this.baseDir = path.join('/config', 'data');
    this.fileStorage = new FileStorage(this.baseDir);
    this.transactionManager = new TransactionManager(this.fileStorage);
    
    // Default data schemas and file paths
    this.schemas = {
      dnsRecords: {
        filename: 'dns-records.json',
        defaultValue: [],
        validator: this.validateDnsRecords.bind(this)
      },
      preservedHostnames: {
        filename: 'preserved-hostnames.json',
        defaultValue: [],
        validator: this.validatePreservedHostnames.bind(this)
      },
      managedHostnames: {
        filename: 'managed-hostnames.json',
        defaultValue: [],
        validator: this.validateManagedHostnames.bind(this)
      },
      appConfig: {
        filename: 'config.json',
        defaultValue: {},
        validator: this.validateAppConfig.bind(this)
      }
    };
    
    // Cache for data
    this.cache = {};
    
    // Track initialization
    this.initialized = false;
  }
  
  /**
   * Initialize the data store
   * Creates necessary directories and files
   */
  async init() {
    try {
      logger.debug('Initializing DataStore...');
      
      // Create base directory if it doesn't exist
      await this.fileStorage.ensureDir(this.baseDir);
      
      // Create logs directory
      const logsDir = path.join(this.baseDir, 'logs');
      await this.fileStorage.ensureDir(logsDir);
      
      // Initialize file schemas
      await this.initializeSchemas();
      
      // Migrate legacy data if needed
      await this.migrateLegacyData();
      
      this.initialized = true;
      logger.success('DataStore initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DataStore: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize schemas by creating default files if they don't exist
   */
  async initializeSchemas() {
    for (const [schemaName, schema] of Object.entries(this.schemas)) {
      const filePath = path.join(this.baseDir, schema.filename);
      
      try {
        // Check if file exists
        await fs.access(filePath);
        logger.debug(`Schema file exists: ${schema.filename}`);
        
        // Load into cache
        const data = await this.fileStorage.readJsonFile(filePath);
        this.cache[schemaName] = data;
      } catch (error) {
        // File doesn't exist, create with default value
        logger.info(`Creating default schema file: ${schema.filename}`);
        await this.fileStorage.writeJsonFile(filePath, schema.defaultValue);
        this.cache[schemaName] = schema.defaultValue;
      }
    }
  }
  
  /**
   * Migrate data from legacy locations
   */
  async migrateLegacyData() {
    try {
      await this.migrateLegacyDnsRecords();
      await this.migrateLegacyEnvVars();
    } catch (error) {
      logger.error(`Error migrating legacy data: ${error.message}`);
      // Continue initialization despite migration errors
    }
  }
  
  /**
   * Migrate DNS records from legacy location
   */
  async migrateLegacyDnsRecords() {
    const legacyPath = path.join(process.cwd(), 'dns-records.json');
    
    try {
      // Check if legacy file exists
      await fs.access(legacyPath);
      
      logger.info('Found legacy DNS records file, migrating...');
      
      // Read legacy data
      const legacyData = await this.fileStorage.readJsonFile(legacyPath);
      
      // Merge with current data (avoid duplicates)
      const currentRecords = await this.getDnsRecords();
      const mergedRecords = this.mergeDnsRecords(currentRecords, legacyData);
      
      // Save merged data
      await this.setDnsRecords(mergedRecords);
      
      // Create backup of legacy file
      const backupPath = `${legacyPath}.backup`;
      await fs.copyFile(legacyPath, backupPath);
      
      logger.success(`Migrated ${legacyData.length} DNS records from legacy location`);
    } catch (error) {
      // If file doesn't exist or can't be read, just log and continue
      if (error.code === 'ENOENT') {
        logger.debug('No legacy DNS records file found, skipping migration');
      } else {
        logger.error(`Error migrating legacy DNS records: ${error.message}`);
      }
    }
  }
  
  /**
   * Migrate data from environment variables
   */
  async migrateLegacyEnvVars() {
    // Migrate preserved hostnames from env var
    if (process.env.PRESERVED_HOSTNAMES) {
      try {
        const preservedHostnames = process.env.PRESERVED_HOSTNAMES
          .split(',')
          .map(hostname => hostname.trim())
          .filter(hostname => hostname.length > 0);
        
        if (preservedHostnames.length > 0) {
          logger.info(`Migrating ${preservedHostnames.length} preserved hostnames from environment variable`);
          await this.setPreservedHostnames(preservedHostnames);
        }
      } catch (error) {
        logger.error(`Error migrating preserved hostnames: ${error.message}`);
      }
    }
    
    // Migrate managed hostnames from env var
    if (process.env.MANAGED_HOSTNAMES) {
      try {
        const managedHostnamesStr = process.env.MANAGED_HOSTNAMES;
        const managedHostnames = managedHostnamesStr
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
        
        if (managedHostnames.length > 0) {
          logger.info(`Migrating ${managedHostnames.length} managed hostnames from environment variable`);
          await this.setManagedHostnames(managedHostnames);
        }
      } catch (error) {
        logger.error(`Error migrating managed hostnames: ${error.message}`);
      }
    }
  }
  
  /**
   * Merge DNS records, avoiding duplicates
   */
  mergeDnsRecords(currentRecords, newRecords) {
    // Create a map of existing records for quick lookup
    const existingMap = new Map();
    
    for (const record of currentRecords) {
      const key = this.getDnsRecordKey(record);
      existingMap.set(key, record);
    }
    
    // Add new records that don't already exist
    for (const record of newRecords) {
      const key = this.getDnsRecordKey(record);
      if (!existingMap.has(key)) {
        existingMap.set(key, record);
      }
    }
    
    // Convert map back to array
    return Array.from(existingMap.values());
  }
  
  /**
   * Create a unique key for a DNS record
   */
  getDnsRecordKey(record) {
    return `${record.provider || ''}:${record.domain || ''}:${record.name || ''}:${record.type || ''}`.toLowerCase();
  }
  
  /**
   * Get DNS records
   */
  async getDnsRecords() {
    await this.ensureInitialized();
    return this.cache.dnsRecords || [];
  }
  
  /**
   * Set DNS records
   */
  async setDnsRecords(records) {
    await this.ensureInitialized();
    
    // Validate records
    this.validateDnsRecords(records);
    
    // Start transaction
    const transaction = this.transactionManager.startTransaction();
    
    try {
      // Update file
      const filePath = path.join(this.baseDir, this.schemas.dnsRecords.filename);
      await transaction.writeJsonFile(filePath, records);
      
      // Update cache
      this.cache.dnsRecords = records;
      
      // Commit transaction
      await transaction.commit();
      
      return true;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      logger.error(`Failed to set DNS records: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get preserved hostnames
   */
  async getPreservedHostnames() {
    await this.ensureInitialized();
    return this.cache.preservedHostnames || [];
  }
  
  /**
   * Set preserved hostnames
   */
  async setPreservedHostnames(hostnames) {
    await this.ensureInitialized();
    
    // Validate hostnames
    this.validatePreservedHostnames(hostnames);
    
    // Start transaction
    const transaction = this.transactionManager.startTransaction();
    
    try {
      // Update file
      const filePath = path.join(this.baseDir, this.schemas.preservedHostnames.filename);
      await transaction.writeJsonFile(filePath, hostnames);
      
      // Update cache
      this.cache.preservedHostnames = hostnames;
      
      // Commit transaction
      await transaction.commit();
      
      return true;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      logger.error(`Failed to set preserved hostnames: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a preserved hostname
   */
  async addPreservedHostname(hostname) {
    await this.ensureInitialized();
    
    // Get current hostnames
    const hostnames = await this.getPreservedHostnames();
    
    // Check if hostname already exists
    if (hostnames.includes(hostname)) {
      return true; // Already exists, no need to add
    }
    
    // Add new hostname
    hostnames.push(hostname);
    
    // Save updated list
    return this.setPreservedHostnames(hostnames);
  }
  
  /**
   * Remove a preserved hostname
   */
  async removePreservedHostname(hostname) {
    await this.ensureInitialized();
    
    // Get current hostnames
    const hostnames = await this.getPreservedHostnames();
    
    // Filter out the hostname to remove
    const updatedHostnames = hostnames.filter(h => h !== hostname);
    
    // If no change, return early
    if (updatedHostnames.length === hostnames.length) {
      return true; // Hostname wasn't in the list
    }
    
    // Save updated list
    return this.setPreservedHostnames(updatedHostnames);
  }
  
  /**
   * Get managed hostnames
   */
  async getManagedHostnames() {
    await this.ensureInitialized();
    return this.cache.managedHostnames || [];
  }
  
  /**
   * Set managed hostnames
   */
  async setManagedHostnames(hostnames) {
    await this.ensureInitialized();
    
    // Validate hostnames
    this.validateManagedHostnames(hostnames);
    
    // Start transaction
    const transaction = this.transactionManager.startTransaction();
    
    try {
      // Update file
      const filePath = path.join(this.baseDir, this.schemas.managedHostnames.filename);
      await transaction.writeJsonFile(filePath, hostnames);
      
      // Update cache
      this.cache.managedHostnames = hostnames;
      
      // Commit transaction
      await transaction.commit();
      
      return true;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      logger.error(`Failed to set managed hostnames: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Add a managed hostname
   */
  async addManagedHostname(hostnameData) {
    await this.ensureInitialized();
    
    // Get current managed hostnames
    const managedHostnames = await this.getManagedHostnames();
    
    // Check if hostname already exists
    const index = managedHostnames.findIndex(h => 
      h.hostname === hostnameData.hostname && h.type === hostnameData.type
    );
    
    if (index !== -1) {
      // Update existing record
      managedHostnames[index] = hostnameData;
    } else {
      // Add new record
      managedHostnames.push(hostnameData);
    }
    
    // Save updated list
    return this.setManagedHostnames(managedHostnames);
  }
  
  /**
   * Remove a managed hostname
   */
  async removeManagedHostname(hostname) {
    await this.ensureInitialized();
    
    // Get current managed hostnames
    const managedHostnames = await this.getManagedHostnames();
    
    // Filter out the hostname to remove
    const updatedHostnames = managedHostnames.filter(h => h.hostname !== hostname);
    
    // If no change, return early
    if (updatedHostnames.length === managedHostnames.length) {
      return true; // Hostname wasn't in the list
    }
    
    // Save updated list
    return this.setManagedHostnames(updatedHostnames);
  }
  
  /**
   * Get application configuration
   */
  async getAppConfig() {
    await this.ensureInitialized();
    return this.cache.appConfig || {};
  }
  
  /**
   * Set application configuration
   */
  async setAppConfig(config) {
    await this.ensureInitialized();
    
    // Validate config
    this.validateAppConfig(config);
    
    // Start transaction
    const transaction = this.transactionManager.startTransaction();
    
    try {
      // Update file
      const filePath = path.join(this.baseDir, this.schemas.appConfig.filename);
      await transaction.writeJsonFile(filePath, config);
      
      // Update cache
      this.cache.appConfig = config;
      
      // Commit transaction
      await transaction.commit();
      
      return true;
    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      logger.error(`Failed to set application config: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update specific config value
   */
  async updateAppConfig(key, value) {
    await this.ensureInitialized();
    
    // Get current config
    const config = await this.getAppConfig();
    
    // Update value
    config[key] = value;
    
    // Save updated config
    return this.setAppConfig(config);
  }
  
  /**
   * Ensure the data store is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }
  
  /*
   * Validation methods
   */
  
  validateDnsRecords(records) {
    if (!Array.isArray(records)) {
      throw new Error('DNS records must be an array');
    }
    
    // Additional validation could be added here
    return true;
  }
  
  validatePreservedHostnames(hostnames) {
    if (!Array.isArray(hostnames)) {
      throw new Error('Preserved hostnames must be an array');
    }
    
    // Check that all items are strings
    for (const hostname of hostnames) {
      if (typeof hostname !== 'string') {
        throw new Error('Preserved hostnames must be strings');
      }
    }
    
    return true;
  }
  
  validateManagedHostnames(hostnames) {
    if (!Array.isArray(hostnames)) {
      throw new Error('Managed hostnames must be an array');
    }
    
    // Check that all items have required properties
    for (const hostname of hostnames) {
      if (!hostname.hostname || !hostname.type || hostname.content === undefined) {
        throw new Error('Managed hostnames must have hostname, type, and content properties');
      }
    }
    
    return true;
  }
  
  validateAppConfig(config) {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Application config must be an object');
    }
    
    return true;
  }
  
  /**
   * Add a DNS record to tracking
   */
  async trackDnsRecord(record) {
    const records = await this.getDnsRecords();
    
    // Check if record already exists
    const key = this.getDnsRecordKey(record);
    const existingIndex = records.findIndex(r => this.getDnsRecordKey(r) === key);
    
    if (existingIndex !== -1) {
      // Update existing record
      records[existingIndex] = {
        ...records[existingIndex],
        ...record,
        updatedAt: new Date().toISOString()
      };
    } else {
      // Add new record
      records.push({
        ...record,
        createdAt: new Date().toISOString(),
        managedBy: 'TráfegoDNS'
      });
    }
    
    // Save updated list
    return this.setDnsRecords(records);
  }
  
  /**
   * Remove a DNS record from tracking
   */
  async untrackDnsRecord(record) {
    const records = await this.getDnsRecords();
    
    // Create a unique key for the record
    const key = this.getDnsRecordKey(record);
    
    // Filter out the record to remove
    const updatedRecords = records.filter(r => this.getDnsRecordKey(r) !== key);
    
    // If no change, return early
    if (updatedRecords.length === records.length) {
      return true; // Record wasn't in the list
    }
    
    // Save updated list
    return this.setDnsRecords(updatedRecords);
  }
  
  /**
   * Check if a DNS record is tracked
   */
  async isDnsRecordTracked(record) {
    const records = await this.getDnsRecords();
    
    // Create a unique key for the record
    const key = this.getDnsRecordKey(record);
    
    // Check if the record exists
    return records.some(r => this.getDnsRecordKey(r) === key);
  }
  
  /**
   * Refresh cache from disk
   * Used to ensure consistency if files might have been modified externally
   */
  async refreshCache() {
    for (const [schemaName, schema] of Object.entries(this.schemas)) {
      const filePath = path.join(this.baseDir, schema.filename);
      
      try {
        // Load into cache
        const data = await this.fileStorage.readJsonFile(filePath);
        this.cache[schemaName] = data;
      } catch (error) {
        logger.error(`Failed to refresh cache for ${schema.filename}: ${error.message}`);
        // Keep existing cache on error
      }
    }
  }
}

module.exports = DataStore;