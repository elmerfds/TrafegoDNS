/**
 * UniFi DNS Provider
 * Core implementation of the DNSProvider interface for UniFi Network Application
 * Based on UniFi Network Application v9+ DNS API
 */
const axios = require('axios');
const https = require('https');
const DNSProvider = require('../base');
const logger = require('../../utils/logger');
const { convertRecord, convertToUnifiFormat } = require('./converter');
const { validateRecord } = require('./validator');

class UnifiProvider extends DNSProvider {
  constructor(config) {
    super(config);

    logger.trace('UnifiProvider.constructor: Initialising with config');

    // UniFi configuration
    this.host = config.unifiHost;
    this.apiKey = config.unifiApiKey;
    this.username = config.unifiUsername;
    this.password = config.unifiPassword;
    this.site = config.unifiSite || 'default';
    this.skipTlsVerify = config.unifiSkipTlsVerify || false;
    this.externalController = config.unifiExternalController || false;

    // Authentication state
    this.csrfToken = null;
    this.authenticated = false;

    // Determine API base path based on controller type
    const apiPath = this.externalController ? '/v2/api' : '/proxy/network/v2/api';
    const authPath = this.externalController ? '/api/login' : '/api/auth/login';

    // Initialize Axios client
    const httpsAgent = this.skipTlsVerify
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    this.client = axios.create({
      baseURL: this.host,
      timeout: config.apiTimeout || 60000,
      httpsAgent,
      headers: {
        'Content-Type': 'application/json'
      },
      // Allow cookies for session management
      withCredentials: true
    });

    // Store paths for later use
    this.apiPath = apiPath;
    this.authPath = authPath;

    // Add response interceptor to handle authentication errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 unauthorized - try to re-authenticate once
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          logger.debug('UniFi API returned 401, attempting to re-authenticate');

          try {
            await this.authenticate();
            return this.client(originalRequest);
          } catch (authError) {
            logger.error(`Re-authentication failed: ${authError.message}`);
            throw error;
          }
        }

