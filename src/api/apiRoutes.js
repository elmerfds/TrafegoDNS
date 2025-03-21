// src/api/apiRoutes.js
// Modified version with dataStore compatibility fixes

/**
 * API Routes for TráfegoDNS
 * Provides REST API endpoints for the Web UI
 */
const express = require('express');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const path = require('path');
const fsSync = require('fs');

class ApiRoutes {
  /**
   * Create API routes
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} eventBus - EventBus instance
   * @param {Object} dnsManager - DNSManager instance
   * @param {Object} dataStore - DataStore instance
   * @param {Object} activityLogger - ActivityLogger instance
   */
  constructor(config, eventBus, dnsManager, dataStore, activityLogger) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    
    // Ensure dataStore has the required methods
    this.dataStore = dataStore || {};
    
    // Add the missing methods to dataStore if they don't exist
    if (this.dataStore && typeof this.dataStore.getPreservedHostnames !== 'function') {
      logger.debug('Injecting getPreservedHostnames method into dataStore');
      this.dataStore.getPreservedHostnames = async () => {
        // Try to get from dnsManager.recordTracker first
        if (this.dnsManager && 
            this.dnsManager.recordTracker && 
            Array.isArray(this.dnsManager.recordTracker.preservedHostnames)) {
          return this.dnsManager.recordTracker.preservedHostnames;
        }
        
        // Fallback to environment variable
        if (process.env.PRESERVED_HOSTNAMES) {
          return process.env.PRESERVED_HOSTNAMES
            .split(',')
            .map(hostname => hostname.trim())
            .filter(hostname => hostname.length > 0);
        }
        
        // Last resort: empty array
        return [];
      };
    }
    
    if (this.dataStore && typeof this.dataStore.getManagedHostnames !== 'function') {
      logger.debug('Injecting getManagedHostnames method into dataStore');
      this.dataStore.getManagedHostnames = async () => {
        // Try to get from dnsManager.recordTracker first
        if (this.dnsManager && 
            this.dnsManager.recordTracker && 
            Array.isArray(this.dnsManager.recordTracker.managedHostnames)) {
          return this.dnsManager.recordTracker.managedHostnames;
        }
        
        // Fallback to environment variable
        if (process.env.MANAGED_HOSTNAMES) {
          return process.env.MANAGED_HOSTNAMES
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
        }
        
        // Last resort: empty array
        return [];
      };
    }
    
    this.activityLogger = activityLogger;
    this.router = express.Router();
    
