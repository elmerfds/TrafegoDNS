/**
 * CloudFlare Zero Trust Provider
 * Core implementation of the DNSProvider interface for CloudFlare Zero Trust Tunnel public hostnames
 */
const axios = require('axios');
const DNSProvider = require('../base');
const logger = require('../../utils/logger');
const { convertToCFZeroTrustFormat } = require('./converter');
const { validateRecord } = require('./validator');

// Global cache to prevent frequent updates to the same records
const recentlyUpdatedRecords = new Map();

class CFZeroTrustProvider extends DNSProvider {
  constructor(config) {
    super(config);
    
    logger.trace('CFZeroTrustProvider.constructor: Initialising with config');
    
    this.token = config.cloudflareToken;
    this.accountId = config.cloudflareAccountId;
    this.defaultTunnelId = config.cfzerotrustTunnelId;
    this.zone = config.cloudflareZone;
    
    // Track tunnels that we've validated
    this.validatedTunnels = new Set();
    
    // Initialize Axios client
    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: config.apiTimeout  // Use the configurable timeout
    });
    
    logger.trace('CFZeroTrustProvider.constructor: Axios client initialized');
  }
  
  /**
   * Initialize API by verifying account and tunnel access
   */
  async init() {
    logger.trace(`CFZeroTrustProvider.init: Starting initialization for account "${this.accountId}" and default tunnel "${this.defaultTunnelId}"`);
    
    try {
      // First verify account access
      logger.trace('CFZeroTrustProvider.init: Verifying account access');
      await this.client.get(`/accounts/${this.accountId}`);
      
      // Then verify tunnel access 
      logger.trace(`CFZeroTrustProvider.init: Verifying default tunnel access for tunnel ${this.defaultTunnelId}`);
      await this.client.get(`/accounts/${this.accountId}/cfd_tunnel/${this.defaultTunnelId}`);
      
      // Add default tunnel to validated set
      this.validatedTunnels.add(this.defaultTunnelId);
      
      logger.success('CloudFlare Zero Trust authenticated successfully');
      
      // Initialize the tunnel hostname cache with default tunnel
      logger.trace('CFZeroTrustProvider.init: Initialising hostname cache');
      await this.refreshRecordCache();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize CloudFlare Zero Trust API: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.init: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw new Error(`Failed to initialize CloudFlare Zero Trust API: ${error.message}`);
    }
  }

  /**
   * Verify access to a specific tunnel
   */
  async verifyTunnelAccess(tunnelId) {
    // Skip if already validated
    if (this.validatedTunnels.has(tunnelId)) {
      return true;
    }
    
    try {
      logger.trace(`CFZeroTrustProvider.verifyTunnelAccess: Verifying tunnel access for tunnel ${tunnelId}`);
      await this.client.get(`/accounts/${this.accountId}/cfd_tunnel/${tunnelId}`);
      
      // Add to validated set
      this.validatedTunnels.add(tunnelId);
      logger.debug(`Verified access to CloudFlare tunnel: ${tunnelId}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to verify access to CloudFlare tunnel ${tunnelId}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Refresh the hostname cache for default tunnel
   */
  async refreshRecordCache() {
    logger.trace('CFZeroTrustProvider.refreshRecordCache: Starting cache refresh');
    
    try {
      logger.debug('Refreshing hostname cache from CloudFlare Zero Trust');
      
      // Get all hostnames configured for the default tunnel
      const records = await this.getTunnelHostnames(this.defaultTunnelId);
      
      this.recordCache = {
        records: records,
        lastUpdated: Date.now()
      };
      
      logger.debug(`Cached ${this.recordCache.records.length} hostnames from CloudFlare Zero Trust tunnel`);
      
      // In TRACE mode, output the entire cache for debugging
      if (logger.level >= 4) { // TRACE level
        logger.trace('CFZeroTrustProvider.refreshRecordCache: Current cache contents:');
        this.recordCache.records.forEach((record, index) => {
          logger.trace(`Record[${index}]: hostname=${record.name}, service=${record.content}, path=${record.path}`);
        });
      }
      
      return this.recordCache.records;
    } catch (error) {
      logger.error(`Failed to refresh hostname cache: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.refreshRecordCache: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Get hostnames for a specific tunnel
   */
  async getTunnelHostnames(tunnelId) {
    try {
      logger.trace(`CFZeroTrustProvider.getTunnelHostnames: Getting hostnames for tunnel ${tunnelId}`);
      
      // Verify tunnel access first
      if (!await this.verifyTunnelAccess(tunnelId)) {
        throw new Error(`No access to tunnel ${tunnelId}`);
      }
      
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`
      );
      
      // Extract the configured hostnames from the response
      const config = response.data.result.config || {};
      const ingress = config.ingress || [];
      
      // Transform ingress rules to standard record format
      const records = ingress
        .filter(rule => rule.hostname && rule.hostname !== '') // Skip catchall rule (no hostname)
        .map(rule => ({
          id: `${tunnelId}:${rule.hostname}`,
          name: rule.hostname,
          type: 'CNAME', // Using CNAME type for consistency, though it's not a real DNS record
          content: rule.service,
          path: rule.path || '',
          tunnelId: tunnelId,
          config: { ...rule },  // Store the full configuration for reference
          lastUpdated: Date.now() // Add timestamp for when the record was retrieved
        }));
      
      logger.debug(`Found ${records.length} hostnames in tunnel ${tunnelId}`);
      return records;
    } catch (error) {
      logger.error(`Failed to get hostnames for tunnel ${tunnelId}: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Find a record in the cache
   * @param {string} type - Record type (ignored for this provider)
   * @param {string} name - Hostname
   * @param {string} tunnelId - Optional tunnel ID to search in
   * @returns {Object|null} - The found record or null
   */
  findRecordInCache(type, name, tunnelId = null) {
    // If tunnelId specified, look for exact match
    if (tunnelId) {
      return this.recordCache.records.find(
        record => record.name === name && record.tunnelId === tunnelId
      );
    }
    
    // Otherwise just match by hostname (first match wins)
    return this.recordCache.records.find(
      record => record.name === name
    );
  }
  
  /**
   * List hostnames with optional filtering
   */
  async listRecords(params = {}) {
    logger.trace(`CFZeroTrustProvider.listRecords: Listing records with params: ${JSON.stringify(params)}`);
    
    try {
      // Use cache for hostname filtering
      logger.trace('CFZeroTrustProvider.listRecords: Using cache with filters');
      const records = await this.getRecordsFromCache();
      
      // Apply filters
      const filteredRecords = records.filter(record => {
        let match = true;
        
        if (params.name && record.name !== params.name) {
          match = false;
        }
        
        if (params.tunnelId && record.tunnelId !== params.tunnelId) {
          match = false;
        }
        
        return match;
      });
      
      logger.trace(`CFZeroTrustProvider.listRecords: Cache filtering returned ${filteredRecords.length} records`);
      
      return filteredRecords;
    } catch (error) {
      logger.error(`Failed to list hostnames: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.listRecords: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Create a new hostname configuration
   */
  async createRecord(record) {
    // Determine which tunnel to use - default or custom
    const tunnelId = record.tunnelId || this.defaultTunnelId;
    
    logger.trace(`CFZeroTrustProvider.createRecord: Creating hostname=${record.name}, service=${record.content}, tunnelId=${tunnelId}`);
    
    try {
      // Validate the record first
      validateRecord(record);
      
      // Verify tunnel access
      if (!await this.verifyTunnelAccess(tunnelId)) {
        throw new Error(`No access to tunnel ${tunnelId}`);
      }
      
      // Get the current tunnel configuration
      logger.trace(`CFZeroTrustProvider.createRecord: Fetching current tunnel configuration for ${tunnelId}`);
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`
      );
      
      const tunnelConfig = response.data.result.config || {};
      let ingress = tunnelConfig.ingress || [];
      
      // Check if hostname already exists (defensive check)
      const existingIndex = ingress.findIndex(rule => rule.hostname === record.name);
      if (existingIndex >= 0) {
        logger.warn(`Hostname ${record.name} already exists in tunnel ${tunnelId} configuration, updating instead of creating`);
        // Update existing rule if found
        ingress[existingIndex] = convertToCFZeroTrustFormat(record);
      } else {
        // Prepare the new ingress rule
        const newIngressRule = convertToCFZeroTrustFormat(record);
        
        // Insert the new rule before the catch-all rule (which should be last)
        if (ingress.length > 0 && !ingress[ingress.length - 1].hostname) {
          // If there's a catch-all rule (no hostname), insert before it
          ingress.splice(ingress.length - 1, 0, newIngressRule);
        } else {
          // Otherwise just add to the end
          ingress.push(newIngressRule);
          
          // Add a catch-all rule if none exists
          if (!ingress.find(rule => !rule.hostname)) {
            ingress.push({
              service: "http_status:404",
              hostname: ""
            });
          }
        }
      }
      
      // Update the tunnel configuration
      logger.trace(`CFZeroTrustProvider.createRecord: Updating tunnel ${tunnelId} configuration`);
      await this.client.put(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
        {
          config: {
            ...tunnelConfig,
            ingress: ingress
          }
        }
      );
      
      // Construct the created record
      const createdRecord = {
        id: `${tunnelId}:${record.name}`,
        name: record.name,
        type: record.type || 'CNAME', // Using CNAME type for consistency
        content: record.content,
        path: record.path || '',
        tunnelId: tunnelId,
        config: convertToCFZeroTrustFormat(record),
        lastUpdated: Date.now() // Add timestamp for when the record was created
      };
      
      // Update the cache with the new record
      this.updateRecordInCache(createdRecord);
      
      // Log at INFO level which record was created
      logger.info(`🚇 Created tunnel hostname ${record.name} → ${record.content} (tunnel: ${tunnelId})`);
      logger.success(`Created tunnel hostname ${record.name}`);
      
      // Update stats counter if available
      if (global.statsCounter) {
        global.statsCounter.created++;
        logger.trace(`CFZeroTrustProvider.createRecord: Incremented global.statsCounter.created to ${global.statsCounter.created}`);
      }
      
      // Track the created hostname for cleanup later
      // We'll store in memory now, it will be persisted when DNSManager processes results
      this.trackCreatedHostname(record.name, createdRecord);
      
      return createdRecord;
    } catch (error) {
      logger.error(`Failed to create tunnel hostname for ${record.name}: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.createRecord: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Update an existing hostname configuration
   */
  async updateRecord(id, record) {
    // Parse the id to get tunnel and hostname
    const [tunnelId, hostname] = id.split(':');
    
    logger.trace(`CFZeroTrustProvider.updateRecord: Updating hostname=${hostname}, service=${record.content}, tunnelId=${tunnelId}`);
    // Log the update operation
    logger.debug(`Updating record ${hostname} → ${record.content}`);
    
    
    try {
      // Validate the record first
      validateRecord(record);
      
      // Verify tunnel access
      if (!await this.verifyTunnelAccess(tunnelId)) {
        throw new Error(`No access to tunnel ${tunnelId}`);
      }
      
      // Get the current tunnel configuration
      logger.trace(`CFZeroTrustProvider.updateRecord: Fetching current tunnel configuration for ${tunnelId}`);
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`
      );
      
      const tunnelConfig = response.data.result.config || {};
      let ingress = tunnelConfig.ingress || [];
      
      // Find the existing hostname rule
      const existingIndex = ingress.findIndex(rule => rule.hostname === hostname);
      
      if (existingIndex < 0) {
        throw new Error(`Hostname ${hostname} not found in tunnel ${tunnelId} configuration`);
      }
      
      // Update the rule with new configuration
      ingress[existingIndex] = convertToCFZeroTrustFormat(record);
      
      // Update the tunnel configuration
      logger.trace(`CFZeroTrustProvider.updateRecord: Updating tunnel ${tunnelId} configuration`);
      await this.client.put(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
        {
          config: {
            ...tunnelConfig,
            ingress: ingress
          }
        }
      );
      
      // Construct the updated record
      const updatedRecord = {
        id: `${tunnelId}:${hostname}`,
        name: hostname,
        type: record.type || 'CNAME', // Using CNAME type for consistency
        content: record.content,
        path: record.path || '',
        tunnelId: tunnelId,
        config: convertToCFZeroTrustFormat(record),
        lastUpdated: Date.now() // Add timestamp for when the record was last updated
      };
      
      // Update the cache
      this.updateRecordInCache(updatedRecord);
      
      // Log at INFO level which record was updated
      // Store in the global cache to prevent frequent updates
      const cacheKey = `${tunnelId}:${hostname}:${record.content}`;
      recentlyUpdatedRecords.set(cacheKey, Date.now());
      
      // Set a timeout to remove from cache after 5 minutes
      setTimeout(() => {
        recentlyUpdatedRecords.delete(cacheKey);
        logger.debug(`Removed ${hostname} from update throttling cache`);
      }, 5 * 60 * 1000);
      
      // Only log at INFO level if this is a significant update (not just a timestamp refresh)
      if (global.statsCounter && global.statsCounter.updated > 0) {
        logger.info(`📝 Updated tunnel hostname ${hostname} → ${record.content} (tunnel: ${tunnelId})`);
        logger.success(`Updated tunnel hostname ${hostname}`);
      } else {
        logger.debug(`📝 Refreshed tunnel hostname ${hostname} → ${record.content} (tunnel: ${tunnelId})`);
      }
      
      // Update stats counter if available
      if (global.statsCounter) {
        global.statsCounter.updated++;
        logger.trace(`CFZeroTrustProvider.updateRecord: Incremented global.statsCounter.updated to ${global.statsCounter.updated}`);
      }
      
      // Track the updated hostname for cleanup later
      // We'll store in memory now, it will be persisted when DNSManager processes results
      this.trackCreatedHostname(hostname, updatedRecord);
      
      return updatedRecord;
    } catch (error) {
      logger.error(`Failed to update tunnel hostname ${hostname}: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.updateRecord: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Delete a hostname configuration
   */
  async deleteRecord(id) {
    // Parse the id to get tunnel and hostname
    const [tunnelId, hostname] = id.split(':');
    
    logger.trace(`CFZeroTrustProvider.deleteRecord: Deleting hostname=${hostname}, tunnelId=${tunnelId}`);
    
    try {
      // Verify tunnel access
      if (!await this.verifyTunnelAccess(tunnelId)) {
        throw new Error(`No access to tunnel ${tunnelId}`);
      }
      
      // Get the current tunnel configuration
      logger.trace(`CFZeroTrustProvider.deleteRecord: Fetching current tunnel configuration for ${tunnelId}`);
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`
      );
      
      const tunnelConfig = response.data.result.config || {};
      let ingress = tunnelConfig.ingress || [];
      
      // Find and remove the hostname rule
      const existingIndex = ingress.findIndex(rule => rule.hostname === hostname);
      
      if (existingIndex < 0) {
        logger.debug(`Hostname ${hostname} not found in tunnel ${tunnelId} configuration, nothing to delete`);
        return true; // Nothing to delete, but not an error
      }
      
      // Remove the rule from the ingress array
      ingress.splice(existingIndex, 1);
      
      // Make sure we still have a catch-all rule
      if (!ingress.find(rule => !rule.hostname)) {
        ingress.push({
          service: "http_status:404",
          hostname: ""
        });
      }
      
      // Update the tunnel configuration
      logger.trace(`CFZeroTrustProvider.deleteRecord: Updating tunnel ${tunnelId} configuration`);
      await this.client.put(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
        {
          config: {
            ...tunnelConfig,
            ingress: ingress
          }
        }
      );
      
      // Update the cache
      this.removeRecordFromCache(id);
      
      // Remove from tracking
      this.removeTrackedHostname(hostname);
      
      // Log at INFO level
      // Log at DEBUG level to reduce noise during cleanup operations
      logger.debug(`🗑️ Deleted tunnel hostname: ${hostname} (tunnel: ${tunnelId})`);
      logger.debug(`Deleted tunnel hostname with ID ${id}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to delete tunnel hostname ${hostname}: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.deleteRecord: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }
  
  /**
   * Update a record in the cache
   */
  updateRecordInCache(record) {
    logger.trace(`CFZeroTrustProvider.updateRecordInCache: Updating record in cache: id=${record.id}`);
    
    const index = this.recordCache.records.findIndex(
      r => r.id === record.id
    );
    
    if (index !== -1) {
      logger.trace(`CFZeroTrustProvider.updateRecordInCache: Found existing record at index ${index}, replacing`);
      this.recordCache.records[index] = record;
    } else {
      logger.trace(`CFZeroTrustProvider.updateRecordInCache: Record not found in cache, adding new record`);
      this.recordCache.records.push(record);
    }
  }
  
  /**
   * Remove a record from the cache
   */
  removeRecordFromCache(id) {
    logger.trace(`CFZeroTrustProvider.removeRecordFromCache: Removing id=${id} from cache`);
    
    const initialLength = this.recordCache.records.length;
    this.recordCache.records = this.recordCache.records.filter(
      record => record.id !== id
    );
    
    const removed = initialLength - this.recordCache.records.length;
    logger.trace(`CFZeroTrustProvider.removeRecordFromCache: Removed ${removed} records from cache`);
  }
  
  /**
   * Batch process multiple hostname configurations at once
   */
  async batchEnsureRecords(recordConfigs) {
    if (!recordConfigs || recordConfigs.length === 0) {
      logger.trace('CFZeroTrustProvider.batchEnsureRecords: No record configs provided, skipping');
      return [];
    }
    
    logger.debug(`Batch processing ${recordConfigs.length} tunnel hostnames`);
    logger.trace(`CFZeroTrustProvider.batchEnsureRecords: Starting batch processing of ${recordConfigs.length} records`);
    
    try {
      // Refresh cache if needed
      await this.getRecordsFromCache();
      
      // Group records by tunnel ID for efficient processing
      const recordsByTunnel = {};
      
      // Group each record by its tunnel ID
      for (const recordConfig of recordConfigs) {
        const tunnelId = recordConfig.tunnelId || this.defaultTunnelId;
        
        if (!recordsByTunnel[tunnelId]) {
          recordsByTunnel[tunnelId] = [];
        }
        
        recordsByTunnel[tunnelId].push(recordConfig);
      }
      
      // Process each tunnel's records
      const results = [];
      
      for (const [tunnelId, tunnelRecords] of Object.entries(recordsByTunnel)) {
        logger.debug(`Processing ${tunnelRecords.length} records for tunnel ${tunnelId}`);
        
        // Verify tunnel access
        if (!await this.verifyTunnelAccess(tunnelId)) {
          logger.error(`No access to tunnel ${tunnelId}, skipping ${tunnelRecords.length} records`);
          continue;
        }
        
        // Process records for this tunnel
        const tunnelResults = await this.processTunnelRecords(tunnelId, tunnelRecords);
        results.push(...tunnelResults);
      }
      
      // Track all hostnames processed in this batch for cleanup later
      for (const record of results) {
        if (record && record.name) {
          this.trackCreatedHostname(record.name, record);
        }
      }
      
      logger.trace(`CFZeroTrustProvider.batchEnsureRecords: Batch processing complete, returning ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Failed to batch process tunnel hostnames: ${error.message}`);
      logger.trace(`CFZeroTrustProvider.batchEnsureRecords: Error details: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Process records for a specific tunnel
   */
  async processTunnelRecords(tunnelId, recordConfigs) {
    // Process each record configuration
    const pendingChanges = {
      create: [],
      update: [],
      unchanged: []
    };
    
    // First pass: examine all records and sort into categories
    logger.trace(`CFZeroTrustProvider.processTunnelRecords: First pass - examining ${recordConfigs.length} records for tunnel ${tunnelId}`);
    
    for (const recordConfig of recordConfigs) {
      try {
        logger.trace(`CFZeroTrustProvider.processTunnelRecords: Processing record ${recordConfig.name}`);
        
        // Validate the record
        validateRecord(recordConfig);
        
        // Find existing record in cache
        const existing = this.findRecordInCache(null, recordConfig.name, tunnelId);
        
        if (existing) {
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: Found existing record hostname=${existing.name}`);
          
          // Check if this record was recently updated (within the last 5 minutes)
          const cacheKey = `${tunnelId}:${recordConfig.name}:${recordConfig.content}`;
          const now = Date.now();
          const recentUpdate = recentlyUpdatedRecords.get(cacheKey);
          
          if (recentUpdate && (now - recentUpdate) < 5 * 60 * 1000) {
            logger.debug(`Skipping update for ${recordConfig.name} → ${recordConfig.content} (last updated ${Math.round((now - recentUpdate)/1000)}s ago)`);
            pendingChanges.unchanged.push({
              record: recordConfig,
              existing
            });
            
            // Update stats counter if available
            if (global.statsCounter) {
              global.statsCounter.upToDate++;
              logger.trace(`CFZeroTrustProvider.processTunnelRecords: Incremented global.statsCounter.upToDate to ${global.statsCounter.upToDate}`);
            }
          } else {
            // Check if update is needed
            const needsUpdate = this.recordNeedsUpdate(existing, recordConfig);
            logger.trace(`CFZeroTrustProvider.processTunnelRecords: Record ${recordConfig.name} needs update: ${needsUpdate}`);
            
            if (needsUpdate) {
              pendingChanges.update.push({
                id: existing.id,
                record: recordConfig,
                existing
              });
            } else {
              pendingChanges.unchanged.push({
                record: recordConfig,
                existing
              });
              
              // Update stats counter if available
              if (global.statsCounter) {
                global.statsCounter.upToDate++;
                logger.trace(`CFZeroTrustProvider.processTunnelRecords: Incremented global.statsCounter.upToDate to ${global.statsCounter.upToDate}`);
              }
            }
          }
        } else {
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: No existing record found, needs creation`);
          
          // Add tunnelId to record for creation
          const recordWithTunnel = {
            ...recordConfig,
            tunnelId: tunnelId
          };
          
          // Need to create a new record
          pendingChanges.create.push({
            record: recordWithTunnel
          });
        }
      } catch (error) {
        logger.error(`Error processing ${recordConfig.name}: ${error.message}`);
        logger.trace(`CFZeroTrustProvider.processTunnelRecords: Error details: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: Incremented global.statsCounter.errors to ${global.statsCounter.errors}`);
        }
      }
    }
    
    // Second pass: apply all changes
    logger.debug(`Tunnel ${tunnelId} hostname changes: ${pendingChanges.create.length} to create, ${pendingChanges.update.length} to update, ${pendingChanges.unchanged.length} unchanged`);
    
    const results = [];
    
    // For tunnel provider, we need to update the entire config in one go
    if (pendingChanges.create.length > 0 || pendingChanges.update.length > 0) {
      // Get the current tunnel configuration
      logger.trace(`CFZeroTrustProvider.processTunnelRecords: Fetching current tunnel configuration for ${tunnelId}`);
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`
      );
      
      const tunnelConfig = response.data.result.config || {};
      let ingress = tunnelConfig.ingress || [];
      
      // Track changes made to ingress rules
      let changes = false;
      
      // Process each update
      for (const { record } of pendingChanges.update) {
        const existingIndex = ingress.findIndex(rule => rule.hostname === record.name);
        if (existingIndex >= 0) {
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: Updating ingress rule for ${record.name}`);
          ingress[existingIndex] = convertToCFZeroTrustFormat(record);
          changes = true;
        }
      }
      
      // Process each create
      for (const { record } of pendingChanges.create) {
        const existingIndex = ingress.findIndex(rule => rule.hostname === record.name);
        if (existingIndex >= 0) {
          // Rule exists but wasn't in our cache
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: Updating existing ingress rule for ${record.name}`);
          ingress[existingIndex] = convertToCFZeroTrustFormat(record);
        } else {
          // New rule
          logger.trace(`CFZeroTrustProvider.processTunnelRecords: Adding new ingress rule for ${record.name}`);
          const newIngressRule = convertToCFZeroTrustFormat(record);
          
          // Insert before catch-all rule
          if (ingress.length > 0 && !ingress[ingress.length - 1].hostname) {
            ingress.splice(ingress.length - 1, 0, newIngressRule);
          } else {
            ingress.push(newIngressRule);
          }
        }
        changes = true;
      }
      
      // Make sure we have a catch-all rule
      if (!ingress.find(rule => !rule.hostname)) {
        logger.trace('CFZeroTrustProvider.processTunnelRecords: Adding catch-all rule');
        ingress.push({
          service: "http_status:404",
          hostname: ""
        });
        changes = true;
      }
      
      // Only update if changes were made
      if (changes) {
        // Update the tunnel configuration
        logger.trace(`CFZeroTrustProvider.processTunnelRecords: Updating tunnel ${tunnelId} configuration`);
        await this.client.put(
          `/accounts/${this.accountId}/cfd_tunnel/${tunnelId}/configurations`,
          {
            config: {
              ...tunnelConfig,
              ingress: ingress
            }
          }
        );
        
        // Get updated records to add to results
        const updatedRecords = await this.getTunnelHostnames(tunnelId);
        
        // Process updated records
        for (const { record } of pendingChanges.update) {
          const updated = updatedRecords.find(r => r.name === record.name);
          if (updated) {
            logger.info(`📝 Updated tunnel hostname ${record.name} → ${record.content} (tunnel: ${tunnelId})`);
            results.push(updated);
            
            // Only increment the updated counter if there was an actual content change
            // This helps prevent duplicate log messages for records that haven't really changed
            const existingRecord = pendingChanges.update.find(u => u.record.name === record.name);
            if (existingRecord && existingRecord.existing) {
              const significantChange =
                existingRecord.existing.content !== record.content ||
                (existingRecord.existing.path || '') !== (record.path || '');
                
              if (significantChange && global.statsCounter) {
                global.statsCounter.updated++;
                logger.debug(`Incremented update counter for significant change to ${record.name}`);
              } else {
                logger.debug(`Not incrementing update counter for ${record.name} (no significant change)`);
              }
            }
          }
        }
        
        // Process created records
        for (const { record } of pendingChanges.create) {
          const created = updatedRecords.find(r => r.name === record.name);
          if (created) {
            logger.info(`🚇 Created tunnel hostname ${record.name} → ${record.content} (tunnel: ${tunnelId})`);
            results.push(created);
            
            // Update stats counter
            if (global.statsCounter) {
              global.statsCounter.created++;
            }
          }
        }
      }
    }
    
    // Add unchanged records to results too
    for (const { existing } of pendingChanges.unchanged) {
      results.push(existing);
    }
    
    logger.trace(`CFZeroTrustProvider.processTunnelRecords: Tunnel processing complete, returning ${results.length} results`);
    return results;
  }
  
  /**
   * Check if a record needs to be updated
   */
  recordNeedsUpdate(existing, newRecord) {
    logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: Comparing records for ${newRecord.name}`);
    logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: Existing: ${JSON.stringify(existing)}`);
    logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: New: ${JSON.stringify(newRecord)}`);
    
    // Compare service (content) and path
    let needsUpdate = false;
    
    // Compare service (target)
    if (existing.content !== newRecord.content) {
      logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: Service different: ${existing.content} vs ${newRecord.content}`);
      needsUpdate = true;
    }
    
    // Compare path
    const existingPath = existing.path || '';
    const newPath = newRecord.path || '';
    if (existingPath !== newPath) {
      logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: Path different: ${existingPath} vs ${newPath}`);
      needsUpdate = true;
    }
    
    // Compare additional attributes
    // For example, if there's a disableChunkedEncoding setting
    if (newRecord.disableChunkedEncoding !== undefined &&
        existing.config &&
        existing.config.disableChunkedEncoding !== newRecord.disableChunkedEncoding) {
      needsUpdate = true;
    }
    
    // Compare accessPolicy if provided
    if (newRecord.accessPolicy !== undefined &&
        existing.config &&
        existing.config.access_policy !== newRecord.accessPolicy) {
      needsUpdate = true;
    }
    
    // If an update is needed, log the specific differences at DEBUG level
    if (needsUpdate && logger.level >= 3) { // DEBUG level or higher
      logger.debug(`Record ${newRecord.name} needs update:`);
      if (existing.content !== newRecord.content)
        logger.debug(` - Service: ${existing.content} → ${newRecord.content}`);
      if (existingPath !== newPath)
        logger.debug(` - Path: ${existingPath} → ${newPath}`);
    }
    
    logger.trace(`CFZeroTrustProvider.recordNeedsUpdate: Final result - needs update: ${needsUpdate}`);
    return needsUpdate;
  }
  
  /**
   * Add the tracking information needed for orphaned record cleanup
   * Uses RecordTracker for persistent storage
   * @param {string} hostname - The hostname
   * @param {Object} record - The created/updated record
   * @param {Object} recordTracker - The recordTracker instance passed from DNSManager
   */
  trackCreatedHostname(hostname, record, recordTracker) {
    try {
      // If recordTracker is not provided, fall back to in-memory tracking
      if (!recordTracker) {
        if (!global.tunnelHostnames) {
          global.tunnelHostnames = new Map();
        }
        
        global.tunnelHostnames.set(hostname, {
          tunnelId: record.tunnelId || this.defaultTunnelId,
          id: record.id,
          updated: new Date().toISOString()
        });
        
        logger.debug(`Tracked tunnel hostname in memory: ${hostname} (tunnel: ${record.tunnelId || this.defaultTunnelId})`);
        return;
      }
      
      // Create a record object in the format expected by RecordTracker
      const trackingRecord = {
        id: record.id,
        provider: 'cfzerotrust',
        domain: this.config.cloudflareZone,
        name: hostname,
        type: 'TUNNEL',
        tunnelId: record.tunnelId || this.defaultTunnelId,
        createdAt: new Date().toISOString(),
        managedBy: 'TráfegoDNS'
      };
      
      // Check if record is already tracked (update if exists, add if new)
      if (this.isHostnameTracked(hostname, recordTracker)) {
        logger.debug(`Updating tracked tunnel hostname: ${hostname} (tunnel: ${trackingRecord.tunnelId})`);
        // Find the existing record in the tracker by composite ID
        const existingRecords = recordTracker.getAllTrackedRecords();
        const existingIndex = existingRecords.findIndex(r => 
          r.provider === 'cfzerotrust' && r.name === hostname
        );
        
        if (existingIndex >= 0) {
          // Update the existing record
          existingRecords[existingIndex] = {
            ...existingRecords[existingIndex],
            id: trackingRecord.id,
            tunnelId: trackingRecord.tunnelId,
            updatedAt: new Date().toISOString()
          };
          
          // Save the updated tracking data
          recordTracker.saveTrackedRecords();
        }
      } else {
        // Track new record
        logger.debug(`Tracking new tunnel hostname: ${hostname} (tunnel: ${trackingRecord.tunnelId})`);
        recordTracker.trackRecord(trackingRecord);
      }
    } catch (error) {
      logger.error(`Failed to track tunnel hostname: ${error.message}`);
      
      // Fallback to in-memory tracking if persistent storage fails
      if (!global.tunnelHostnames) {
        global.tunnelHostnames = new Map();
      }
      
      global.tunnelHostnames.set(hostname, {
        tunnelId: record.tunnelId || this.defaultTunnelId,
        id: record.id,
        updated: new Date().toISOString()
      });
    }
  }
  
  /**
   * Check if a hostname is tracked in RecordTracker
   * @param {string} hostname - The hostname to check
   * @param {Object} recordTracker - The recordTracker instance
   * @returns {boolean} - True if the hostname is tracked
   */
  isHostnameTracked(hostname, recordTracker) {
    // Try persistent tracking first
    if (recordTracker) {
      try {
        const records = recordTracker.getAllTrackedRecords();
        return records.some(record => 
          record.provider === 'cfzerotrust' && record.name === hostname
        );
      } catch (error) {
        logger.error(`Error checking tracked hostname: ${error.message}`);
      }
    }
    
    // Fall back to in-memory tracking
    return global.tunnelHostnames && global.tunnelHostnames.has(hostname);
  }
  
  /**
   * Get tracked information for a hostname
   * @param {string} hostname - The hostname to get info for
   * @param {Object} recordTracker - The recordTracker instance
   * @returns {Object|null} - The tracked info or null
   */
  getTrackedHostnameInfo(hostname, recordTracker) {
    // Try persistent tracking first
    if (recordTracker) {
      try {
        const records = recordTracker.getAllTrackedRecords();
        const record = records.find(record => 
          record.provider === 'cfzerotrust' && record.name === hostname
        );
        
        if (record) {
          return {
            tunnelId: record.tunnelId,
            id: record.id,
            updated: record.updatedAt || record.createdAt
          };
        }
      } catch (error) {
        logger.error(`Error getting tracked hostname info: ${error.message}`);
      }
    }
    
    // Fall back to in-memory tracking
    if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
      return global.tunnelHostnames.get(hostname);
    }
    
    return null;
  }
  
  /**
   * Remove a hostname from tracking
   * @param {string} hostname - The hostname to remove
   * @param {Object} recordTracker - The recordTracker instance
   */
  removeTrackedHostname(hostname, recordTracker) {
    // Try persistent tracking first
    if (recordTracker) {
      try {
        const records = recordTracker.getAllTrackedRecords();
        const record = records.find(record => 
          record.provider === 'cfzerotrust' && record.name === hostname
        );
        
        if (record) {
          recordTracker.untrackRecord(record);
          logger.debug(`Removed tracked tunnel hostname from persistent storage: ${hostname}`);
        }
      } catch (error) {
        logger.error(`Error removing tracked hostname: ${error.message}`);
      }
    }
    
    // Also remove from in-memory tracking
    if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
      global.tunnelHostnames.delete(hostname);
      logger.debug(`Removed tracked tunnel hostname from memory: ${hostname}`);
    }
  }
}

module.exports = CFZeroTrustProvider;
