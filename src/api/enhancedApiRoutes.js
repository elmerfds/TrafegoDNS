// src/api/enhancedApiRoutes.js
// Enhanced API routes with improved compatibility layer for DataStore methods

const express = require('express');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

class EnhancedApiRoutes {
  /**
   * Create API routes with additional robustness for DataStore compatibility
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} eventBus - EventBus instance
   * @param {Object} dnsManager - DNSManager instance
   * @param {Object} dataStore - DataStore instance (can be null/undefined)
   * @param {Object} activityLogger - ActivityLogger instance (can be null/undefined)
   */
  constructor(config, eventBus, dnsManager, dataStore, activityLogger) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.activityLogger = activityLogger;
    
    // Create a data directory path that we'll use for fallback storage if needed
    this.dataDir = path.join('/config', 'data');
    
    // Build our enhanced dataStore with fallbacks to handle missing methods
    this.dataStore = this.createEnhancedDataStore(dataStore);
    
    // Create router
    this.router = express.Router();
    
    // Set up routes
    this.setupRoutes();
  }
  
  /**
   * Create an enhanced DataStore with fallback methods
   * This ensures all expected methods are available even if the original dataStore doesn't have them
   */
  createEnhancedDataStore(originalDataStore) {
    // Start with the original dataStore or an empty object if not provided
    const dataStore = originalDataStore || {};
    
    // Cache for preservedHostnames and managedHostnames
    let preservedHostnamesCache = null;
    let managedHostnamesCache = null;
    
    // File paths for fallback storage
    const preservedHostnamesPath = path.join(this.dataDir, 'preserved-hostnames.json');
    const managedHostnamesPath = path.join(this.dataDir, 'managed-hostnames.json');
    
    // Create a wrapper with consistent method implementations and fallbacks
    const enhancedStore = {
      // Original methods and properties
      ...dataStore,
      
      /**
       * Get preserved hostnames with multiple fallback mechanisms
       * @returns {Promise<Array>} List of preserved hostnames
       */
      getPreservedHostnames: async () => {
        try {
          logger.debug('Attempting to get preserved hostnames');
          
          // If the original has the method, use it
          if (dataStore && typeof dataStore.getPreservedHostnames === 'function') {
            logger.debug('Using original dataStore.getPreservedHostnames');
            return await dataStore.getPreservedHostnames();
          }
          
          // If we have a cache, use it
          if (preservedHostnamesCache !== null) {
            logger.debug('Using preserved hostnames cache');
            return preservedHostnamesCache;
          }
          
          // Try to get from dnsManager.recordTracker
          if (this.dnsManager && 
              this.dnsManager.recordTracker && 
              Array.isArray(this.dnsManager.recordTracker.preservedHostnames)) {
            logger.debug('Getting preserved hostnames from dnsManager.recordTracker');
            preservedHostnamesCache = [...this.dnsManager.recordTracker.preservedHostnames];
            return preservedHostnamesCache;
          }
          
          // Try to read from file
          try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            if (fsSync.existsSync(preservedHostnamesPath)) {
              logger.debug(`Reading preserved hostnames from file: ${preservedHostnamesPath}`);
              const fileData = await fs.readFile(preservedHostnamesPath, 'utf8');
              preservedHostnamesCache = JSON.parse(fileData);
              return preservedHostnamesCache;
            }
          } catch (fileError) {
            logger.debug(`Error reading preserved hostnames file: ${fileError.message}`);
          }
          
          // Try from environment variable
          if (process.env.PRESERVED_HOSTNAMES) {
            logger.debug('Getting preserved hostnames from environment variable');
            const envHostnames = process.env.PRESERVED_HOSTNAMES
              .split(',')
              .map(hostname => hostname.trim())
              .filter(hostname => hostname.length > 0);
            
            preservedHostnamesCache = envHostnames;
            return preservedHostnamesCache;
          }
          
          // Fallback to empty array
          logger.debug('No preserved hostnames source found, returning empty array');
          preservedHostnamesCache = [];
          return [];
        } catch (error) {
          logger.error(`Error in getPreservedHostnames: ${error.message}`);
          return [];
        }
      },
      
      /**
       * Set preserved hostnames with multiple fallback mechanisms
       * @param {Array} hostnames - List of hostnames to preserve
       * @returns {Promise<boolean>} Success status
       */
      setPreservedHostnames: async (hostnames) => {
        try {
          logger.debug(`Setting preserved hostnames: ${hostnames.join(', ')}`);
          
          // Update cache
          preservedHostnamesCache = [...hostnames];
          
          // If the original has the method, use it
          if (dataStore && typeof dataStore.setPreservedHostnames === 'function') {
            logger.debug('Using original dataStore.setPreservedHostnames');
            return await dataStore.setPreservedHostnames(hostnames);
          }
          
          // Try to set in dnsManager.recordTracker
          if (this.dnsManager && this.dnsManager.recordTracker) {
            logger.debug('Setting preserved hostnames in dnsManager.recordTracker');
            this.dnsManager.recordTracker.preservedHostnames = [...hostnames];
          }
          
          // Write to file as fallback
          try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            logger.debug(`Writing preserved hostnames to file: ${preservedHostnamesPath}`);
            await fs.writeFile(
              preservedHostnamesPath, 
              JSON.stringify(hostnames, null, 2),
              'utf8'
            );
            return true;
          } catch (fileError) {
            logger.error(`Error writing preserved hostnames file: ${fileError.message}`);
          }
          
          return true;
        } catch (error) {
          logger.error(`Error in setPreservedHostnames: ${error.message}`);
          return false;
        }
      },
      
      /**
       * Add a preserved hostname with multiple fallback mechanisms
       * @param {string} hostname - Hostname to preserve
       * @returns {Promise<boolean>} Success status
       */
      addPreservedHostname: async (hostname) => {
        try {
          logger.debug(`Adding preserved hostname: ${hostname}`);
          
          // Get current hostnames
          const hostnames = await enhancedStore.getPreservedHostnames();
          
          // Check if already exists
          if (hostnames.includes(hostname)) {
            return true;
          }
          
          // Add hostname
          hostnames.push(hostname);
          
          // Save using our setPreservedHostnames method
          return await enhancedStore.setPreservedHostnames(hostnames);
        } catch (error) {
          logger.error(`Error in addPreservedHostname: ${error.message}`);
          return false;
        }
      },
      
      /**
       * Remove a preserved hostname with multiple fallback mechanisms
       * @param {string} hostname - Hostname to remove
       * @returns {Promise<boolean>} Success status
       */
      removePreservedHostname: async (hostname) => {
        try {
          logger.debug(`Removing preserved hostname: ${hostname}`);
          
          // Get current hostnames
          const hostnames = await enhancedStore.getPreservedHostnames();
          
          // Remove hostname
          const updatedHostnames = hostnames.filter(h => h !== hostname);
          
          // Check if any changes were made
          if (updatedHostnames.length === hostnames.length) {
            // No changes, return success
            return true;
          }
          
          // Save using our setPreservedHostnames method
          return await enhancedStore.setPreservedHostnames(updatedHostnames);
        } catch (error) {
          logger.error(`Error in removePreservedHostname: ${error.message}`);
          return false;
        }
      },
      
      /**
       * Get managed hostnames with multiple fallback mechanisms
       * @returns {Promise<Array>} List of managed hostnames
       */
      getManagedHostnames: async () => {
        try {
          logger.debug('Attempting to get managed hostnames');
          
          // If the original has the method, use it
          if (dataStore && typeof dataStore.getManagedHostnames === 'function') {
            logger.debug('Using original dataStore.getManagedHostnames');
            return await dataStore.getManagedHostnames();
          }
          
          // If we have a cache, use it
          if (managedHostnamesCache !== null) {
            logger.debug('Using managed hostnames cache');
            return managedHostnamesCache;
          }
          
          // Try to get from dnsManager.recordTracker
          if (this.dnsManager && 
              this.dnsManager.recordTracker && 
              Array.isArray(this.dnsManager.recordTracker.managedHostnames)) {
            logger.debug('Getting managed hostnames from dnsManager.recordTracker');
            managedHostnamesCache = [...this.dnsManager.recordTracker.managedHostnames];
            return managedHostnamesCache;
          }
          
          // Try to read from file
          try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            if (fsSync.existsSync(managedHostnamesPath)) {
              logger.debug(`Reading managed hostnames from file: ${managedHostnamesPath}`);
              const fileData = await fs.readFile(managedHostnamesPath, 'utf8');
              managedHostnamesCache = JSON.parse(fileData);
              return managedHostnamesCache;
            }
          } catch (fileError) {
            logger.debug(`Error reading managed hostnames file: ${fileError.message}`);
          }
          
          // Try from environment variable
          if (process.env.MANAGED_HOSTNAMES) {
            logger.debug('Getting managed hostnames from environment variable');
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
            
            managedHostnamesCache = managedHostnames;
            return managedHostnamesCache;
          }
          
          // Fallback to empty array
          logger.debug('No managed hostnames source found, returning empty array');
          managedHostnamesCache = [];
          return [];
        } catch (error) {
          logger.error(`Error in getManagedHostnames: ${error.message}`);
          return [];
        }
      },
      
      /**
       * Set managed hostnames with multiple fallback mechanisms
       * @param {Array} hostnames - List of managed hostname objects
       * @returns {Promise<boolean>} Success status
       */
      setManagedHostnames: async (hostnames) => {
        try {
          logger.debug(`Setting ${hostnames.length} managed hostnames`);
          
          // Update cache
          managedHostnamesCache = [...hostnames];
          
          // If the original has the method, use it
          if (dataStore && typeof dataStore.setManagedHostnames === 'function') {
            logger.debug('Using original dataStore.setManagedHostnames');
            return await dataStore.setManagedHostnames(hostnames);
          }
          
          // Try to set in dnsManager.recordTracker
          if (this.dnsManager && this.dnsManager.recordTracker) {
            logger.debug('Setting managed hostnames in dnsManager.recordTracker');
            this.dnsManager.recordTracker.managedHostnames = [...hostnames];
          }
          
          // Write to file as fallback
          try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            logger.debug(`Writing managed hostnames to file: ${managedHostnamesPath}`);
            await fs.writeFile(
              managedHostnamesPath, 
              JSON.stringify(hostnames, null, 2),
              'utf8'
            );
            return true;
          } catch (fileError) {
            logger.error(`Error writing managed hostnames file: ${fileError.message}`);
          }
          
          return true;
        } catch (error) {
          logger.error(`Error in setManagedHostnames: ${error.message}`);
          return false;
        }
      },
      
      /**
       * Add a managed hostname with multiple fallback mechanisms
       * @param {Object} hostnameData - Hostname data object
       * @returns {Promise<boolean>} Success status
       */
      addManagedHostname: async (hostnameData) => {
        try {
          logger.debug(`Adding managed hostname: ${hostnameData.hostname}`);
          
          // Get current hostnames
          const hostnames = await enhancedStore.getManagedHostnames();
          
          // Find existing hostname with same type if any
          const index = hostnames.findIndex(h => 
            h.hostname === hostnameData.hostname && h.type === hostnameData.type
          );
          
          if (index !== -1) {
            // Update existing
            hostnames[index] = hostnameData;
          } else {
            // Add new
            hostnames.push(hostnameData);
          }
          
          // Save using our setManagedHostnames method
          return await enhancedStore.setManagedHostnames(hostnames);
        } catch (error) {
          logger.error(`Error in addManagedHostname: ${error.message}`);
          return false;
        }
      },
      
      /**
       * Remove a managed hostname with multiple fallback mechanisms
       * @param {string} hostname - Hostname to remove
       * @returns {Promise<boolean>} Success status
       */
      removeManagedHostname: async (hostname) => {
        try {
          logger.debug(`Removing managed hostname: ${hostname}`);
          
          // Get current hostnames
          const hostnames = await enhancedStore.getManagedHostnames();
          
          // Filter out hostnames to remove
          const updatedHostnames = hostnames.filter(h => h.hostname !== hostname);
          
          // Check if any changes were made
          if (updatedHostnames.length === hostnames.length) {
            // No changes, return success
            return true;
          }
          
          // Save using our setManagedHostnames method
          return await enhancedStore.setManagedHostnames(updatedHostnames);
        } catch (error) {
          logger.error(`Error in removeManagedHostname: ${error.message}`);
          return false;
        }
      }
    };
    
    return enhancedStore;
  }
  
  /**
   * Set up API routes
   */
  setupRoutes() {
    // Status endpoint
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
    
    // Activity Log endpoints
    this.router.get('/activity-log', this.handleGetActivityLog.bind(this));
    
    // Action endpoints
    this.router.post('/refresh', this.handleRefresh.bind(this));
    this.router.post('/cleanup/toggle', this.handleToggleCleanup.bind(this));
    this.router.post('/operation-mode', this.handleSetOperationMode.bind(this));
  }
  
  /**
   * Handle GET /status
   */
  async handleGetStatus(req, res, next) {
    try {
      // Find software version
      let version = '1.0.0';
      try {
        const packageJsonPath = path.join(__dirname, '../../package.json');
        if (fsSync.existsSync(packageJsonPath)) {
          const packageJson = require(packageJsonPath);
          version = packageJson.version || '1.0.0';
        }
      } catch (err) {
        logger.debug(`Error reading package.json: ${err.message}`);
      }
      
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
        pollInterval: this.formatInterval(this.config.pollInterval),
        ipRefreshInterval: this.formatInterval(this.config.ipRefreshInterval),
        cacheRefreshInterval: this.formatInterval(this.config.cacheRefreshInterval),
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
      
      // Get preserved hostnames for checking
      const preservedHostnames = await this.dataStore.getPreservedHostnames();
      
      // Enhance records with tracked information
      let trackedRecords = [];
      if (this.dnsManager && this.dnsManager.recordTracker) {
        trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
      }
      
      const enhancedRecords = records.map(record => {
        // Check if record is tracked
        const trackedRecord = trackedRecords.find(
          tr => tr.name === record.name && tr.type === record.type
        );
        
        // Check if hostname should be preserved
        let preserved = false;
        const fullHostname = this.getFullHostname(record.name, this.config.getProviderDomain());
        
        if (preservedHostnames.includes(fullHostname)) {
          preserved = true;
        } else {
          // Also check for wildcard matches
          for (const pattern of preservedHostnames) {
            if (pattern.startsWith('*.') && fullHostname.endsWith(pattern.substring(1))) {
              preserved = true;
              break;
            }
          }
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
      
      // Get preserved hostnames for checking
      const preservedHostnames = await this.dataStore.getPreservedHostnames();
      
      // Check if record is preserved
      const fullHostname = this.getFullHostname(record.name, this.config.getProviderDomain());
      let isPreserved = preservedHostnames.includes(fullHostname);
      
      // Also check for wildcard matches
      if (!isPreserved) {
        for (const pattern of preservedHostnames) {
          if (pattern.startsWith('*.') && fullHostname.endsWith(pattern.substring(1))) {
            isPreserved = true;
            break;
          }
        }
      }
      
      if (isPreserved) {
        return res.status(403).json({ 
          error: 'Cannot delete preserved record',
          message: `The record ${fullHostname} is in the preserved hostnames list`
        });
      }
      
      // Delete the record
      await this.dnsManager.dnsProvider.deleteRecord(id);
      
      // Remove from tracker if available
      if (this.dnsManager.recordTracker) {
        this.dnsManager.recordTracker.untrackRecord(record);
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.logRecordDeleted(record);
      }
      
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
   * Handle GET /preserved-hostnames
   */
  async handleGetPreservedHostnames(req, res, next) {
    try {
      logger.debug('Handling GET /preserved-hostnames request');
      
      // Get preserved hostnames using our enhanced dataStore
      const hostnames = await this.dataStore.getPreservedHostnames();
      
      res.json({ hostnames });
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
      const hostnames = await this.dataStore.getPreservedHostnames();
      
      // Check if hostname already exists
      if (hostnames.includes(hostname)) {
        return res.status(409).json({
          success: false,
          message: `Hostname ${hostname} is already in the preserved list`,
          error: 'Hostname already exists'
        });
      }
      
      // Add hostname using our enhanced dataStore
      const success = await this.dataStore.addPreservedHostname(hostname);
      
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
        persistedToDisk: success
      });
    } catch (error) {
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
      const hostnames = await this.dataStore.getPreservedHostnames();
      
      // Check if hostname exists
      if (!hostnames.includes(hostname)) {
        return res.status(404).json({
          success: false,
          message: `Hostname ${hostname} not found in the preserved list`,
          error: 'Hostname not found'
        });
      }
      
      // Remove hostname using our enhanced dataStore
      const success = await this.dataStore.removePreservedHostname(hostname);
      
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
        persistedToDisk: success
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle GET /managed-hostnames
   */
  async handleGetManagedHostnames(req, res, next) {
    try {
      logger.debug('Handling GET /managed-hostnames request');
      
      // Get managed hostnames using our enhanced dataStore
      const hostnames = await this.dataStore.getManagedHostnames();
      
      res.json({ hostnames });
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
      
      // Add hostname using our enhanced dataStore
      const success = await this.dataStore.addManagedHostname(hostnameData);
      
      // Process the managed hostnames
      if (this.dnsManager.processManagedHostnames) {
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
        persistedToDisk: success
      });
    } catch (error) {
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
      
      // Remove hostname using our enhanced dataStore
      const success = await this.dataStore.removeManagedHostname(hostname);
      
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
        persistedToDisk: success
      });
    } catch (error) {
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
   * Handle POST /config/log-level
   */
  async handleSetLogLevel(req, res, next) {
    try {
      const { level } = req.body;
      
      if (!level) {
        return res.status(400).json({ error: 'Log level is required' });
      }
      
      // Validate log level
      if (!logger.setLevel(level)) {
        return res.status(400).json({ error: 'Invalid log level' });
      }
      
      // Log the activity
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'info',
          action: 'log_level_changed',
          message: `Log level changed to ${level}`,
          details: { level }
        });
      }
      
      res.json({ 
        success: true,
        message: `Log level set to ${level}`
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Handle POST /cleanup/toggle
   */
  async handleToggleCleanup(req, res, next) {
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
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'info',
          action: 'cleanup_setting_changed',
          message: `Cleanup orphaned records setting changed to ${enabled ? 'enabled' : 'disabled'}`,
          details: { enabled }
        });
      }
      
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
        
        // Log the activity
        if (this.activityLogger) {
          await this.activityLogger.log({
            type: 'info',
            action: 'dns_refresh',
            message: 'DNS records refreshed manually (direct mode)',
            details: { mode: 'direct' }
          });
        }
      } else if (global.traefikMonitor) {
        await global.traefikMonitor.pollTraefikAPI();
        
        // Log the activity
        if (this.activityLogger) {
          await this.activityLogger.log({
            type: 'info',
            action: 'dns_refresh',
            message: 'DNS records refreshed manually (traefik mode)',
            details: { mode: 'traefik' }
          });
        }
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
      if (this.activityLogger) {
        await this.activityLogger.log({
          type: 'info',
          action: 'operation_mode_changed',
          message: `Operation mode changed to ${mode}`,
          details: { mode }
        });
      }
      
      res.json({ 
        success: true,
        message: `Operation mode changed to ${mode}`,
        mode
      });
    } catch (error) {
      next(error);
    }
  }
  
  /*
   * Helper methods
   */
  
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
   * Format time interval for display
   * @param {number} milliseconds - Time in milliseconds
   */
  formatInterval(milliseconds) {
    if (!milliseconds) return 'unknown';
    
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${Math.round(milliseconds / 1000)}s`;
    } else if (milliseconds < 3600000) {
      return `${Math.round(milliseconds / 60000)}m`;
    } else {
      return `${Math.round(milliseconds / 3600000)}h`;
    }
  }
  
  /**
   * Get time since a timestamp in human-readable format
   * @param {number} timestamp - Timestamp in milliseconds
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
   * Get full hostname including domain if needed
   * @param {string} name - Record name
   * @param {string} domain - Domain zone
   */
  getFullHostname(name, domain) {
    if (name === '@') {
      return domain;
    }
    
    if (name.endsWith(domain)) {
      return name;
    }
    
    return `${name}.${domain}`;
  }
  
  /**
   * Validate managed hostname data
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
}