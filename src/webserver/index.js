/**
 * Web Server for TráfegoDNS
 * Provides REST API and serves the web UI
 */
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const basicAuth = require('express-basic-auth');

class WebServer {
  constructor(config, eventBus, dnsManager, recordTracker) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.recordTracker = recordTracker;
    
    // Default web UI port
    this.port = process.env.WEB_UI_PORT || 8080;
    
    // Create Express app
    this.app = express();
    
    // Initialize HTTP server
    this.server = http.createServer(this.app);
    
    // Configure authentication if enabled
    this.setupAuth();
    
    // Configure middleware
    this.setupMiddleware();
    
    // Configure routes
    this.setupRoutes();
    
    // Set up event subscriptions
    this.setupEventSubscriptions();
    
    // In-memory cache for recent events
    this.activityLog = [];
    this.maxLogEntries = 100; // Limit log size
  }
  
  /**
   * Set up authentication if enabled
   */
  setupAuth() {
    // Check if auth is enabled
    const username = process.env.WEB_UI_USERNAME;
    const password = process.env.WEB_UI_PASSWORD;
    
    if (username && password) {
      logger.info('Web UI authentication enabled');
      
      const users = {};
      users[username] = password;
      
      this.app.use(basicAuth({
        users,
        challenge: true,
        realm: 'TráfegoDNS Web UI',
      }));
    } else {
      logger.warn('Web UI authentication disabled - consider securing your API with WEB_UI_USERNAME and WEB_UI_PASSWORD');
    }
  }
  
  /**
   * Configure Express middleware
   */
  setupMiddleware() {
    // Enable CORS for development
    this.app.use(cors());
    
    // Parse JSON request bodies
    this.app.use(express.json());
    
    // Serve static files from the web UI directory
    const webUiPath = path.join(__dirname, '..', '..', 'webui', 'build');
    this.app.use(express.static(webUiPath));
    
    // Add basic logging middleware
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }
  
  /**
   * Set up API routes
   */
  setupRoutes() {
    // API routes
    const apiRouter = express.Router();
    
    // Status endpoint
    apiRouter.get('/status', (req, res) => {
      res.json({
        status: 'running',
        version: process.env.npm_package_version || '1.0.0',
        provider: this.config.dnsProvider,
        operationMode: this.config.operationMode
      });
    });
    
    // Get all DNS records
    apiRouter.get('/records', async (req, res) => {
      try {
        const records = await this.dnsManager.dnsProvider.getRecordsFromCache();
        res.json(records);
      } catch (error) {
        logger.error(`Error fetching DNS records: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get tracked records
    apiRouter.get('/records/tracked', (req, res) => {
      const records = this.recordTracker.getAllTrackedRecords();
      res.json(records);
    });
    
    // Get preserved hostnames
    apiRouter.get('/preserved-hostnames', (req, res) => {
      res.json(this.recordTracker.preservedHostnames || []);
    });
    
    // Add preserved hostname
    apiRouter.post('/preserved-hostnames', (req, res) => {
      const { hostname } = req.body;
      
      if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
      }
      
      // Check if already exists
      if (this.recordTracker.preservedHostnames.includes(hostname)) {
        return res.status(409).json({ error: 'Hostname already preserved' });
      }
      
      this.recordTracker.preservedHostnames.push(hostname);
      
      // Update environment variable
      process.env.PRESERVED_HOSTNAMES = this.recordTracker.preservedHostnames.join(',');
      
      res.status(201).json({ success: true, hostname });
    });
    
    // Remove preserved hostname
    apiRouter.delete('/preserved-hostnames/:hostname', (req, res) => {
      const { hostname } = req.params;
      
      // Filter out the hostname
      this.recordTracker.preservedHostnames = this.recordTracker.preservedHostnames.filter(
        h => h !== hostname
      );
      
      // Update environment variable
      process.env.PRESERVED_HOSTNAMES = this.recordTracker.preservedHostnames.join(',');
      
      res.json({ success: true });
    });
    
    // Get managed hostnames
    apiRouter.get('/managed-hostnames', (req, res) => {
      res.json(this.recordTracker.managedHostnames || []);
    });
    
    // Add managed hostname
    apiRouter.post('/managed-hostnames', async (req, res) => {
      const { hostname, type, content, ttl, proxied } = req.body;
      
      if (!hostname) {
        return res.status(400).json({ error: 'Hostname is required' });
      }
      
      const record = {
        hostname,
        type: type || 'A',
        content: content || (type === 'CNAME' ? this.config.getProviderDomain() : this.config.getPublicIPSync()),
        ttl: parseInt(ttl || '3600', 10),
        proxied: proxied !== undefined ? proxied : this.config.defaultProxied
      };
      
      // Add to managed hostnames
      this.recordTracker.managedHostnames.push(record);
      
      // Update environment variable
      process.env.MANAGED_HOSTNAMES = this.recordTracker.managedHostnames.map(
        h => `${h.hostname}:${h.type}:${h.content}:${h.ttl}:${h.proxied}`
      ).join(',');
      
      // Process the new managed hostname
      try {
        await this.dnsManager.processManagedHostnames();
        res.status(201).json({ success: true, record });
      } catch (error) {
        logger.error(`Error processing managed hostname: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Remove managed hostname
    apiRouter.delete('/managed-hostnames/:hostname', (req, res) => {
      const { hostname } = req.params;
      
      // Filter out the hostname
      this.recordTracker.managedHostnames = this.recordTracker.managedHostnames.filter(
        h => h.hostname !== hostname
      );
      
      // Update environment variable
      process.env.MANAGED_HOSTNAMES = this.recordTracker.managedHostnames.map(
        h => `${h.hostname}:${h.type}:${h.content}:${h.ttl}:${h.proxied}`
      ).join(',');
      
      res.json({ success: true });
    });
    
    // Force refresh
    apiRouter.post('/refresh', async (req, res) => {
      try {
        logger.info('Manual refresh triggered from Web UI');
        
        // Force refresh DNS cache
        await this.dnsManager.dnsProvider.refreshRecordCache(true);
        
        // Trigger a poll if using Traefik mode
        if (this.config.operationMode.toLowerCase() === 'traefik' && global.traefikMonitor) {
          await global.traefikMonitor.pollTraefikAPI();
        } else if (global.directDnsManager) {
          await global.directDnsManager.pollContainers();
        }
        
        res.json({ success: true });
      } catch (error) {
        logger.error(`Error during manual refresh: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get activity log
    apiRouter.get('/activity-log', (req, res) => {
      res.json(this.activityLog);
    });
    
    // Get configuration
    apiRouter.get('/config', (req, res) => {
      // Return sanitized config (no sensitive data)
      const sanitizedConfig = {
        dnsProvider: this.config.dnsProvider,
        operationMode: this.config.operationMode,
        providerDomain: this.config.getProviderDomain(),
        defaultRecordType: this.config.defaultRecordType,
        defaultContent: this.config.defaultContent,
        defaultProxied: this.config.defaultProxied,
        defaultTTL: this.config.defaultTTL,
        cleanupOrphaned: this.config.cleanupOrphaned,
        pollInterval: this.config.pollInterval,
        watchDockerEvents: this.config.watchDockerEvents,
        logLevel: process.env.LOG_LEVEL || 'INFO'
      };
      
      res.json(sanitizedConfig);
    });
    
    // Update log level
    apiRouter.post('/config/log-level', (req, res) => {
      const { level } = req.body;
      
      if (!level || !['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].includes(level)) {
        return res.status(400).json({ error: 'Valid log level is required' });
      }
      
      // Update log level
      const success = logger.setLevel(level);
      
      if (success) {
        // Update environment variable
        process.env.LOG_LEVEL = level;
        res.json({ success: true, level });
      } else {
        res.status(500).json({ error: 'Failed to update log level' });
      }
    });
    
    // Mount API router
    this.app.use('/api', apiRouter);
    
    // Fallback - send index.html for any unmatched route (SPA support)
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', '..', 'webui', 'build', 'index.html'));
    });
  }
  
  /**
   * Set up event subscriptions to track DNS operations
   */
  setupEventSubscriptions() {
    // Track DNS record created events
    this.eventBus.subscribe(EventTypes.DNS_RECORD_CREATED, (data) => {
      this.addLogEntry('record_created', data);
    });
    
    // Track DNS record updated events
    this.eventBus.subscribe(EventTypes.DNS_RECORD_UPDATED, (data) => {
      this.addLogEntry('record_updated', data);
    });
    
    // Track DNS record deleted events
    this.eventBus.subscribe(EventTypes.DNS_RECORD_DELETED, (data) => {
      this.addLogEntry('record_deleted', data);
    });
    
    // Track errors
    this.eventBus.subscribe(EventTypes.ERROR_OCCURRED, (data) => {
      this.addLogEntry('error', data);
    });
  }
  
  /**
   * Add entry to the activity log
   */
  addLogEntry(type, data) {
    // Create log entry
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      data
    };
    
    // Add to log
    this.activityLog.unshift(entry);
    
    // Trim log if needed
    if (this.activityLog.length > this.maxLogEntries) {
      this.activityLog = this.activityLog.slice(0, this.maxLogEntries);
    }
  }
  
  /**
   * Start the web server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        logger.success(`Web UI listening on port ${this.port}`);
        resolve(true);
      });
      
      this.server.on('error', (error) => {
        logger.error(`Failed to start Web UI: ${error.message}`);
        reject(error);
      });
    });
  }
  
  /**
   * Stop the web server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Web UI stopped');
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }
}

module.exports = WebServer;