    // Initialize routes
    this.setupRoutes();
  }
  
  /**
   * Set up API routes
   */
  setupRoutes() {
    // Status endpoints
    this.router.get('/status', this.handleGetStatus.bind(this));
    
    // DNS Records endpoints
    this.router.get('/records', this.handleGetRecords.bind(this));
    this.router.get('/records/tracked', this.handleGetTrackedRecords.bind(this));
    this.router.delete('/records/:id', this.handleDeleteRecord.bind(this));
    
    // Preserved Hostnames endpoints
    this.router.get('/preserved-hostnames', this.handleGetPreservedHostnames.bind(this));
    this.router.post('/preserved-hostnames', this.handleAddPreservedHostname.bind(this));
    this.router.delete('/preserved-hostnames/:hostname', this.handleDeletePreservedHostname.bind(this));
    
    // Managed Hostnames endpoints
    this.router.get('/managed-hostnames', this.handleGetManagedHostnames.bind(this));
    this.router.post('/managed-hostnames', this.handleAddManagedHostname.bind(this));
    this.router.delete('/managed-hostnames/:hostname', this.handleDeleteManagedHostname.bind(this));
    
    // Configuration endpoints
    this.router.get('/config', this.handleGetConfig.bind(this));
    this.router.post('/config/log-level', this.handleSetLogLevel.bind(this));
    this.router.post('/config/cleanup', this.handleSetCleanup.bind(this));
    
    // Activity Log endpoints
    this.router.get('/activity-log', this.handleGetActivityLog.bind(this));
    
    // Action endpoints
    this.router.post('/refresh', this.handleRefresh.bind(this));
    
    // Provider endpoints
    this.router.get('/providers', this.handleGetProviders.bind(this));
    this.router.post('/providers/switch', this.handleSwitchProvider.bind(this));
    
    // Mode endpoints
    this.router.post('/operation-mode', this.handleSetOperationMode.bind(this));
    
    // Generic error handler
    this.router.use(this.handleApiError.bind(this));
  }
  
  /**
   * Handle GET /status
   */
  async handleGetStatus(req, res, next) {
    try {
      // Get version from package.json
      const packageJson = require('../../package.json');
      const version = packageJson.version || '1.0.0';
      
      // Build status response
      const status = {
        version,
        status: 'running',
        provider: this.config.dnsProvider,
        zone: this.config.getProviderDomain(),
        operationMode: this.config.operationMode,
        publicIp: this.config.getPublicIPSync(),
        publicIpv6: this.config.getPublicIPv6Sync(),
        cleanupEnabled: this.config.cleanupOrphaned,
        traefikApiUrl: this.config.traefikApiUrl,
        traefikStatus: this.config.operationMode === 'traefik' ? 'connected' : 'not used',
        dockerStatus: 'connected',
        logLevel: logger.levelNames[logger.level],
        pollInterval: this.config.pollInterval,
        ipRefreshInterval: this.config.ipRefreshInterval,
        cacheRefreshInterval: this.config.cacheRefreshInterval,
        cacheFreshness: this.getFreshnessString(this.dnsManager.dnsProvider.recordCache.lastUpdated),
        recordCount: this.dnsManager.dnsProvider.recordCache.records.length,
        stats: global.statsCounter || { created: 0, updated: 0, upToDate: 0, errors: 0 }
      };
      
      res.json(status);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle GET /records
   */
  async handleGetRecords(req, res, next) {
    try {
      const records = await this.dnsManager.dnsProvider.getRecordsFromCache();
      
      // Get tracked records from record tracker or fallback to empty array
      let trackedRecords = [];
      if (this.dnsManager && this.dnsManager.recordTracker) {
        trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
      }
      
      // Enhance records with tracked information
      const enhancedRecords = records.map(record => {
        const trackedRecord = trackedRecords.find(
          tr => tr.name === record.name && tr.type === record.type
        );
        
        // Check if hostname should be preserved
        let preserved = false;
        if (this.dnsManager && this.dnsManager.recordTracker) {
          preserved = this.dnsManager.recordTracker.shouldPreserveHostname(record.name);
        }
        
        return {
          ...record,
          managedBy: trackedRecord ? trackedRecord.managedBy : undefined,
          preserved: preserved,
          createdAt: trackedRecord ? trackedRecord.createdAt : undefined
        };
      });
      
      res.json({ records: enhancedRecords });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle GET /records/tracked
   */
  async handleGetTrackedRecords(req, res, next) {
    try {
      let trackedRecords = [];
      if (this.dnsManager && this.dnsManager.recordTracker) {
        trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
      }
      res.json({ records: trackedRecords });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle DELETE /records/:id
   */
  async handleDeleteRecord(req, res, next) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: 'Record ID is required' });
      }
      
      // Find record in cache
      const record = this.dnsManager.dnsProvider.recordCache.records.find(r => r.id === id);
      
      if (!record) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      // Check if record is preserved
      if (this.dnsManager.recordTracker.shouldPreserveHostname(record.name)) {
        return res.status(403).json({ 
          error: 'Cannot delete preserved record',
          message: `The record ${record.name} is in the preserved hostnames list`
        });
      }
      
      // Delete the record
      await this.dnsManager.dnsProvider.deleteRecord(id);
      
      // Remove from tracker
      this.dnsManager.recordTracker.untrackRecord(record);
      
      // Log the activity
      await this.activityLogger.logRecordDeleted(record);
      
      // Publish event
      this.eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
        name: record.name,
        type: record.type
      });
      
      res.json({ 
        success: true,
        message: `Deleted ${record.type} record for ${record.name}`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get preserved hostnames safely with fallback
   * @returns {Promise<Array>} List of preserved hostnames
   */
    async getPreservedHostnamesInternal() {
    try {
      // First try recordTracker from dnsManager
      if (this.dnsManager && 
          this.dnsManager.recordTracker && 
          Array.isArray(this.dnsManager.recordTracker.preservedHostnames)) {
        logger.debug('Getting preserved hostnames from recordTracker');
        return this.dnsManager.recordTracker.preservedHostnames;
      }
      
      // Check if dataStore exists at all
      if (!this.dataStore) {
        logger.warn('dataStore is not available');
        return process.env.PRESERVED_HOSTNAMES
          ? process.env.PRESERVED_HOSTNAMES.split(',').map(h => h.trim()).filter(h => h.length > 0)
          : [];
      }
      
      // Next check if dataStore has the method (safely)
      if (this.dataStore && typeof this.dataStore.getPreservedHostnames === 'function') {
        try {
          logger.debug('Getting preserved hostnames from dataStore.getPreservedHostnames');
          return await this.dataStore.getPreservedHostnames();
        } catch (err) {
          logger.warn(`Error calling dataStore.getPreservedHostnames: ${err.message}`);
        }
      }
      
      // Fallback to environment variable
      if (process.env.PRESERVED_HOSTNAMES) {
        logger.info('Getting preserved hostnames from environment variable fallback');
        return process.env.PRESERVED_HOSTNAMES
          .split(',')
          .map(h => h.trim())
          .filter(h => h.length > 0);
      }
      
      // Last resort: Return empty array to avoid errors
      logger.warn('No preserved hostnames source found, returning empty array');
      return [];
    } catch (error) {
      logger.error(`Internal error in getPreservedHostnamesInternal: ${error.message}`);
      return [];
    }
  }

  /**
   * Get managed hostnames safely with fallback
   * @returns {Promise<Array>} List of managed hostnames
   */
    async getManagedHostnamesInternal() {
    try {
      // First try recordTracker from dnsManager
      if (this.dnsManager && 
          this.dnsManager.recordTracker && 
          Array.isArray(this.dnsManager.recordTracker.managedHostnames)) {
        logger.debug('Getting managed hostnames from recordTracker');
        return this.dnsManager.recordTracker.managedHostnames;
      }
      
      // Check if dataStore exists at all
      if (!this.dataStore) {
        logger.warn('dataStore is not available');
        return process.env.MANAGED_HOSTNAMES
          ? this.parseManagedHostnames(process.env.MANAGED_HOSTNAMES)
          : [];
      }
      
      // Next check if dataStore has the method (safely)
      if (this.dataStore && typeof this.dataStore.getManagedHostnames === 'function') {
        try {
          logger.debug('Getting managed hostnames from dataStore.getManagedHostnames');
          return await this.dataStore.getManagedHostnames();
        } catch (err) {
          logger.warn(`Error calling dataStore.getManagedHostnames: ${err.message}`);
        }
      }
      
      // Fallback to environment variable
      if (process.env.MANAGED_HOSTNAMES) {
        logger.info('Getting managed hostnames from environment variable fallback');
        return this.parseManagedHostnames(process.env.MANAGED_HOSTNAMES);
      }
      
      // Last resort: Return empty array to avoid errors
      logger.warn('No managed hostnames source found, returning empty array');
      return [];
    } catch (error) {
      logger.error(`Internal error in getManagedHostnamesInternal: ${error.message}`);
      return [];
    }
  }
  
  // Helper method to parse managed hostnames from env var
  parseManagedHostnames(managedHostnamesStr) {
    return managedHostnamesStr
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
  }
  /**
   * Handle GET /preserved-hostnames
   */
  async handleGetPreservedHostnames(req, res, next) {
    try {
      logger.debug('Handling GET /preserved-hostnames request');
      
      // Check if dnsManager's recordTracker has preservedHostnames
      if (this.dnsManager && 
          this.dnsManager.recordTracker && 
          Array.isArray(this.dnsManager.recordTracker.preservedHostnames)) {
        logger.debug('Getting preserved hostnames from recordTracker');
        return res.json({ hostnames: this.dnsManager.recordTracker.preservedHostnames });
      }
      
      // Fallback to environment variable
      if (process.env.PRESERVED_HOSTNAMES) {
        logger.info('Getting preserved hostnames from environment variable');
        const preservedHostnames = process.env.PRESERVED_HOSTNAMES
          .split(',')
          .map(hostname => hostname.trim())
          .filter(hostname => hostname.length > 0);
        
        return res.json({ hostnames: preservedHostnames });
      }
      
      // Last resort: Return empty array
      res.json({ hostnames: [] });
    } catch (error) {
      logger.error(`Error in handleGetPreservedHostnames: ${error.message}`);
      // Return empty array instead of error to avoid crashing the UI
      res.json({ hostnames: [] });
    }
  }
  
  /**
   * Handle POST /preserved-hostnames
   */
  async handleAddPreservedHostname(req, res, next) {
    try {
      const { hostname } = req.body;
      
      if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
      }
      
      // Get current hostnames
      const preservedHostnames = await this.getPreservedHostnamesInternal();
      
      // Check if already exists
      if (preservedHostnames.includes(hostname)) {
        return res.status(409).json({
          success: false,
          message: `Hostname ${hostname} is already in the preserved list`,
          error: 'Hostname already exists'
        });
      }
      
      // Add the new hostname
      preservedHostnames.push(hostname);
      
      // Try to save back to dataStore if available
      let saved = false;
      if (this.dataStore) {
        try {
          if (typeof this.dataStore.setPreservedHostnames === 'function') {
            await this.dataStore.setPreservedHostnames(preservedHostnames);
            saved = true;
          } else {
            // Try to use dataStore.preservedHostnames property
            this.dataStore.preservedHostnames = preservedHostnames;
            saved = true;
          }
        } catch (err) {
          logger.error(`Error saving to dataStore: ${err.message}`);
        }
      }
      
      // Fallback: Update recordTracker if available
      if (!saved && this.dnsManager && this.dnsManager.recordTracker) {
        this.dnsManager.recordTracker.preservedHostnames = preservedHostnames;
        saved = true;
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'info',
          action: 'preserved_hostname_added',
          message: `Added ${hostname} to preserved hostnames`,
          details: { hostname }
        });
      }
      
      res.json({ 
        success: true,
        message: `Added ${hostname} to preserved hostnames`,
        persistedToDisk: saved
      });
    } catch (error) {
      logger.error(`Error in handleAddPreservedHostname: ${error.message}`);
      next(error);
    }
  }
  
  /**
   * Handle DELETE /preserved-hostnames/:hostname
   */
  async handleDeletePreservedHostname(req, res, next) {
    try {
      const { hostname } = req.params;
      
      if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
      }
      
      // Get current hostnames
      const preservedHostnames = await this.getPreservedHostnamesInternal();
      
      // Check if hostname exists
      if (!preservedHostnames.includes(hostname)) {
        return res.status(404).json({
          success: false,
          message: `Hostname ${hostname} not found in the preserved list`,
          error: 'Hostname not found'
        });
      }
      
      // Remove the hostname
      const updatedHostnames = preservedHostnames.filter(h => h !== hostname);
      
      // Try to save back to dataStore if available
      let saved = false;
      if (this.dataStore) {
        try {
          if (typeof this.dataStore.setPreservedHostnames === 'function') {
            await this.dataStore.setPreservedHostnames(updatedHostnames);
            saved = true;
          } else {
            // Try to use dataStore.preservedHostnames property
            this.dataStore.preservedHostnames = updatedHostnames;
            saved = true;
          }
        } catch (err) {
          logger.error(`Error saving to dataStore: ${err.message}`);
        }
      }
      
      // Fallback: Update recordTracker if available
      if (!saved && this.dnsManager && this.dnsManager.recordTracker) {
        this.dnsManager.recordTracker.preservedHostnames = updatedHostnames;
        saved = true;
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'warning',
          action: 'preserved_hostname_removed',
          message: `Removed ${hostname} from preserved hostnames`,
          details: { hostname }
        });
      }
      
      res.json({ 
        success: true,
        message: `Removed ${hostname} from preserved hostnames`,
        persistedToDisk: saved
      });
    } catch (error) {
      logger.error(`Error in handleDeletePreservedHostname: ${error.message}`);
      next(error);
    }
  }
  
  /**
   * Handle GET /managed-hostnames
   */
  async handleGetManagedHostnames(req, res, next) {
    try {
      logger.debug('Handling GET /managed-hostnames request');
      
      // Check if dnsManager's recordTracker has managedHostnames
      if (this.dnsManager && 
          this.dnsManager.recordTracker && 
          Array.isArray(this.dnsManager.recordTracker.managedHostnames)) {
        logger.debug('Getting managed hostnames from recordTracker');
        return res.json({ hostnames: this.dnsManager.recordTracker.managedHostnames });
      }
      
      // Fallback to environment variable
      if (process.env.MANAGED_HOSTNAMES) {
        logger.info('Getting managed hostnames from environment variable');
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
        
        return res.json({ hostnames: managedHostnames });
      }
      
      // Last resort: Return empty array
      res.json({ hostnames: [] });
    } catch (error) {
      logger.error(`Error in handleGetManagedHostnames: ${error.message}`);
      // Return empty array instead of error to avoid crashing the UI
      res.json({ hostnames: [] });
    }
  }
  
  /**
   * Handle POST /managed-hostnames
   */
  async handleAddManagedHostname(req, res, next) {
    try {
      const hostnameData = req.body;
      
      if (!hostnameData || !hostnameData.hostname || !hostnameData.type || !hostnameData.content) {
        return res.status(400).json({ error: 'Hostname, type, and content are required' });
      }
      
      // Validate hostname data
      try {
        this.validateManagedHostname(hostnameData);
      } catch (validationError) {
        return res.status(400).json({ 
          error: validationError.message,
          validationError: true
        });
      }
      
      // Get current hostnames
      const managedHostnames = await this.getManagedHostnamesInternal();
      
      // Check if hostname already exists with same type
      const existingIndex = managedHostnames.findIndex(
        h => h.hostname === hostnameData.hostname && h.type === hostnameData.type
      );
      
      if (existingIndex !== -1) {
        // Update existing entry
        managedHostnames[existingIndex] = hostnameData;
      } else {
        // Add new entry
        managedHostnames.push(hostnameData);
      }
      
      // Try to save back to dataStore if available
      let saved = false;
      if (this.dataStore) {
        try {
          if (typeof this.dataStore.setManagedHostnames === 'function') {
            await this.dataStore.setManagedHostnames(managedHostnames);
            saved = true;
          } else {
            // Try to use dataStore.managedHostnames property
            this.dataStore.managedHostnames = managedHostnames;
            saved = true;
          }
        } catch (err) {
          logger.error(`Error saving to dataStore: ${err.message}`);
        }
      }
      
      // Fallback: Update recordTracker if available
      if (!saved && this.dnsManager && this.dnsManager.recordTracker) {
        this.dnsManager.recordTracker.managedHostnames = managedHostnames;
        saved = true;
      }
      
      // Process the managed hostnames if possible
      if (this.dnsManager && typeof this.dnsManager.processManagedHostnames === 'function') {
        await this.dnsManager.processManagedHostnames();
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'info',
          action: 'managed_hostname_added',
          message: `Added ${hostnameData.hostname} to managed hostnames`,
          details: hostnameData
        });
      }
      
      res.json({ 
        success: true,
        message: `Added ${hostnameData.hostname} to managed hostnames`,
        persistedToDisk: saved
      });
    } catch (error) {
      if (error.validationError) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
  
  /**
   * Handle DELETE /managed-hostnames/:hostname
   */
  async handleDeleteManagedHostname(req, res, next) {
    try {
      const { hostname } = req.params;
      
      if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
      }
      
      // Get current hostnames
      const managedHostnames = await this.getManagedHostnamesInternal();
      
      // Check if hostname exists
      const existingIndex = managedHostnames.findIndex(h => h.hostname === hostname);
      
      if (existingIndex === -1) {
        return res.status(404).json({
          success: false,
          message: `Hostname ${hostname} not found in the managed list`,
          error: 'Hostname not found'
        });
      }
      
      // Remove the hostname
      const updatedHostnames = managedHostnames.filter(h => h.hostname !== hostname);
      
      // Try to save back to dataStore if available
      let saved = false;
      if (this.dataStore) {
        try {
          if (typeof this.dataStore.setManagedHostnames === 'function') {
            await this.dataStore.setManagedHostnames(updatedHostnames);
            saved = true;
          } else {
            // Try to use dataStore.managedHostnames property
            this.dataStore.managedHostnames = updatedHostnames;
            saved = true;
          }
        } catch (err) {
          logger.error(`Error saving to dataStore: ${err.message}`);
        }
      } 
      
      // Fallback: Update recordTracker if available
      if (!saved && this.dnsManager && this.dnsManager.recordTracker) {
        this.dnsManager.recordTracker.managedHostnames = updatedHostnames;
        saved = true;
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'warning',
          action: 'managed_hostname_removed',
          message: `Removed ${hostname} from managed hostnames`,
          details: { hostname }
        });
      }
      
      res.json({ 
        success: true,
        message: `Removed ${hostname} from managed hostnames`,
        persistedToDisk: saved
      });
    } catch (error) {
      logger.error(`Error in handleDeleteManagedHostname: ${error.message}`);
      next(error);
    }
  }
  
  /**
   * Handle GET /config
   */
  async handleGetConfig(req, res, next) {
    try {
      // Get sanitized configuration
      const config = this.config.getFullConfig ? 
        this.config.getFullConfig() : 
        this.sanitizeConfig(this.config);
      
      res.json(config);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Sanitize configuration to remove sensitive information
   * @param {Object} config - Configuration object
   */
  sanitizeConfig(config) {
    const safeConfig = { ...config };
    
    // Mask sensitive fields
    if (safeConfig.cloudflareToken) safeConfig.cloudflareToken = '********';
    if (safeConfig.route53AccessKey) safeConfig.route53AccessKey = '********';
    if (safeConfig.route53SecretKey) safeConfig.route53SecretKey = '********';
    if (safeConfig.digitalOceanToken) safeConfig.digitalOceanToken = '********';
    if (safeConfig.traefikApiPassword) safeConfig.traefikApiPassword = '********';
    
    return safeConfig;
  }
  
  /**
   * Handle POST /config/log-level
   */
  async handleSetLogLevel(req, res, next) {
    try {
      const { level } = req.body;
      
      if (!level) {
        return res.status(400).json({ error: 'Log level is required' });
      }
      
      // Check if level is valid
      if (!logger.setLevel(level)) {
        return res.status(400).json({ error: 'Invalid log level' });
      }
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'log_level_changed',
        message: `Log level changed to ${level}`,
        details: { level }
      });
      
      res.json({ 
        success: true,
        message: `Log level set to ${level}`
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle POST /config/cleanup
   */
  async handleSetCleanup(req, res, next) {
    try {
      const { enabled } = req.body;
      
      if (enabled === undefined) {
        return res.status(400).json({ error: 'Enabled flag is required' });
      }
      
      // Update cleanup configuration
      if (this.config.updateConfig) {
        await this.config.updateConfig('cleanupOrphaned', enabled, true);
      } else {
        // Fallback for older config implementation
        this.config.cleanupOrphaned = enabled;
      }
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'cleanup_setting_changed',
        message: `Cleanup orphaned records setting changed to ${enabled ? 'enabled' : 'disabled'}`,
        details: { enabled }
      });
      
      res.json({ 
        success: true,
        message: `Cleanup orphaned records ${enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle GET /activity-log
   */
  async handleGetActivityLog(req, res, next) {
    try {
      if (!this.activityLogger || typeof this.activityLogger.getLogs !== 'function') {
        return res.json({ logs: [], total: 0, hasMore: false });
      }
      
      // Get query parameters for filtering
      const filter = {
        type: req.query.type,
        action: req.query.action,
        search: req.query.search,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };
      
      // Get pagination parameters
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Get logs from activity logger
      const logs = await this.activityLogger.getLogs(filter, limit, offset);
      
      res.json(logs);
    } catch (error) {
      logger.error(`Error in handleGetActivityLog: ${error.message}`);
      res.json({ logs: [], total: 0, hasMore: false });
    }
  }
  
  /**
   * Handle POST /refresh
   */
  async handleRefresh(req, res, next) {
    try {
      // Trigger refresh based on mode
      if (this.config.operationMode === 'direct' && global.directDnsManager) {
        await global.directDnsManager.pollContainers();
      } else if (global.traefikMonitor) {
        await global.traefikMonitor.pollTraefikAPI();
      } else {
        throw new Error('No active monitor available for refresh');
      }
      
      res.json({ 
        success: true,
        message: 'DNS records refreshed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle GET /providers
   */
  async handleGetProviders(req, res, next) {
    try {
      // Get list of available providers
      let providers = [];
      
      if (this.dnsManager && this.dnsManager.dnsProvider && this.dnsManager.dnsProvider.factory) {
        // New style with factory on provider
        providers = await this.dnsManager.dnsProvider.factory.getAvailableProviders();
      } else if (this.dnsManager && this.dnsManager.providerFactory) {
        // Enhanced style with provider factory
        providers = await this.dnsManager.providerFactory.getAvailableProviders();
      } else {
        // Fallback to basic providers
        providers = ['cloudflare', 'route53', 'digitalocean'];
      }
      
      res.json({ 
        providers,
        current: this.config.dnsProvider
      });
    } catch (error) {
      // Provide at least the current provider on error
      res.json({
        providers: [this.config.dnsProvider],
        current: this.config.dnsProvider
      });
    }
  }
  
  /**
   * Handle POST /providers/switch
   */
  async handleSwitchProvider(req, res, next) {
    try {
      const { provider, credentials } = req.body;
      
      if (!provider) {
        return res.status(400).json({ error: 'Provider is required' });
      }
      
      if (!credentials) {
        return res.status(400).json({ error: 'Provider credentials are required' });
      }
      
      // Check if enhanced config is available
      if (this.config.validateAndSwitchProvider) {
        // Enhanced config with provider switching
        await this.config.validateAndSwitchProvider(provider, credentials);
      } else {
        return res.status(501).json({ error: 'Provider switching not supported in this version' });
      }
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'provider_changed',
        message: `DNS provider changed to ${provider}`,
        details: { provider }
      });
      
      res.json({ 
        success: true,
        message: `DNS provider changed to ${provider}`,
        provider
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle POST /operation-mode
   */
  async handleSetOperationMode(req, res, next) {
    try {
      const { mode } = req.body;
      
      if (!mode) {
        return res.status(400).json({ error: 'Operation mode is required' });
      }
      
      // Validate mode
      if (mode !== 'traefik' && mode !== 'direct') {
        return res.status(400).json({ error: 'Invalid operation mode. Must be "traefik" or "direct"' });
      }
      
      // Update operation mode
      if (this.config.updateConfig) {
        await this.config.updateConfig('operationMode', mode, true);
      } else {
        // Fallback for older config implementation
        this.config.operationMode = mode;
      }
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'operation_mode_changed',
        message: `Operation mode changed to ${mode}`,
        details: { mode }
      });
      
      res.json({ 
        success: true,
        message: `Operation mode changed to ${mode}`,
        mode
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Validate managed hostname data
   * @param {Object} hostnameData - Hostname data to validate
   * @throws {Error} - Validation error
   */
  validateManagedHostname(hostnameData) {
    const validTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'];
    
    // Check required fields
    if (!hostnameData.hostname || !hostnameData.hostname.includes('.')) {
      const error = new Error('Hostname must be a valid domain name (e.g., example.com)');
      error.validationError = true;
      throw error;
    }
    
    if (!validTypes.includes(hostnameData.type)) {
      const error = new Error(`Invalid record type. Must be one of: ${validTypes.join(', ')}`);
      error.validationError = true;
      throw error;
    }
    
    if (!hostnameData.content) {
      const error = new Error('Content is required');
      error.validationError = true;
      throw error;
    }
    
    // Type-specific validations
    switch (hostnameData.type) {
      case 'A':
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(hostnameData.content)) {
          const error = new Error('A record content must be a valid IPv4 address');
          error.validationError = true;
          throw error;
        }
        break;
        
      case 'AAAA':
        if (!hostnameData.content.includes(':')) {
          const error = new Error('AAAA record content must be a valid IPv6 address');
          error.validationError = true;
          throw error;
        }
        break;
        
      case 'MX':
        if (!hostnameData.content.includes('.')) {
          const error = new Error('MX record content must be a valid domain name');
          error.validationError = true;
          throw error;
        }
        
        // Check priority
        if (hostnameData.priority !== undefined) {
          const priority = parseInt(hostnameData.priority, 10);
          if (isNaN(priority) || priority < 0 || priority > 65535) {
            const error = new Error('MX priority must be a number between 0 and 65535');
            error.validationError = true;
            throw error;
          }
        }
        break;
        
      case 'SRV':
        // Check required SRV fields
        if (hostnameData.port === undefined) {
          const error = new Error('SRV record requires a port');
          error.validationError = true;
          throw error;
        }
        
        // Validate port
        const port = parseInt(hostnameData.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          const error = new Error('SRV port must be a number between 1 and 65535');
          error.validationError = true;
          throw error;
        }
        break;
    }
    
    // Validate TTL
    if (hostnameData.ttl !== undefined) {
      const ttl = parseInt(hostnameData.ttl, 10);
      if (isNaN(ttl) || (ttl !== 1 && ttl < 60)) {
        const error = new Error('TTL must be 1 (Auto) or at least 60 seconds');
        error.validationError = true;
        throw error;
      }
    }
    
    return true;
  }
  
  /**
   * Get time since a timestamp in human-readable format
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {string} - Human-readable time string
   */
  getFreshnessString(timestamp) {
    if (!timestamp) return 'never';
    
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ago`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h ago`;
    } else {
      return `${Math.floor(seconds / 86400)}d ago`;
    }
  }
  
  /**
   * Generic API error handler
   */
  handleApiError(err, req, res, next) {
    logger.error(`API Error: ${err.message}`);
    
    // Log the error
    if (this.activityLogger) {
      this.activityLogger.logError(
        'API',
        `API error: ${err.message}`,
        {
          path: req.path,
          method: req.method,
          stack: err.stack
        }
      );
    }
    
    // Send error response
    res.status(err.statusCode || 500).json({
      error: err.message || 'Internal server error',
      status: 'error'
    });
  }
}

module.exports = ApiRoutes;
