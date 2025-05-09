/**
 * Cloudflare DNS Provider
 * Core implementation of the DNSProvider interface for Cloudflare
 */
const DNSProvider = require('../base');
const logger = require('../../utils/logger');

// Import API functions
const { 
  initializeClient, 
  fetchZoneId, 
  fetchRecords 
} = require('./api');

// Import cache utilities
const {
  updateRecordInCache,
  removeRecordFromCache
} = require('./cacheUtils');

// Import record utilities
const {
  recordNeedsUpdate
} = require('./recordUtils');

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

class CloudflareProvider extends DNSProvider {
  constructor(config) {
    super(config);
    
    logger.trace('CloudflareProvider.constructor: Initialising with config');
    
    this.token = config.cloudflareToken;
    this.zone = config.cloudflareZone;
    this.zoneId = null;
    
    // Initialize Axios client
    this.client = initializeClient(this.token, config.apiTimeout);
    
    logger.trace('CloudflareProvider.constructor: Axios client initialized');
  }
  
  /**
   * Initialize API by fetching zone ID
   */
  async init() {
    logger.trace(`CloudflareProvider.init: Starting initialization for zone "${this.zone}"`);
    
    try {
      // Look up zone ID
      logger.trace('CloudflareProvider.init: Fetching zone ID from Cloudflare');
      this.zoneId = await fetchZoneId(this.client, this.zone);
      logger.success('Cloudflare zone authenticated successfully');
      
      // Initialize the DNS record cache
      logger.trace('CloudflareProvider.init: Initialising DNS record cache');
      await this.refreshRecordCache();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Cloudflare API: ${error.message}`);
      logger.trace(`CloudflareProvider.init: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw new Error(`Failed to initialize Cloudflare API: ${error.message}`);
    }
  }
  
  /**
   * Refresh the DNS record cache
   */
  async refreshRecordCache() {
    logger.trace('CloudflareProvider.refreshRecordCache: Starting cache refresh');
    
    try {
      logger.debug('Refreshing DNS record cache from Cloudflare');
      
      if (!this.zoneId) {
        logger.trace('CloudflareProvider.refreshRecordCache: No zoneId, initialising first');
        await this.init();
        return;
      }
      
      // Get all records for the zone
      logger.trace(`CloudflareProvider.refreshRecordCache: Fetching records for zone ${this.zoneId}`);
      
      const records = await fetchRecords(this.client, this.zoneId);
      const oldRecordCount = this.recordCache.records.length;
      
      this.recordCache = {
        records,
        lastUpdated: Date.now()
      };
      
      logger.debug(`Cached ${this.recordCache.records.length} DNS records from Cloudflare`);
      logger.trace(`CloudflareProvider.refreshRecordCache: Cache updated from ${oldRecordCount} to ${this.recordCache.records.length} records`);
      
      // In TRACE mode, output the entire cache for debugging
      if (logger.level >= 4) { // TRACE level
        logger.trace('CloudflareProvider.refreshRecordCache: Current cache contents:');
        this.recordCache.records.forEach((record, index) => {
          logger.trace(`Record[${index}]: type=${record.type}, name=${record.name}, content=${record.content}`);
        });
      }
      
      return this.recordCache.records;
    } catch (error) {
      logger.error(`Failed to refresh DNS record cache: ${error.message}`);
      logger.trace(`CloudflareProvider.refreshRecordCache: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
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
    logger.trace(`CloudflareProvider.listRecords: Listing records with params: ${JSON.stringify(params)}`);
    
    try {
      // If specific filters are used other than type and name, bypass cache
      const bypassCache = Object.keys(params).some(
        key => !['type', 'name'].includes(key)
      );
      
      if (bypassCache) {
        logger.debug('Bypassing cache due to complex filters');
        logger.trace(`CloudflareProvider.listRecords: Bypassing cache due to filters: ${JSON.stringify(params)}`);
        
        if (!this.zoneId) {
          logger.trace('CloudflareProvider.listRecords: No zoneId, initialising first');
          await this.init();
        }
        
        logger.trace(`CloudflareProvider.listRecords: Directly querying Cloudflare API with filters`);
        const response = await this.client.get(`/zones/${this.zoneId}/dns_records`, {
          params
        });
        
        logger.trace(`CloudflareProvider.listRecords: API returned ${response.data.result.length} records`);
        return response.data.result;
      }
      
      // Use cache for simple type/name filtering
      logger.trace('CloudflareProvider.listRecords: Using cache with filters');
      const records = await this.getRecordsFromCache();
      
      // Apply filters
      const filteredRecords = records.filter(record => {
        let match = true;
        
        if (params.type && record.type !== params.type) {
          match = false;
        }
        
        if (params.name && record.name !== params.name) {
          match = false;
        }
        
        return match;
      });
      
      logger.trace(`CloudflareProvider.listRecords: Cache filtering returned ${filteredRecords.length} records`);
      
      return filteredRecords;
    } catch (error) {
      logger.error(`Failed to list DNS records: ${error.message}`);
      logger.trace(`CloudflareProvider.listRecords: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Create a new DNS record
   */
  async createRecord(record) {
    try {
      if (!this.zoneId) {
        logger.trace('CloudflareProvider.createRecord: No zoneId, initialising first');
        await this.init();
      }
      
      return await createRecord(
        this.client, 
        this.zoneId, 
        record, 
        this.updateRecordInCache.bind(this)
      );
    } catch (error) {
      logger.error(`Failed to create record: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update an existing DNS record
   */
  async updateRecord(id, record) {
    try {
      if (!this.zoneId) {
        logger.trace('CloudflareProvider.updateRecord: No zoneId, initialising first');
        await this.init();
      }
      
      return await updateRecord(
        this.client, 
        this.zoneId, 
        id, 
        record, 
        this.updateRecordInCache.bind(this)
      );
    } catch (error) {
      logger.error(`Failed to update record: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a DNS record
   */
  async deleteRecord(id) {
    try {
      if (!this.zoneId) {
        logger.trace('CloudflareProvider.deleteRecord: No zoneId, initialising first');
        await this.init();
      }
      
      return await deleteRecord(
        this.client, 
        this.zoneId, 
        id, 
        this.recordCache, 
        this.removeRecordFromCache.bind(this)
      );
    } catch (error) {
      logger.error(`Failed to delete record: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a record needs to be updated
   */
  recordNeedsUpdate(existing, newRecord) {
    return recordNeedsUpdate(existing, newRecord);
  }
  
  /**
   * Batch process multiple DNS records at once
   */
  async batchEnsureRecords(recordConfigs) {
    return await batchEnsureRecords(
      this.config,
      recordConfigs,
      this.getRecordsFromCache.bind(this),
      this.findRecordInCache.bind(this),
      this.recordNeedsUpdate.bind(this),
      this.createRecord.bind(this),
      this.updateRecord.bind(this)
    );
  }
}

module.exports = CloudflareProvider;