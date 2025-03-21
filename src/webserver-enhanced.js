// src/webserver-enhanced.js
/**
 * Enhanced Web Server Component for TráfegoDNS
 * Provides API endpoints, serves the React frontend, and handles WebSockets
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const basicAuth = require('express-basic-auth');
const logger = require('./utils/logger');
const ApiRoutes = require('./api/apiRoutes');
const WebSocketServer = require('./websocket/WebSocketServer');

class EnhancedWebServer {
  /**
   * Create a new EnhancedWebServer instance
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
    
    this.app = express();
    this.server = null;
    this.wsServer = null;
    this.port = process.env.WEB_UI_PORT || 8080;
  }

  /**
   * Set up Express middleware
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
  // Make sure DataStore is properly initialized before creating ApiRoutes
  if (!this.dataStore) {
    logger.warn('DataStore not initialized in WebServer, creating empty instance');
    const DataStore = require('./data/DataStore');
    this.dataStore = new DataStore(this.config);
    // Initialize it
    this.dataStore.init().catch(err => {
      logger.error(`Failed to initialize DataStore: ${err.message}`);
    });
  }
  
  const apiRoutes = new ApiRoutes(
    this.config,
    this.eventBus,
    this.dnsManager,
    this.dataStore,
    this.activityLogger
  );
  
  // Mount API router at /api
  this.app.use('/api', apiRoutes.router);

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
      // Set up Express middleware and routes
      this.setupMiddleware();
      this.setupApiRoutes();
      this.setupStaticRoutes();
      
      // Create HTTP server
      this.server = http.createServer(this.app);
      
      // Initialize WebSocket server
      this.wsServer = new WebSocketServer(this.config, this.eventBus, this.server);
      await this.wsServer.init();
      
      // Start listening
      return new Promise((resolve, reject) => {
        this.server.listen(this.port, () => {
          logger.success(`Web UI, API and WebSocket server running on port ${this.port}`);
          resolve(true);
        });
        
        this.server.on('error', (error) => {
          logger.error(`Failed to start web server: ${error.message}`);
          reject(error);
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
    if (this.wsServer) {
      this.wsServer.shutdown();
    }
    
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
}

module.exports = EnhancedWebServer;