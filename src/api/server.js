/**
 * src/api/server.js
 * API Server for TráfegoDNS with authentication support
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const ApiRouter = require('./router');
const { verifyAuthToken } = require('./middleware/auth');
const AuthService = require('../auth/service');
const createAuthRouter = require('./routes/auth');

class ApiServer {
  constructor(config, eventBus, dnsManager, stateManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.stateManager = stateManager;
    this.app = express();
    this.server = null;
    
    // Initialize the authentication service
    this.authService = new AuthService(config, eventBus);
    
    // Initialize the API server
    this.initialize();
  }
  
  /**
   * Initialize the API server
   */
  async initialize() {
    // Initialize authentication service
    await this.authService.initialize();
    
    // Make auth service available to middleware
    this.app.set('authService', this.authService);
    
    // Set up middleware
    this.setupMiddleware();
    
    // Authentication routes (public)
    this.app.use('/api/auth', createAuthRouter(this.authService, this.config));
    
    // Add authentication middleware to protect API routes
    // Skip for health check and auth routes
    this.app.use('/api', (req, res, next) => {
      if (req.path === '/health' || req.path.startsWith('/auth/')) {
        return next();
      }
      verifyAuthToken(req, res, next);
    });
    
    // Create and register the API router
    this.apiRouter = new ApiRouter(
      this.app,
      this.config,
      this.eventBus,
      this.dnsManager,
      this.stateManager
    );
    
    // Serve static files for the web UI if available
    const webUiDir = path.join(__dirname, '../../webui/dist');
    if (fs.existsSync(webUiDir)) {
      logger.info(`Serving Web UI from ${webUiDir}`);
      this.app.use(express.static(webUiDir));
      
      // Serve the index.html for all unmatched routes (for SPA support)
      this.app.get('*', (req, res) => {
        // Skip API routes
        if (req.url.startsWith('/api')) {
          return res.status(404).send('API endpoint not found');
        }
        
        res.sendFile(path.join(webUiDir, 'index.html'));
      });
    }
    
    // Global error handler
    this.app.use((err, req, res, next) => {
      logger.error(`API Error: ${err.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }
  
  /**
   * Set up middleware for the API server
   */
  setupMiddleware() {
    // Enable CORS
    this.app.use(cors());
    
    // Parse JSON request bodies
    this.app.use(express.json());
    
    // Log request information
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.url}`);
      next();
    });
  }
  
  /**
   * Start the API server
   * @param {number} port - Port to listen on
   */
  start(port = 3000) {
    // Check if the server is already running
    if (this.server) {
      logger.warn('API server is already running');
      return;
    }
    
    // Start the server
    this.server = this.app.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
      
      // Update state
      if (this.stateManager) {
        this.stateManager.updateState('status.apiServer', {
          running: true,
          port,
          startedAt: new Date().toISOString()
        });
      }
    });
    
    // Handle server errors
    this.server.on('error', (error) => {
      logger.error(`API server error: ${error.message}`);
      
      // Update state
      if (this.stateManager) {
        this.stateManager.updateState('status.apiServer', {
          running: false,
          error: error.message
        });
      }
    });
  }
  
  /**
   * Stop the API server
   */
  stop() {
    if (!this.server) {
      logger.warn('API server is not running');
      return;
    }
    
    // Close the server
    this.server.close(() => {
      logger.info('API server stopped');
      this.server = null;
      
      // Update state
      if (this.stateManager) {
        this.stateManager.updateState('status.apiServer', {
          running: false,
          stoppedAt: new Date().toISOString()
        });
      }
      
      // Close authentication service
      this.authService.close();
    });
  }
  
  /**
   * Get the Express app instance
   * @returns {Object} Express app
   */
  getApp() {
    return this.app;
  }
}

module.exports = ApiServer;