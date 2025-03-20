/**
 * src/webserver.js
 * Enhanced Web Server Component for TrafegoDNS
 * Provides API endpoints and serves the React frontend
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const fsSync = require('fs'); // Use fs synchronous version for existsSync
const fs = require('fs').promises; // Use fs.promises for async operations
const basicAuth = require('express-basic-auth');
const logger = require('./utils/logger');
const EventTypes = require('./events/EventTypes');

class WebServer {
  constructor(config, eventBus, dnsManager, dataStore, activityLogger) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.dataStore = dataStore;
    this.activityLogger = activityLogger;
    this.app = express();
    this.server = null;
    this.port = process.env.WEB_UI_PORT || 8080;
  }

  /**
   * Set up Express middleware and routes
   */
  setupMiddleware() {
    // Enable CORS
    this.app.use(cors());

    // Parse JSON request body
    this.app.use(express.json());

    // Add basic authentication if username and password are set
    if (process.env.WEB_UI_USERNAME && process.env.WEB_UI_PASSWORD) {
      logger.info('Setting up Basic Authentication for Web UI');
      this.app.use(basicAuth({
        users: { 
          [process.env.WEB_UI_USERNAME]: process.env.WEB_UI_PASSWORD 
        },
        challenge: true,
        realm: 'TráfegoDNS Web UI'
      }));
    }

    // Add request logging middleware
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Set up API routes
   */
  setupApiRoutes() {
    const apiRouter = express.Router();

    // Status endpoint
    apiRouter.get('/status', (req, res) => {
      const status = {
        version: this.getVersion(),
        status: 'running',
        provider: this.config.dnsProvider,
        zone: this.config.getProviderDomain(),
        operationMode: this.config.operationMode,
        publicIp: this.config.getPublicIPSync(),
        publicIpv6: this.config.getPublicIPv6Sync(),
        cleanupEnabled: this.config.cleanupOrphaned,
        traefikStatus: this.config.operationMode === 'traefik' ? 'connected' : 'not used',
        dockerStatus: 'connected',
        logLevel: logger.levelNames[logger.level],
        pollInterval: this.formatInterval(this.config.pollInterval),
        cacheFreshness: this.getTimeSinceString(this.dnsManager.dnsProvider.recordCache.lastUpdated),
        recordCount: this.dnsManager.dnsProvider.recordCache.records.length,
        stats: global.statsCounter || { created: 0, updated: 0, upToDate: 0, errors: 0 }
      };
      
      res.json(status);
    });

    // Configuration endpoints
    apiRouter.get('/config', async (req, res) => {
      try {
        // Get configuration from dataStore
        const appConfig = await this.dataStore.getAppConfig();
        
        // Sanitize sensitive information
        const safeConfig = this.config.getFullConfig ? 
          this.config.getFullConfig() : 
          this.sanitizeConfig(appConfig);
        
        res.json(safeConfig);
      } catch (error) {
        logger.error(`Error fetching configuration: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch configuration' });
      }
    });

    apiRouter.post('/config/log-level', async (req, res) => {
      try {
        const { level } = req.body;
        
        if (!level) {
          return res.status(400).json({ error: 'Log level is required' });
        }
        
        const success = logger.setLevel(level);
        
        if (!success) {
          return res.status(400).json({ error: 'Invalid log level' });
        }
        
        // Log the change to activity log
        if (this.activityLogger) {
          await this.activityLogger.logConfigChanged('logLevel', logger.levelNames[logger.level], level);
        }
        
        res.json({ 
          success: true,
          message: `Log level set to ${level}`
        });
      } catch (error) {
        logger.error(`Error setting log level: ${error.message}`);
        res.status(500).json({ error: 'Failed to set log level' });
      }
    });

    // DNS Records endpoints
    apiRouter.get('/records', async (req, res) => {
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
        logger.error(`Error fetching records: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch DNS records' });
      }
    });

    // Tracked Records endpoint
    apiRouter.get('/records/tracked', (req, res) => {
      const trackedRecords = this.dnsManager.recordTracker.getAllTrackedRecords();
      res.json({ records: trackedRecords });
    });

    // Preserved Hostnames endpoints
    apiRouter.get('/preserved-hostnames', async (req, res) => {
      try {
        const preservedHostnames = await this.dataStore.getPreservedHostnames();
        res.json({ hostnames: preservedHostnames || [] });
      } catch (error) {
        logger.error(`Error fetching preserved hostnames: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch preserved hostnames' });
      }
    });

    apiRouter.post('/preserved-hostnames', async (req, res) => {
      try {
        const { hostname } = req.body;
        
        if (!hostname) {
          return res.status(400).json({ error: 'Hostname is required' });
        }
        
        // Get existing preserved hostnames
        const preservedHostnames = await this.dataStore.getPreservedHostnames();
        
        // Check if hostname already exists
        if (preservedHostnames.includes(hostname)) {
          return res.status(409).json({ error: 'Hostname already exists' });
        }
        
        // Add hostname
        await this.dataStore.addPreservedHostname(hostname);
        
        // Log to activity log
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
          message: `Added ${hostname} to preserved hostnames`
        });
      } catch (error) {
        logger.error(`Error adding preserved hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to add preserved hostname' });
      }
    });

    apiRouter.delete('/preserved-hostnames/:hostname', async (req, res) => {
      try {
        const { hostname } = req.params;
        
        // Get existing preserved hostnames
        const preservedHostnames = await this.dataStore.getPreservedHostnames();
        
        // Check if hostname exists
        if (!preservedHostnames.includes(hostname)) {
          return res.status(404).json({ error: 'Hostname not found' });
        }
        
        // Remove hostname
        await this.dataStore.removePreservedHostname(hostname);
        
        // Log to activity log
        if (this.activityLogger) {
          await this.activityLogger.log({
            type: 'info',
            action: 'preserved_hostname_removed',
            message: `Removed ${hostname} from preserved hostnames`,
            details: { hostname }
          });
        }
        
        res.json({ 
          success: true,
          message: `Removed ${hostname} from preserved hostnames`
        });
      } catch (error) {
        logger.error(`Error removing preserved hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to remove preserved hostname' });
      }
    });

    // Managed Hostnames endpoints
    apiRouter.get('/managed-hostnames', async (req, res) => {
      try {
        const managedHostnames = await this.dataStore.getManagedHostnames();
        res.json({ hostnames: managedHostnames || [] });
      } catch (error) {
        logger.error(`Error fetching managed hostnames: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch managed hostnames' });
      }
    });

    apiRouter.post('/managed-hostnames', async (req, res) => {
      try {
        const hostnameData = req.body;
        
        if (!hostnameData || !hostnameData.hostname || !hostnameData.type || !hostnameData.content) {
          return res.status(400).json({ error: 'Hostname, type, and content are required' });
        }
        
        // Add to managed hostnames
        await this.dataStore.addManagedHostname(hostnameData);
        
        // Process the managed hostnames
        if (this.dnsManager.processManagedHostnames) {
          await this.dnsManager.processManagedHostnames();
        }
        
        // Log to activity log
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
          message: `Added ${hostnameData.hostname} to managed hostnames`
        });
      } catch (error) {
        logger.error(`Error adding managed hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to add managed hostname' });
      }
    });

    apiRouter.delete('/managed-hostnames/:hostname', async (req, res) => {
      try {
        const { hostname } = req.params;
        
        // Remove hostname
        await this.dataStore.removeManagedHostname(hostname);
        
        // Log to activity log
        if (this.activityLogger) {
          await this.activityLogger.log({
            type: 'info',
            action: 'managed_hostname_removed',
            message: `Removed ${hostname} from managed hostnames`,
            details: { hostname }
          });
        }
        
        res.json({ 
          success: true,
          message: `Removed ${hostname} from managed hostnames`
        });
      } catch (error) {
        logger.error(`Error removing managed hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to remove managed hostname' });
      }
    });

    // Activity Log endpoints
    apiRouter.get('/activity-log', async (req, res) => {
      try {
        if (!this.activityLogger) {
          return res.status(404).json({ error: 'Activity logging is not available' });
        }
        
        const { type, action, search, limit = 100, offset = 0 } = req.query;
        
        const filter = {
          type,
          action,
          search
        };
        
        const result = await this.activityLogger.getLogs(
          filter, 
          parseInt(limit, 10), 
          parseInt(offset, 10)
        );
        
        res.json(result);
      } catch (error) {
        logger.error(`Error fetching activity logs: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch activity logs' });
      }
    });

    // Refresh records endpoint
    apiRouter.post('/refresh', async (req, res) => {
      try {
        if (this.config.operationMode === 'direct' && global.directDnsManager) {
          await global.directDnsManager.pollContainers();
          
          // Log to activity log
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
          
          // Log to activity log
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
        logger.error(`Error refreshing DNS records: ${error.message}`);
        res.status(500).json({ error: 'Failed to refresh DNS records' });
      }
    });

    // Operation mode endpoint
    apiRouter.post('/operation-mode', async (req, res) => {
      try {
        const { mode } = req.body;
        
        if (!mode || !['traefik', 'direct'].includes(mode.toLowerCase())) {
          return res.status(400).json({ error: 'Valid operation mode (traefik or direct) is required' });
        }
        
        const currentMode = this.config.operationMode;
        
        // Check if mode is already set
        if (currentMode.toLowerCase() === mode.toLowerCase()) {
          return res.json({
            success: true,
            message: `Already in ${mode.toUpperCase()} mode`
          });
        }
        
        // Update mode in configuration
        if (this.config.updateConfig) {
          await this.config.updateConfig('operationMode', mode.toLowerCase());
          
          // Log to activity log
          if (this.activityLogger) {
            await this.activityLogger.log({
              type: 'info',
              action: 'operation_mode_changed',
              message: `Operation mode changed from ${currentMode.toUpperCase()} to ${mode.toUpperCase()}`,
              details: { oldMode: currentMode, newMode: mode }
            });
          }
          
          res.json({
            success: true,
            message: `Operation mode changed to ${mode.toUpperCase()}`
          });
        } else {
          // If updateConfig is not available, return error
          throw new Error('Configuration update is not supported');
        }
      } catch (error) {
        logger.error(`Error changing operation mode: ${error.message}`);
        res.status(500).json({ error: 'Failed to change operation mode' });
      }
    });

    // DNS cache management
    apiRouter.post('/cache/refresh', async (req, res) => {
      try {
        // Force refresh of DNS cache
        await this.dnsManager.dnsProvider.refreshRecordCache();
        
        // Log to activity log
        if (this.activityLogger) {
          await this.activityLogger.logCacheRefreshed(
            this.dnsManager.dnsProvider.recordCache.records.length
          );
        }
        
        res.json({
          success: true,
          message: 'DNS cache refreshed successfully',
          recordCount: this.dnsManager.dnsProvider.recordCache.records.length
        });
      } catch (error) {
        logger.error(`Error refreshing DNS cache: ${error.message}`);
        res.status(500).json({ error: 'Failed to refresh DNS cache' });
      }
    });

    // Cleanup control endpoint
    apiRouter.post('/cleanup/toggle', async (req, res) => {
      try {
        const { enabled } = req.body;
        
        if (enabled === undefined) {
          return res.status(400).json({ error: 'Enabled status is required' });
        }
        
        const currentStatus = this.config.cleanupOrphaned;
        
        // Update config
        if (this.config.updateConfig) {
          await this.config.updateConfig('cleanupOrphaned', !!enabled);
          
          // Log to activity log
          if (this.activityLogger) {
            await this.activityLogger.log({
              type: 'info',
              action: 'cleanup_status_changed',
              message: `Cleanup orphaned records ${enabled ? 'enabled' : 'disabled'}`,
              details: { oldStatus: currentStatus, newStatus: !!enabled }
            });
          }
          
          res.json({
            success: true,
            message: `Cleanup orphaned records ${enabled ? 'enabled' : 'disabled'}`
          });
        } else {
          // If updateConfig is not available, return error
          throw new Error('Configuration update is not supported');
        }
      } catch (error) {
        logger.error(`Error toggling cleanup status: ${error.message}`);
        res.status(500).json({ error: 'Failed to toggle cleanup status' });
      }
    });

    // Force cleanup endpoint
    apiRouter.post('/cleanup/run', async (req, res) => {
      try {
        if (!this.dnsManager.cleanupOrphanedRecords) {
          return res.status(404).json({ error: 'Cleanup functionality is not available' });
        }
        
        // Get active hostnames
        let activeHostnames = [];
        
        if (this.config.operationMode === 'direct' && global.directDnsManager) {
          // Extract hostnames from direct mode
          const result = await global.directDnsManager.extractHostnamesFromLabels(
            global.directDnsManager.lastDockerLabels || {}
          );
          activeHostnames = result.hostnames || [];
        } else if (global.traefikMonitor) {
          // Get routers from Traefik
          const routers = await global.traefikMonitor.getRouters();
          const result = global.traefikMonitor.processRouters(routers);
          activeHostnames = result.hostnames || [];
        }
        
        // Run cleanup with active hostnames
        await this.dnsManager.cleanupOrphanedRecords(activeHostnames);
        
        res.json({
          success: true,
          message: 'Orphaned records cleanup completed'
        });
      } catch (error) {
        logger.error(`Error running cleanup: ${error.message}`);
        res.status(500).json({ error: 'Failed to run cleanup' });
      }
    });

    // Mount API router at /api
    this.app.use('/api', apiRouter);
  }

  /**
   * Set up React frontend serving
   */
  setupStaticRoutes() {
    // Check if we have a built UI
    const webUIPath = path.join(__dirname, '../webui/build');
    
    if (fsSync.existsSync(webUIPath)) {
      logger.info(`Serving Web UI from ${webUIPath}`);
      
      // Serve static files from React build
      this.app.use(express.static(webUIPath));
      
      // Serve index.html for all other routes (to support React Router)
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(webUIPath, 'index.html'));
      });
    } else {
      logger.info('Web UI build not found, only API endpoints available');
      
      // Provide a simple page with API information
      this.app.get('/', (req, res) => {
        res.send(`
          <html>
            <head>
              <title>TráfegoDNS API</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #0066CC; }
                code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
              </style>
            </head>
            <body>
              <h1>TráfegoDNS API</h1>
              <p>The UI build is not available. API endpoints are accessible under <code>/api</code>.</p>
              <p>Check <code>/api/status</code> for system status.</p>
            </body>
          </html>
        `);
      });
    }
  }

  /**
   * Start the web server
   */
  async start() {
    try {
      this.setupMiddleware();
      this.setupApiRoutes();
      this.setupStaticRoutes();
      
      this.server = this.app.listen(this.port, () => {
        logger.success(`Web UI and API running on port ${this.port}`);
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to start web server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop the web server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server.close((err) => {
          if (err) {
            logger.error(`Error stopping web server: ${err.message}`);
            reject(err);
          } else {
            logger.info('Web server stopped');
            this.server = null;
            resolve();
          }
        });
      });
    }
  }

  /**
   * Get package version
   */
  getVersion() {
    try {
      const packageJsonPath = path.join(__dirname, '../package.json');
      const packageJson = require(packageJsonPath);
      return packageJson.version;
    } catch (error) {
      logger.error(`Error reading package version: ${error.message}`);
      return '1.0.0';
    }
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
  getTimeSinceString(timestamp) {
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
   * Sanitize configuration to remove sensitive information
   * @param {Object} config - Configuration object
   */
  sanitizeConfig(config) {
    const sanitized = { ...config };
    
    // Remove sensitive fields
    if (sanitized.cloudflareToken) sanitized.cloudflareToken = '********';
    if (sanitized.route53AccessKey) sanitized.route53AccessKey = '********';
    if (sanitized.route53SecretKey) sanitized.route53SecretKey = '********';
    if (sanitized.digitalOceanToken) sanitized.digitalOceanToken = '********';
    if (sanitized.traefikApiPassword) sanitized.traefikApiPassword = '********';
    
    return sanitized;
  }
}

module.exports = WebServer;