        return Promise.reject(error);
      }
    );

    logger.trace('UnifiProvider.constructor: Axios client initialized');
  }

  /**
   * Authenticate with UniFi controller
   * Supports both API key (preferred) and username/password (deprecated)
   */
  async authenticate() {
    logger.trace('UnifiProvider.authenticate: Starting authentication');

    // API Key authentication (preferred for v9+)
    if (this.apiKey) {
      logger.debug('Using UniFi API key authentication');
      this.client.defaults.headers.common['X-Api-Key'] = this.apiKey;
      this.authenticated = true;
      logger.trace('UnifiProvider.authenticate: API key set in headers');
      return true;
    }

    // Username/password authentication (deprecated)
    if (this.username && this.password) {
      logger.warn('UNIFI_USERNAME and UNIFI_PASSWORD are deprecated, please switch to using UNIFI_API_KEY instead');
      logger.debug('Using UniFi username/password authentication');

      try {
        const response = await this.client.post(this.authPath, {
          username: this.username,
          password: this.password,
          remember: true
        });

        // Extract CSRF token from response headers
        const csrfToken = response.headers['x-csrf-token'];
        if (csrfToken) {
          this.csrfToken = csrfToken;
          this.client.defaults.headers.common['X-Csrf-Token'] = csrfToken;
          logger.trace(`UnifiProvider.authenticate: CSRF token set: ${csrfToken}`);
        }

        this.authenticated = true;
        logger.success('UniFi authentication successful');
        return true;
      } catch (error) {
        logger.error(`UniFi authentication failed: ${error.message}`);
        logger.trace(`UnifiProvider.authenticate: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
        throw new Error(`Failed to authenticate with UniFi controller: ${error.message}`);
      }
    }

    throw new Error('No UniFi authentication credentials provided. Set UNIFI_API_KEY or UNIFI_USERNAME/UNIFI_PASSWORD');
  }

  /**
   * Initialize API connection
   */
  async init() {
    logger.trace(`UnifiProvider.init: Starting initialization for site "${this.site}"`);

    try {
      // Authenticate
      await this.authenticate();

      // Test connection by fetching DNS records
      logger.trace('UnifiProvider.init: Testing connection by fetching DNS records');
      await this.refreshRecordCache();

      logger.success('UniFi DNS provider initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize UniFi API: ${error.message}`);
      logger.trace(`UnifiProvider.init: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw new Error(`Failed to initialize UniFi API: ${error.message}`);
    }
  }

  /**
   * Refresh the DNS record cache
   */
  async refreshRecordCache() {
    logger.trace('UnifiProvider.refreshRecordCache: Starting cache refresh');

    try {
      logger.debug('Refreshing DNS record cache from UniFi');

      // Fetch all DNS records for the site
      const url = `${this.apiPath}/site/${this.site}/static-dns`;
      logger.trace(`UnifiProvider.refreshRecordCache: Fetching from ${url}`);

      const response = await this.client.get(url);

      logger.trace(`UnifiProvider.refreshRecordCache: Raw response: ${JSON.stringify(response.data)}`);

      const oldRecordCount = this.recordCache.records.length;

      // Convert UniFi format to standard format
      // Check multiple possible response structures
      const recordsData = response.data.data || response.data || [];

      logger.trace(`UnifiProvider.refreshRecordCache: Records data type: ${Array.isArray(recordsData) ? 'array' : typeof recordsData}, length: ${recordsData.length || 'N/A'}`);

      const records = (Array.isArray(recordsData) ? recordsData : []).map(record => convertRecord(record));

      this.recordCache = {
        records,
        lastUpdated: Date.now()
      };

      logger.debug(`Cached ${this.recordCache.records.length} DNS records from UniFi`);
      logger.trace(`UnifiProvider.refreshRecordCache: Cache updated from ${oldRecordCount} to ${this.recordCache.records.length} records`);

      // In TRACE mode, output the entire cache for debugging
      if (logger.level >= 4) { // TRACE level
        logger.trace('UnifiProvider.refreshRecordCache: Current cache contents:');
        this.recordCache.records.forEach((record, index) => {
          logger.trace(`Record[${index}]: type=${record.type}, name=${record.name}, content=${record.content}`);
        });
      }

      return this.recordCache.records;
    } catch (error) {
      logger.error(`Failed to refresh DNS record cache: ${error.message}`);
      logger.trace(`UnifiProvider.refreshRecordCache: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }

  /**
   * Update a record in the cache
   */
  updateRecordInCache(record) {
    logger.trace(`UnifiProvider.updateRecordInCache: Updating record in cache: ID=${record.id}, type=${record.type}, name=${record.name}`);

    const index = this.recordCache.records.findIndex(r => r.id === record.id);

    if (index !== -1) {
      this.recordCache.records[index] = record;
      logger.trace(`UnifiProvider.updateRecordInCache: Record updated at index ${index}`);
    } else {
      this.recordCache.records.push(record);
      logger.trace(`UnifiProvider.updateRecordInCache: Record added to cache (new record)`);
    }
  }

  /**
   * Remove a record from the cache
   */
  removeRecordFromCache(id) {
    logger.trace(`UnifiProvider.removeRecordFromCache: Removing record ID ${id} from cache`);

    const index = this.recordCache.records.findIndex(r => r.id === id);

    if (index !== -1) {
      this.recordCache.records.splice(index, 1);
      logger.trace(`UnifiProvider.removeRecordFromCache: Record removed from cache at index ${index}`);
    } else {
      logger.trace(`UnifiProvider.removeRecordFromCache: Record ID ${id} not found in cache`);
    }
  }

  /**
   * List DNS records with optional filtering
   */
  async listRecords(params = {}) {
    logger.trace(`UnifiProvider.listRecords: Listing records with params: ${JSON.stringify(params)}`);

    try {
      // Get records from cache
      const records = await this.getRecordsFromCache(params.forceRefresh);

      // Apply filters if specified
      let filteredRecords = records;

      if (params.type) {
        filteredRecords = filteredRecords.filter(r => r.type === params.type);
        logger.trace(`UnifiProvider.listRecords: Filtered by type=${params.type}, ${filteredRecords.length} records match`);
      }

      if (params.name) {
        filteredRecords = filteredRecords.filter(r => r.name === params.name);
        logger.trace(`UnifiProvider.listRecords: Filtered by name=${params.name}, ${filteredRecords.length} records match`);
      }

      logger.debug(`Listed ${filteredRecords.length} DNS records from UniFi`);
      return filteredRecords;
    } catch (error) {
      logger.error(`Failed to list DNS records: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new DNS record
   */
  async createRecord(record) {
    logger.trace(`UnifiProvider.createRecord: Creating record ${record.name} (${record.type})`);

    let unifiRecord;

    try {
      // Validate the record
      validateRecord(record);

      // Convert to UniFi format
      unifiRecord = convertToUnifiFormat(record);

      logger.debug(`Creating DNS record: ${record.name} (${record.type}) -> ${record.content}`);

      // Create the record via API
      const url = `${this.apiPath}/site/${this.site}/static-dns`;
      logger.trace(`UnifiProvider.createRecord: POST to ${url} with data: ${JSON.stringify(unifiRecord)}`);

      const response = await this.client.post(url, unifiRecord);

      logger.trace(`UnifiProvider.createRecord: Response: ${JSON.stringify(response.data)}`);

      // UniFi API returns the created record in response.data.data or response.data
      const createdData = response.data.data || response.data;

      if (!createdData) {
        logger.error('UniFi API returned unexpected response structure');
        throw new Error('Failed to parse UniFi API response');
      }

      const createdRecord = convertRecord(createdData);
      logger.success(`Created DNS record: ${createdRecord.name} (${createdRecord.type})`);

      // Update cache
      this.updateRecordInCache(createdRecord);

      return createdRecord;
    } catch (error) {
      logger.error(`Failed to create DNS record: ${error.message}`);
      if (unifiRecord) {
        logger.error(`UnifiProvider.createRecord: Request data: ${JSON.stringify(unifiRecord)}`);
      }
      logger.error(`UnifiProvider.createRecord: UniFi API error: ${JSON.stringify(error.response?.data)}`);
      logger.trace(`UnifiProvider.createRecord: Full error: ${JSON.stringify(error.response || error)}`);
      throw error;
    }
  }

  /**
   * Update an existing DNS record
   * UniFi doesn't support direct updates - use delete-then-create pattern
   */
  async updateRecord(id, record) {
    logger.trace(`UnifiProvider.updateRecord: Updating record ID ${id} using delete-then-create`);

    try {
      logger.debug(`Updating DNS record: ${record.name} (${record.type}) -> ${record.content}`);

      // Delete the old record
      await this.deleteRecord(id);

      // Small delay to allow UniFi to process the deletion (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Refresh cache to ensure we have the latest state
      await this.refreshRecordCache();

      // Check if there are any duplicate records with the same name/type
      const duplicates = this.recordCache.records.filter(
        r => r.name === record.name && r.type === record.type
      );

      if (duplicates.length > 0) {
        logger.debug(`Found ${duplicates.length} duplicate records for ${record.name}, deleting them`);
        for (const dup of duplicates) {
          await this.deleteRecord(dup.id);
        }
        // Another small delay and cache refresh
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.refreshRecordCache();
      }

      // Create the new record
      const createdRecord = await this.createRecord(record);

      logger.success(`Updated DNS record: ${createdRecord.name} (${createdRecord.type})`);

      return createdRecord;
    } catch (error) {
      logger.error(`Failed to update DNS record: ${error.message}`);
      logger.error(`UnifiProvider.updateRecord: Record ID: ${id}`);
      logger.error(`UnifiProvider.updateRecord: Target: ${record.name} (${record.type})`);
      throw error;
    }
  }

  /**
   * Delete a DNS record
   */
  async deleteRecord(id) {
    logger.trace(`UnifiProvider.deleteRecord: Deleting record ID ${id}`);

    try {
      logger.debug(`Deleting DNS record ID: ${id}`);

      // Delete the record via API
      const url = `${this.apiPath}/site/${this.site}/static-dns/${id}`;
      logger.trace(`UnifiProvider.deleteRecord: DELETE to ${url}`);

      await this.client.delete(url);

      logger.success(`Deleted DNS record ID: ${id}`);

      // Remove from cache
      this.removeRecordFromCache(id);

      return true;
    } catch (error) {
      logger.error(`Failed to delete DNS record: ${error.message}`);
      logger.trace(`UnifiProvider.deleteRecord: Error details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw error;
    }
  }

  /**
   * Check if a record needs to be updated
   */
  recordNeedsUpdate(existing, newRecord) {
    logger.trace(`UnifiProvider.recordNeedsUpdate: Comparing records for ${newRecord.name} (${newRecord.type})`);

    // Compare key fields
    if (existing.type !== newRecord.type) {
      logger.trace(`UnifiProvider.recordNeedsUpdate: Type mismatch (${existing.type} != ${newRecord.type})`);
      return true;
    }

    if (existing.name !== newRecord.name) {
      logger.trace(`UnifiProvider.recordNeedsUpdate: Name mismatch (${existing.name} != ${newRecord.name})`);
      return true;
    }

    if (existing.content !== newRecord.content) {
      logger.trace(`UnifiProvider.recordNeedsUpdate: Content mismatch (${existing.content} != ${newRecord.content})`);
      return true;
    }

    // TTL comparison (with some tolerance)
    if (newRecord.ttl && Math.abs((existing.ttl || 300) - newRecord.ttl) > 10) {
      logger.trace(`UnifiProvider.recordNeedsUpdate: TTL mismatch (${existing.ttl} != ${newRecord.ttl})`);
      return true;
    }

    // Type-specific comparisons
    if (newRecord.type === 'MX' || newRecord.type === 'SRV') {
      if ((existing.priority || 10) !== (newRecord.priority || 10)) {
        logger.trace(`UnifiProvider.recordNeedsUpdate: Priority mismatch (${existing.priority} != ${newRecord.priority})`);
        return true;
      }
    }

    if (newRecord.type === 'SRV') {
      if ((existing.weight || 1) !== (newRecord.weight || 1)) {
        logger.trace(`UnifiProvider.recordNeedsUpdate: Weight mismatch (${existing.weight} != ${newRecord.weight})`);
        return true;
      }
      if ((existing.port || 80) !== (newRecord.port || 80)) {
        logger.trace(`UnifiProvider.recordNeedsUpdate: Port mismatch (${existing.port} != ${newRecord.port})`);
        return true;
      }
    }

    logger.trace(`UnifiProvider.recordNeedsUpdate: No update needed`);
    return false;
  }

  /**
   * Validate a record configuration
   */
  validateRecord(record) {
    return validateRecord(record);
  }

  /**
   * Batch process multiple DNS records at once
   */
  async batchEnsureRecords(recordConfigs) {
    logger.trace(`UnifiProvider.batchEnsureRecords: Processing ${recordConfigs.length} records`);

    const results = [];

    try {
      // Refresh cache once at the start
      await this.refreshRecordCache();

      for (const recordConfig of recordConfigs) {
        try {
          // Check if record already exists
          const existing = this.findRecordInCache(recordConfig.type, recordConfig.name);

          if (existing) {
            // Check if update is needed
            if (this.recordNeedsUpdate(existing, recordConfig)) {
              logger.debug(`Updating existing record: ${recordConfig.name} (${recordConfig.type})`);
              const updated = await this.updateRecord(existing.id, recordConfig);
              results.push({ action: 'updated', record: updated });
            } else {
              logger.debug(`Record already up to date: ${recordConfig.name} (${recordConfig.type})`);
              results.push({ action: 'unchanged', record: existing });
            }
          } else {
            // Handle CNAME conflicts - UniFi doesn't allow duplicate CNAMEs
            if (recordConfig.type === 'CNAME') {
              const conflictingCname = this.recordCache.records.find(
                r => r.type === 'CNAME' && r.name === recordConfig.name
              );
              if (conflictingCname) {
                logger.debug(`Deleting conflicting CNAME before creating new one: ${recordConfig.name}`);
                await this.deleteRecord(conflictingCname.id);
              }
            }

            // Create new record
            logger.debug(`Creating new record: ${recordConfig.name} (${recordConfig.type})`);
            const created = await this.createRecord(recordConfig);
            results.push({ action: 'created', record: created });
          }
        } catch (error) {
          logger.error(`Failed to process record ${recordConfig.name} (${recordConfig.type}): ${error.message}`);
          results.push({ action: 'error', record: recordConfig, error: error.message });
        }
      }

      logger.debug(`Batch processing complete: ${results.length} records processed`);
      return results;
    } catch (error) {
      logger.error(`Batch processing failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = UnifiProvider;
