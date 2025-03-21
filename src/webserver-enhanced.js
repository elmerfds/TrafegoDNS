// src/webserver-enhanced.js
// Enhanced Web Server Component with robust API implementation

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const basicAuth = require('express-basic-auth');
const logger = require('./utils/logger');
const EventTypes = require('./events/EventTypes');
const EnhancedApiRoutes = require('./api/enhancedApiRoutes');

class EnhancedWebServer {
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
    
    // Add error handling middleware
    this.app.use((err, req, res, next) => {
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
    });
  }

  /**
   * Set up API routes
   */
  setupApiRoutes() {
    // Create enhanced API routes
    const apiRoutes = new EnhancedApiRoutes(
      this.config,
      this.eventBus,
      this.dnsManager,
      this.dataStore,
      this.activityLogger
    );
    
    // Mount API routes at /api
    this.app.use('/api', apiRoutes.router);
    
    // WebSocket API setup (if configured)
    this.setupWebSocketApi();
  }

  /**
   * Set up WebSocket API if enabled
   */
  setupWebSocketApi() {
    // Skip if WebSocket support is not enabled
    if (process.env.ENABLE_WEBSOCKET !== 'true') {
      return;
    }
    
    try {
      const WebSocketServer = require('./websocket/WebSocketServer');
      this.webSocketServer = new WebSocketServer(this.config, this.eventBus, this.server);
      
      logger.debug('WebSocket API initialized');
    } catch (error) {
      logger.warn(`WebSocket API could not be initialized: ${error.message}`);
    }
  }

  /**
   * Set up React frontend serving
   */
  setupStaticRoutes() {
    // Check if we have a built UI
    const webUIPath = path.join(__dirname, '../webui/build');
    
    let uiExists = false;
    try {
      uiExists = fsSync.existsSync(webUIPath);
    } catch (error) {
      logger.error(`Error checking for Web UI path: ${error.message}`);
    }
    
    if (uiExists) {
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
                body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
                h1 { color: #0066CC; }
                h2 { color: #00A86B; margin-top: 25px; }
                code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
                .endpoint { margin-bottom: 10px; padding: 5px; border-left: 3px solid #0066CC; padding-left: 10px; }
                .method { font-weight: bold; display: inline-block; width: 60px; }
                .url { color: #333; }
                .description { color: #666; margin-left: 65px; }
              </style>
            </head>
            <body>
              <h1>TráfegoDNS API</h1>
              <p>The Web UI build is not available. API endpoints are accessible under <code>/api</code>.</p>
              
              <h2>Status Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/status</span></div>
                <div class="description">Get system status</div>
              </div>
              
              <h2>DNS Record Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/records</span></div>
                <div class="description">List all DNS records</div>
              </div>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/records/tracked</span></div>
                <div class="description">List tracked DNS records</div>
              </div>
              <div class="endpoint">
                <div><span class="method">DELETE</span> <span class="url">/api/records/:id</span></div>
                <div class="description">Delete a DNS record</div>
              </div>
              
              <h2>Preserved Hostnames Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/preserved-hostnames</span></div>
                <div class="description">List preserved hostnames</div>
              </div>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/preserved-hostnames</span></div>
                <div class="description">Add a preserved hostname</div>
              </div>
              <div class="endpoint">
                <div><span class="method">DELETE</span> <span class="url">/api/preserved-hostnames/:hostname</span></div>
                <div class="description">Remove a preserved hostname</div>
              </div>
              
              <h2>Managed Hostnames Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/managed-hostnames</span></div>
                <div class="description">List managed hostnames</div>
              </div>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/managed-hostnames</span></div>
                <div class="description">Add a managed hostname</div>
              </div>
              <div class="endpoint">
                <div><span class="method">DELETE</span> <span class="url">/api/managed-hostnames/:hostname</span></div>
                <div class="description">Remove a managed hostname</div>
              </div>
              
              <h2>Action Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/refresh</span></div>
                <div class="description">Trigger DNS refresh</div>
              </div>
              
              <h2>Configuration Endpoints</h2>
              <div class="endpoint">
                <div><span class="method">GET</span> <span class="url">/api/config</span></div>
                <div class="description">Get current configuration</div>
              </div>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/config/log-level</span></div>
                <div class="description">Set log level</div>
              </div>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/cleanup/toggle</span></div>
                <div class="description">Toggle cleanup setting</div>
              </div>
              <div class="endpoint">
                <div><span class="method">POST</span> <span class="url">/api/operation-mode</span></div>
                <div class="description">Set operation mode</div>
              </div>
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
      
      // Start the HTTP server
      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, () => {
          logger.success(`Web UI and API running on port ${this.port}`);
          
          // Initialize WebSocket server if configured
          if (this.webSocketServer) {
            this.webSocketServer.init();
          }
          
          resolve(true);
        });
        
        // Handle server startup errors
        this.server.on('error', (err) => {
          logger.error(`Failed to start web server: ${err.message}`);
          reject(err);
        });
      });
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
        // Close WebSocket server if it exists
        if (this.webSocketServer) {
          this.webSocketServer.shutdown();
        }
        
        // Close HTTP server
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
}

module.exports = EnhancedWebServer;