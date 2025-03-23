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
const createAuthRouter = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const { verifyAuthToken } = require('./middleware/auth');
const placeholderImageMiddleware = require('./middleware/placeholderImage');

class ApiRouter {
  constructor(app, config, eventBus, dnsManager, stateManager, authService) {
    this.app = app;
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    this.stateManager = stateManager;
    this.authService = authService;
    this.router = express.Router();
    
    // Make services available globally
    this.app.locals.authService = this.authService;
    this.app.locals.dnsManager = this.dnsManager;
    
    // Set up middleware
    this.setupMiddleware();
    
    // Register routes
    this.registerRoutes();
    
    // Register the router with the app
    app.use('/api', this.router);
    
    logger.info('API Router initialized');
  }
  
  /**
   * Set up middleware for the API
   */
  setupMiddleware() {
    // Add placeholder image middleware (no auth needed)
    this.router.use('/placeholder', placeholderImageMiddleware);

    // Add API version header to all responses
    this.router.use((req, res, next) => {
      res.setHeader('X-TrafegoDNS-Version', this.config.version);
      next();
    });
    
    // JSON body parser
    this.router.use(express.json());
    
    // API key authentication if enabled
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
    // Register health check endpoint (no auth)
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Register auth routes without JWT verification
    this.router.use('/auth', createAuthRouter(this.authService, this.config));
    
    // Profile routes (authenticated)
    this.router.use('/profile', verifyAuthToken, profileRoutes());
    
    // Other authenticated routes
    const protectedRoutes = [
      { path: '/providers', handler: providerRoutes(this.stateManager, this.config) },
      { path: '/dns', handler: dnsRoutes(this.dnsManager, this.stateManager) },
      { path: '/records', handler: recordsRoutes(this.dnsManager, this.stateManager) },
      { path: '/settings', handler: settingsRoutes(this.config, this.stateManager) },
      { path: '/status', handler: statusRoutes(this.dnsManager, this.stateManager) },
      { path: '/mode', handler: modeRoutes(this.stateManager, this.config) }
    ];
    
    // Register protected routes with authentication
    protectedRoutes.forEach(route => {
      this.router.use(route.path, verifyAuthToken, route.handler);
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
}

module.exports = ApiRouter;