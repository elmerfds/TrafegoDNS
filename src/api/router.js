/**
 * src/api/router.js
 * API Router for TráfegoDNS
 * Handles all API routes and operations
 */
const express = require('express');
const logger = require('../utils/logger');
const { validateApiKey } = require('./auth');
const providerRoutes = require('./routes/providers');
const dnsRoutes = require('./routes/dns');
const recordsRoutes = require('./routes/records');
const settingsRoutes = require('./routes/settings');
const statusRoutes = require('./routes/status');
const modeRoutes = require('./routes/mode');
const placeholderImageMiddleware = require('./middleware/placeholderImage');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');

class ApiRouter {
  constructor(app, config, eventBus, dnsManager, stateManager) {
    this.app = app;
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.stateManager = stateManager;
    this.router = express.Router();
    
    // Set up middleware
    this.setupMiddleware();
    
    // Register routes
    this.registerRoutes();
    
    // Register the router with the app
    app.use('/api', this.router);
    
    logger.info('API Router initialised');
  }
  
  /**
   * Set up middleware for the API
   */
  setupMiddleware() {
    // Add placeholder image middleware before API auth
    this.router.use('/placeholder', placeholderImageMiddleware);

    // Add API version header to all responses
    this.router.use((req, res, next) => {
      res.setHeader('X-TrafegoDNS-Version', this.config.version);
      next();
    });
    
    // JSON body parser
    this.router.use(express.json());
    
    // API key authentication
    if (this.config.apiAuthEnabled) {
      this.router.use(validateApiKey);
    }
    
    // Log all API requests
    this.router.use((req, res, next) => {
      logger.debug(`API Request: ${req.method} ${req.originalUrl}`);
      next();
    });
    
    // Catch-all error handler
    this.router.use((err, req, res, next) => {
      logger.error(`API Error: ${err.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }
  
  /**
   * Register all API routes
   */
  registerRoutes() {
    // Register health check endpoint
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Register API route groups
    this.router.use('/providers', providerRoutes(this.stateManager, this.config));
    this.router.use('/dns', dnsRoutes(this.dnsManager, this.stateManager));
    this.router.use('/records', recordsRoutes(this.dnsManager, this.stateManager));
    this.router.use('/settings', settingsRoutes(this.config, this.stateManager));
    this.router.use('/status', statusRoutes(this.dnsManager, this.stateManager));
    this.router.use('/mode', modeRoutes(this.stateManager, this.config));
    this.router.use('/profile', profileRoutes());
    
    // Apply authentication middleware to all auth routes except the ones specified in isPublicRoute
    this.router.use('/auth', (req, res, next) => {
      // Skip middleware for login and OIDC-related endpoints
      if (req.path === '/login' || 
          req.path === '/status' || 
          req.path === '/oidc/login' || 
          req.path === '/oidc/callback') {
        return next();
      }
      
      // For all other auth routes, apply the auth middleware
      const { verifyAuthToken } = require('./middleware/auth');
      verifyAuthToken(req, res, next);
    });
    
    // After middleware setup, register auth routes
    this.router.use('/auth', authRoutes(this.authService, this.config));
  }
}

module.exports = ApiRouter;