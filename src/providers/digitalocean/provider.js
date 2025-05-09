/**
 * DigitalOcean DNS Provider
 * Core implementation of the DNSProvider interface for DigitalOcean
 */
const DNSProvider = require('../base');
const logger = require('../../utils/logger');

// Import API functions
const { 
  initializeClient, 
  verifyDomain, 
  fetchAllRecords 
} = require('./api');

// Import record utilities
const { 
  findRecordInCache 
} = require('./recordUtils');

// Import cache utilities
const { 
  updateRecordInCache,
  removeRecordFromCache 
} = require('./cacheUtils');

// Import record operations
const { 
  createRecord,
  updateRecord,
  deleteRecord
} = require('./operations');

// Import batch operations
const { 
  batchEnsureRecords 
} = require('./batchOperations');

// Import apex domain utilities
const { 
  handleApexDomain 
} = require('./apex');

class DigitalOceanProvider extends DNSProvider {
  constructor(config) {
    super(config);
    
    logger.trace('DigitalOceanProvider.constructor: Initializing with config');
    
    this.token = config.digitalOceanToken;
    this.domain = config.digitalOceanDomain;
    
    // Initialize Axios client
    this.client = initializeClient(this.token, config.apiTimeout);
    
    logger.trace('DigitalOceanProvider.constructor: Axios client initialized');
  }
  
  /**
   * Initialize API by verifying domain exists
   */
  async init() {
    logger.trace(`DigitalOceanProvider.init: Starting initialization for domain "${this.domain}"`);
    
    try {
      // Verify the domain exists
      logger.trace('DigitalOceanProvider.init: Verifying domain exists in DigitalOcean');
      await verifyDomain(this.client, this.domain);
      
      logger.success('DigitalOcean domain authenticated successfully');
      
      // Initialize the DNS record cache
      logger.trace('DigitalOceanProvider.init: Initializing DNS record cache');
      await this.refreshRecordCache();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DigitalOcean API: ${error.message}`);
      logger.trace(`DigitalOceanProvider.init: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Refresh the DNS record cache
   */
  async refreshRecordCache() {
    logger.trace('DigitalOceanProvider.refreshRecordCache: Starting cache refresh');
    
    try {
      logger.debug('Refreshing DNS record cache from DigitalOcean');
      
      // Get all records for the domain
      logger.trace(`DigitalOceanProvider.refreshRecordCache: Fetching records for domain ${this.domain}`);
      
      const records = await fetchAllRecords(this.client, this.domain);
      const oldRecordCount = this.recordCache.records.length;
      
      this.recordCache = {
        records: records,
        lastUpdated: Date.now()
      };
      
      logger.debug(`Cached ${this.recordCache.records.length} DNS records from DigitalOcean`);
      logger.trace(`DigitalOceanProvider.refreshRecordCache: Cache updated from ${oldRecordCount} to ${this.recordCache.records.length} records`);
      
      // In TRACE mode, output the entire cache for debugging
      if (logger.level >= 4) { // TRACE level
        logger.trace('DigitalOceanProvider.refreshRecordCache: Current cache contents:');
        this.recordCache.records.forEach((record, index) => {
          logger.trace(`Record[${index}]: type=${record.type}, name=${record.name}, data=${record.data}`);
        });
      }
      
      return this.recordCache.records;
    } catch (error) {
      logger.error(`Failed to refresh DNS record cache: ${error.message}`);
      logger.trace(`DigitalOceanProvider.refreshRecordCache: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Update a record in the cache
   */
  updateRecordInCache(record) {
    updateRecordInCache(this.recordCache, record);
  }
  
  /**
   * Remove a record from the cache
   */
  removeRecordFromCache(id) {
    removeRecordFromCache(this.recordCache, id);
  }
  
  /**
   * List DNS records with optional filtering
   */
  async listRecords(params = {}) {
    logger.trace(`DigitalOceanProvider.listRecords: Listing records with params: ${JSON.stringify(params)}`);
    
    try {
      // If specific filters are used other than type and name, bypass cache
      const bypassCache = Object.keys(params).some(
        key => !['type', 'name'].includes(key)
      );
      
      if (bypassCache) {
        logger.debug('Bypassing cache due to complex filters');
        logger.trace(`DigitalOceanProvider.listRecords: Bypassing cache due to filters: ${JSON.stringify(params)}`);
        
        const records = await fetchAllRecords(this.client, this.domain);
        
        // Apply filters manually since DO API has limited filtering
        const filteredRecords = records.filter(record => {
          let match = true;
          
          if (params.type && record.type !== params.type) {
            match = false;
          }
          
          if (params.name) {
            // Handle the @ symbol for apex domain
            const recordName = record.name === '@' ? this.domain : `${record.name}.${this.domain}`;
            if (recordName !== params.name) {
              match = false;
            }
          }
          
          return match;
        });
        
        logger.trace(`DigitalOceanProvider.listRecords: API filtering returned ${filteredRecords.length} records`);
        return filteredRecords;
      }
      
      // Use cache for simple type/name filtering
      logger.trace('DigitalOceanProvider.listRecords: Using cache with filters');
      const records = await this.getRecordsFromCache();
      
      // Apply filters
      const filteredRecords = records.filter(record => {
        let match = true;
        
        if (params.type && record.type !== params.type) {
          match = false;
        }
        
        if (params.name) {
          // Handle the @ symbol for apex domain
          const recordName = record.name === '@' ? this.domain : `${record.name}.${this.domain}`;
          if (recordName !== params.name) {
            match = false;
          }
        }
        
        return match;
      });
      
      logger.trace(`DigitalOceanProvider.listRecords: Cache filtering returned ${filteredRecords.length} records`);
      
      return filteredRecords;
    } catch (error) {
      logger.error(`Failed to list DNS records: ${error.message}`);
      logger.trace(`DigitalOceanProvider.listRecords: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Find a record in the cache
   * Override the base method to handle DigitalOcean's @ symbol for apex domains
   * and trailing dots for domains
   */
  findRecordInCache(type, name) {
    return findRecordInCache(this.recordCache, type, name, this.domain);
  }
  
  /**
   * Create a new DNS record
   */
  async createRecord(record) {
    return await createRecord(this.client, this.domain, record, 
                             this.updateRecordInCache.bind(this));
  }
  
  /**
   * Update an existing DNS record
   */
  async updateRecord(id, record) {
    return await updateRecord(this.client, this.domain, id, record, 
                             this.updateRecordInCache.bind(this));
  }
  
  /**
   * Delete a DNS record
   */
  async deleteRecord(id) {
    return await deleteRecord(this.client, this.domain, id, this.recordCache, 
                             this.removeRecordFromCache.bind(this));
  }
  
  /**
   * Special handler for apex domain records
   */
  async handleApexDomain(record) {
    return await handleApexDomain(this.client, this.domain, record, 
                                 this.recordCache, this.updateRecordInCache.bind(this));
  }
  
  /**
   * Batch process multiple DNS records at once
   */
  async batchEnsureRecords(recordConfigs) {
    return await batchEnsureRecords(
      this.client, 
      this.domain, 
      this.config,
      recordConfigs, 
      this.recordCache,
      this.updateRecordInCache.bind(this),
      this.removeRecordFromCache.bind(this),
      createRecord,
      updateRecord
    );
  }
}

module.exports = DigitalOceanProvider;