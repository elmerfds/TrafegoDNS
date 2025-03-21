// src/api/apiRoutes.js
/**
 * API Routes for TráfegoDNS
 * Provides REST API endpoints for the Web UI
 */
const express = require('express');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

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
    this.dataStore = dataStore;
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
      const trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
      
      // Enhance records with tracked information
      const enhancedRecords = records.map(record => {
        const trackedRecord = trackedRecords.find(
          tr => tr.name === record.name && tr.type === record.type
        );
        
        return {
          ...record,
          managedBy: trackedRecord ? trackedRecord.managedBy : undefined,
          preserved: this.dnsManager.recordTracker.shouldPreserveHostname(record.name),
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
      const trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
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
   * Handle GET /preserved-hostnames
   */
  async handleGetPreservedHostnames(req, res, next) {
    try {
      // Check if dataStore has been properly initialized
      if (!this.dataStore || typeof this.dataStore.getPreservedHostnames !== 'function') {
        logger.error('DataStore not properly initialized or missing getPreservedHostnames method');
        
        // Fallback: If using recordTracker, we can try to get preserved hostnames from there
        if (this.dnsManager && this.dnsManager.recordTracker && 
            this.dnsManager.recordTracker.preservedHostnames) {
          res.json({ hostnames: this.dnsManager.recordTracker.preservedHostnames });
          return;
        }
        
        // If all else fails, return empty array
        res.json({ hostnames: [] });
        return;
      }
      
      const preservedHostnames = await this.dataStore.getPreservedHostnames();
      res.json({ hostnames: preservedHostnames });
    } catch (error) {
      logger.error(`Error in getPreservedHostnames: ${error.message}`);
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
      
      // Add hostname to preserved list
      await this.dataStore.addPreservedHostname(hostname);
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'preserved_hostname_added',
        message: `Added ${hostname} to preserved hostnames`,
        details: { hostname }
      });
      
      res.json({ 
        success: true,
        message: `Added ${hostname} to preserved hostnames`
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
      
      // Remove hostname from preserved list
      await this.dataStore.removePreservedHostname(hostname);
      
      // Log the activity
      await this.activityLogger.log({
        type: 'warning',
        action: 'preserved_hostname_removed',
        message: `Removed ${hostname} from preserved hostnames`,
        details: { hostname }
      });
      
      res.json({ 
        success: true,
        message: `Removed ${hostname} from preserved hostnames`
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
      // Check if dataStore has been properly initialized
      if (!this.dataStore || typeof this.dataStore.getManagedHostnames !== 'function') {
        logger.error('DataStore not properly initialized or missing getManagedHostnames method');
        
        // Fallback: If using recordTracker, we can try to get managed hostnames from there
        if (this.dnsManager && this.dnsManager.recordTracker && 
            this.dnsManager.recordTracker.managedHostnames) {
          res.json({ hostnames: this.dnsManager.recordTracker.managedHostnames });
          return;
        }
        
        // If all else fails, return empty array
        res.json({ hostnames: [] });
        return;
      }
      
      const managedHostnames = await this.dataStore.getManagedHostnames();
      res.json({ hostnames: managedHostnames });
    } catch (error) {
      logger.error(`Error in getManagedHostnames: ${error.message}`);
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
      this.validateManagedHostname(hostnameData);
      
      // Add hostname to managed list
      await this.dataStore.addManagedHostname(hostnameData);
      
      // Process the managed hostnames
      await this.dnsManager.processManagedHostnames();
      
      // Log the activity
      await this.activityLogger.log({
        type: 'info',
        action: 'managed_hostname_added',
        message: `Added ${hostnameData.hostname} to managed hostnames`,
        details: hostnameData
      });
      
      res.json({ 
        success: true,
        message: `Added ${hostnameData.hostname} to managed hostnames`
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
      
      // Remove hostname from managed list
      await this.dataStore.removeManagedHostname(hostname);
      
      // Log the activity
      await this.activityLogger.log({
        type: 'warning',
        action: 'managed_hostname_removed',
        message: `Removed ${hostname} from managed hostnames`,
        details: { hostname }
      });
      
      res.json({ 
        success: true,
        message: `Removed ${hostname} from managed hostnames`
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
      const config = this.config.getFullConfig();
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
      await this.config.updateConfig('cleanupOrphaned', enabled, true);
      
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
      next(error);
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
      const providers = await this.dnsManager.dnsProvider.factory.getAvailableProviders();
      
      res.json({ 
        providers,
        current: this.config.dnsProvider
      });
    } catch (error) {
      next(error);
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
      
      // Switch provider
      await this.config.validateAndSwitchProvider(provider, credentials);
      
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
      await this.config.updateConfig('operationMode', mode, true);
      
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