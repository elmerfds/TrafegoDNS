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
const { verifyAuthToken } = require('./middleware/auth');

class ApiRouter {
  constructor(app, config, eventBus, dnsManager, stateManager, authService) {
    this.app = app;
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.stateManager = stateManager;
    this.authService = authService;
    this.router = express.Router();
    
    // Make authService available to the app
    this.app.locals.authService = this.authService;
    
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
  }
  
  /**
   * Register all API routes
   */
  registerRoutes() {
    // Register health check endpoint
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Public auth routes that don't need authentication
    this.router.post('/auth/login', authRoutes(this.authService, this.config));
    this.router.get('/auth/status', authRoutes(this.authService, this.config));
    this.router.get('/auth/oidc/login', authRoutes(this.authService, this.config));
    this.router.get('/auth/oidc/callback', authRoutes(this.authService, this.config));
    
    // Profile routes and authenticated routes
    this.router.use('/profile', verifyAuthToken, profileRoutes());
    this.router.use('/providers', verifyAuthToken, providerRoutes(this.stateManager, this.config));
    this.router.use('/dns', verifyAuthToken, dnsRoutes(this.dnsManager, this.stateManager));
    this.router.use('/records', verifyAuthToken, recordsRoutes(this.dnsManager, this.stateManager));
    this.router.use('/settings', verifyAuthToken, settingsRoutes(this.config, this.stateManager));
    this.router.use('/status', verifyAuthToken, statusRoutes(this.dnsManager, this.stateManager));
    this.router.use('/mode', verifyAuthToken, modeRoutes(this.stateManager, this.config));
    
    // Protected auth routes (users, profiles, etc.) that need authentication
    this.router.use('/auth/users', verifyAuthToken, authRoutes(this.authService, this.config));
    this.router.get('/auth/profile', verifyAuthToken, authRoutes(this.authService, this.config));
    
    // Catch-all error handler - should be last
    this.router.use((err, req, res, next) => {
      logger.error(`API Error: ${err.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }
}

module.exports = ApiRouter;