/**
 * Web Server Component for TráfegoDNS
 * Provides API endpoints and serves the React frontend
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const logger = require('./utils/logger');

class WebServer {
  constructor(config, eventBus, dnsManager, recordTracker) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.recordTracker = recordTracker;
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

    // DNS Records endpoint
    apiRouter.get('/records', async (req, res) => {
      try {
        const records = await this.dnsManager.dnsProvider.getRecordsFromCache();
        const trackedRecords = this.recordTracker.getAllTrackedRecords();
        
        // Enhance records with tracked information
        const enhancedRecords = records.map(record => {
          const trackedRecord = trackedRecords.find(
            tr => tr.name === record.name && tr.type === record.type
          );
          
          return {
            ...record,
            managedBy: trackedRecord ? trackedRecord.managedBy : undefined,
            preserved: this.recordTracker.shouldPreserveHostname(record.name),
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
      const trackedRecords = this.recordTracker.getAllTrackedRecords();
      res.json({ records: trackedRecords });
    });

    // Preserved Hostnames endpoints
    apiRouter.get('/preserved-hostnames', (req, res) => {
      res.json({ hostnames: this.recordTracker.preservedHostnames || [] });
    });

    apiRouter.post('/preserved-hostnames', (req, res) => {
      try {
        const { hostname } = req.body;
        
        if (!hostname) {
          return res.status(400).json({ error: 'Hostname is required' });
        }
        
        // Check if hostname already exists
        if (this.recordTracker.preservedHostnames.includes(hostname)) {
          return res.status(409).json({ error: 'Hostname already exists' });
        }
        
        // Add hostname
        this.recordTracker.preservedHostnames.push(hostname);
        
        // Save to environment variable
        process.env.PRESERVED_HOSTNAMES = this.recordTracker.preservedHostnames.join(',');
        
        res.json({ 
          success: true,
          message: `Added ${hostname} to preserved hostnames`
        });
      } catch (error) {
        logger.error(`Error adding preserved hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to add preserved hostname' });
      }
    });

    apiRouter.delete('/preserved-hostnames/:hostname', (req, res) => {
      try {
        const { hostname } = req.params;
        
        // Check if hostname exists
        if (!this.recordTracker.preservedHostnames.includes(hostname)) {
          return res.status(404).json({ error: 'Hostname not found' });
        }
        
        // Remove hostname
        this.recordTracker.preservedHostnames = this.recordTracker.preservedHostnames.filter(
          h => h !== hostname
        );
        
        // Save to environment variable
        process.env.PRESERVED_HOSTNAMES = this.recordTracker.preservedHostnames.join(',');
        
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
    apiRouter.get('/managed-hostnames', (req, res) => {
      res.json({ hostnames: this.recordTracker.managedHostnames || [] });
    });

    apiRouter.post('/managed-hostnames', async (req, res) => {
      try {
        const hostnameData = req.body;
        
        if (!hostnameData || !hostnameData.hostname || !hostnameData.type || !hostnameData.content) {
          return res.status(400).json({ error: 'Hostname, type, and content are required' });
        }
        
        // Create a string representation for managed hostnames
        const hostnameStr = `${hostnameData.hostname}:${hostnameData.type}:${hostnameData.content}:${hostnameData.ttl || 3600}:${hostnameData.proxied === true}`;
        
        // Add to managed hostnames
        if (!this.recordTracker.managedHostnames) {
          this.recordTracker.managedHostnames = [];
        }
        
        // Check if hostname already exists
        const existingIndex = this.recordTracker.managedHostnames.findIndex(
          h => h.hostname === hostnameData.hostname && h.type === hostnameData.type
        );
        
        if (existingIndex !== -1) {
          // Update existing
          this.recordTracker.managedHostnames[existingIndex] = hostnameData;
        } else {
          // Add new
          this.recordTracker.managedHostnames.push(hostnameData);
        }
        
        // Save to environment variable
        const managedHostnamesStr = this.recordTracker.managedHostnames.map(h => 
          `${h.hostname}:${h.type}:${h.content}:${h.ttl || 3600}:${h.proxied === true}`
        ).join(',');
        
        process.env.MANAGED_HOSTNAMES = managedHostnamesStr;
        
        // Process the managed hostnames
        await this.dnsManager.processManagedHostnames();
        
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
        
        // Check if hostname exists
        const existingIndex = this.recordTracker.managedHostnames.findIndex(
          h => h.hostname === hostname
        );
        
        if (existingIndex === -1) {
          return res.status(404).json({ error: 'Hostname not found' });
        }
        
        // Remove hostname
        this.recordTracker.managedHostnames.splice(existingIndex, 1);
        
        // Save to environment variable
        const managedHostnamesStr = this.recordTracker.managedHostnames.map(h => 
          `${h.hostname}:${h.type}:${h.content}:${h.ttl || 3600}:${h.proxied === true}`
        ).join(',');
        
        process.env.MANAGED_HOSTNAMES = managedHostnamesStr;
        
        res.json({ 
          success: true,
          message: `Removed ${hostname} from managed hostnames`
        });
      } catch (error) {
        logger.error(`Error removing managed hostname: ${error.message}`);
        res.status(500).json({ error: 'Failed to remove managed hostname' });
      }
    });

    // Log Level endpoint
    apiRouter.post('/config/log-level', (req, res) => {
      try {
        const { level } = req.body;
        
        if (!level) {
          return res.status(400).json({ error: 'Log level is required' });
        }
        
        const success = logger.setLevel(level);
        
        if (!success) {
          return res.status(400).json({ error: 'Invalid log level' });
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

    // Refresh records endpoint
    apiRouter.post('/refresh', async (req, res) => {
      try {
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
        logger.error(`Error refreshing DNS records: ${error.message}`);
        res.status(500).json({ error: 'Failed to refresh DNS records' });
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
    
    if (fs.existsSync(webUIPath)) {
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
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
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
}

module.exports = WebServer;
