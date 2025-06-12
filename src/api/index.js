/**
 * TrafegoDNS API Server
 * Main entry point for the API
 */
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const logger = require('../utils/logger');
const { errorHandler } = require('./v1/middleware/errorMiddleware');
const { 
  globalLimiter, 
  createUserAwareRateLimiter,
  createBurstProtectionMiddleware,
  createIPBlockingMiddleware
} = require('./v1/middleware/rateLimitMiddleware');
const configureCors = require('./v1/middleware/corsMiddleware');
const {
  createSecurityHeadersMiddleware,
  createHttpsEnforcementMiddleware,
  createApiSecurityMiddleware
} = require('./v1/middleware/securityHeadersMiddleware');
const {
  createAuthAuditMiddleware,
  createPermissionAuditMiddleware,
  createDataAccessAuditMiddleware,
  createRateLimitAuditMiddleware,
  createInputValidationAuditMiddleware,
  createPortAuditMiddleware
} = require('./v1/middleware/auditLogMiddleware');
const { clearBlockedIP } = require('./v1/middleware/rateLimitMiddleware');
const SocketServer = require('./socketServer');

// Import routes - will be set up in startApiServer
let v1Routes = null;

// Import User model for initialization
const User = require('./v1/models/User');

// Import OIDC service for initialization
const oidcService = require('./v1/services/oidcService');

// Create Express app
const app = express();

// Determine the web UI path
const webDistPath = path.join(__dirname, '../web/dist');
const publicPath = path.join(__dirname, 'public');

// Check if web UI exists (look for assets directory to confirm it's the built app)
let webUIPath = null;
if (fs.existsSync(publicPath) && fs.existsSync(path.join(publicPath, 'assets'))) {
  // Built React app found in public directory
  webUIPath = publicPath;
  logger.info(`Built web UI found at: ${publicPath}`);
} else if (fs.existsSync(webDistPath) && fs.existsSync(path.join(webDistPath, 'index.html'))) {
  webUIPath = webDistPath;
  logger.info(`Web UI found at: ${webDistPath}`);
} else if (fs.existsSync(publicPath)) {
  // Public directory exists but no built app - probably just placeholder
  logger.info(`Public directory exists at ${publicPath} but no built assets found`);
} else {
  logger.warn('Web UI build not found. Web interface will not be available.');
}

// Security middleware setup
app.set('trust proxy', 1); // Trust first proxy

// HTTPS enforcement (production only)
app.use(createHttpsEnforcementMiddleware({
  enabled: process.env.NODE_ENV === 'production',
  excludePaths: ['/api/health', '/api/metrics']
}));

// IP blocking and burst protection with configurable allowedIPs
const allowedIPs = (process.env.ALLOWED_IPS || '').split(',').map(ip => ip.trim()).filter(ip => ip);

logger.info(`Rate limiting configured with ${allowedIPs.length > 0 ? `allowed IPs: ${allowedIPs.join(', ')} and` : ''} universal local network detection`);

// Clear any blocked localhost IPs on startup (though they should be auto-bypassed)
try {
  const { getRateLimitStatus } = require('./v1/middleware/rateLimitMiddleware');
  const status = getRateLimitStatus();
  if (status.blockedIPs.length > 0) {
    logger.info(`Clearing ${status.blockedIPs.length} blocked IPs on startup (local networks will be auto-bypassed)`);
    // Don't clear specific IPs, let the universal detection handle bypassing
  }
} catch (error) {
  logger.warn(`Failed to check blocked IPs on startup: ${error.message}`);
}

app.use(createIPBlockingMiddleware({
  allowedIPs: allowedIPs, // Only explicit allowed IPs, local networks auto-bypassed
  suspiciousThreshold: parseInt(process.env.RATE_LIMIT_SUSPICIOUS_THRESHOLD) || 10,
  blockDuration: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION) || (24 * 60 * 60 * 1000)
}));
app.use(createBurstProtectionMiddleware({
  windowMs: parseInt(process.env.RATE_LIMIT_BURST_WINDOW) || 1000,
  maxBurst: parseInt(process.env.RATE_LIMIT_BURST_MAX) || 25,
  blockDuration: parseInt(process.env.RATE_LIMIT_BURST_BLOCK_DURATION) || 60000,
  allowedIPs: allowedIPs // Only explicit allowed IPs, local networks auto-bypassed
}));

// Security headers
app.use(createSecurityHeadersMiddleware({
  contentSecurityPolicy: {
    enabled: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://unpkg.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    enabled: process.env.NODE_ENV === 'production',
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS handling with configuration
app.use(configureCors());

// API-specific security
app.use('/api/', createApiSecurityMiddleware({
  noCache: true,
  validateContentType: true
}));

// Request parsing middleware
app.use(express.json({ limit: '1mb' })); // Parse JSON with size limit
app.use(express.urlencoded({ extended: false, limit: '1mb' })); // Parse URL-encoded with size limit
app.use(cookieParser()); // Parse cookies

// HTTP access logging - only in DEBUG mode to reduce log verbosity
if (logger.level >= 3) { // DEBUG level (3) or higher
  app.use(morgan('combined', {
    stream: { write: message => logger.debug(message.trim()) }
  }));
} else {
  // In non-debug mode, only log errors and important requests
  app.use(morgan('combined', {
    stream: { write: message => logger.debug(message.trim()) },
    skip: (req, res) => {
      // Skip logging for routine dashboard requests
      const routineRoutes = [
        '/api/v1/system/pause-status',
        '/api/v1/config/providers/status',
        '/api/v1/dashboard/layouts',
        '/api/health'
      ];
      
      const isRoutine = routineRoutes.some(route => req.originalUrl.includes(route));
      const isSuccess = res.statusCode < 400;
      
      // Only log errors or non-routine requests
      return isRoutine && isSuccess;
    }
  }));
}

// Audit logging middleware
app.use(createRateLimitAuditMiddleware());
app.use(createInputValidationAuditMiddleware());

// Rate limiting with user awareness and configurable limits
app.use(createUserAwareRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || (60 * 1000),
  anonymousMax: parseInt(process.env.RATE_LIMIT_ANONYMOUS_MAX) || 100,
  authenticatedMax: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_MAX) || 300,
  premiumMax: parseInt(process.env.RATE_LIMIT_PREMIUM_MAX) || 500,
  bypassRoles: ['admin'],
  allowedIPs: allowedIPs // Only explicit allowed IPs, local networks auto-bypassed
}));

// Debug logging for UI requests
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    logger.debug(`Serving HTML request: ${req.path} from ${webUIPath || 'no UI path'}`);
  }
  next();
});

// Import environment loader
const EnvironmentLoader = require('../config/EnvironmentLoader');

// API documentation setup - only in development mode or if explicitly enabled
const enableSwagger = EnvironmentLoader.isEnabled('ENABLE_SWAGGER') || 
                     process.env.NODE_ENV === 'development';

logger.info(`Swagger API documentation ${enableSwagger ? 'enabled' : 'disabled'} (ENABLE_SWAGGER=${process.env.ENABLE_SWAGGER})`);

// Always serve the Swagger JSON at a specific endpoint regardless of enableSwagger setting
const swaggerDocument = require('./swaggerDefinition');
app.get('/api/v1/swagger.json', (req, res) => {
  res.json(swaggerDocument);
});

// Instead of using swagger-ui-express directly, just redirect to our custom implementation
// This avoids any issues with HTTPS requirements and CSP
app.get('/api-docs', (req, res) => {
  res.redirect('/swagger.html');
});

logger.info('API documentation available at /swagger.html (using CDN-based Swagger UI)');
logger.info('API specification available at /api/v1/swagger.json');

// Serve static files from web UI directory if available
if (webUIPath) {
  logger.info(`Serving static files from: ${webUIPath}`);
  app.use(express.static(webUIPath));
}

// API Routes - will be set up in startApiServer

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

// Documentation routes - clean and simple redirects
app.get('/docs', (req, res) => {
  res.redirect('/docs.html');
});

// For backward compatibility, redirect any old routes to the new ones
app.get('/docs/swagger', (req, res) => {
  res.redirect('/swagger.html');
});

// Note: 404 handlers and catch-all routes will be set up after API routes are mounted

/**
 * Start the API server
 * @param {number} port - Port to listen on
 * @param {Object} config - Configuration object
 * @param {Object} eventBus - Event bus for real-time events
 * @param {Object} additionalRoutes - Additional Express routes to mount at /api/v1
 * @returns {Object} - Server instance
 */
async function startApiServer(port, config, eventBus, additionalRoutes = null) {
  const apiPort = port || process.env.API_PORT || 3000;

  // Set up routes - use additionalRoutes if provided, otherwise use default
  if (additionalRoutes) {
    v1Routes = additionalRoutes;
  } else {
    // Use default routes if no additional routes provided
    const createRoutes = require('./v1/routes');
    v1Routes = createRoutes();
  }
  
  // Mount audit logging middleware for specific API routes
  app.use('/api/v1/auth', createAuthAuditMiddleware());
  app.use('/api/v1', createPermissionAuditMiddleware());
  app.use('/api/v1', createDataAccessAuditMiddleware());
  app.use('/api/v1/ports', createPortAuditMiddleware());
  
  // Mount API routes AFTER audit middleware
  app.use('/api/v1', v1Routes);
  
  // 404 Handler for API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      status: 'error',
      code: 'ENDPOINT_NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Catch all routes - serve index.html for SPA
  app.get('*', (req, res) => {
    const indexPath = path.join(webUIPath || publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Web UI not found');
    }
  });

  // Error handling middleware
  app.use(errorHandler);

  // Initialize User model now that database should be ready
  logger.info('Initializing User model...');
  try {
    // Check if User model has the method
    if (User && typeof User.ensureInitialized === 'function') {
      await User.ensureInitialized();
      logger.info('User model initialized successfully');
    } else {
      logger.warn('User model does not have ensureInitialized method, checking structure...');
      logger.debug(`User model type: ${typeof User}`);
      logger.debug(`User model keys: ${User ? Object.keys(User).join(', ') : 'null'}`);
      
      // Try to initialize directly if needed
      if (User && typeof User.init === 'function') {
        logger.info('Using init method instead');
        User.init();
      }
    }
  } catch (error) {
    logger.error(`Failed to initialize User model: ${error.message}`);
    // Continue anyway - the model will retry
  }

  // Initialize OIDC service if configured
  if (config && config.oidcEnabled) {
    logger.info('Initializing OIDC service...');
    try {
      const oidcConfig = {
        issuerUrl: config.oidcIssuerUrl,
        clientId: config.oidcClientId,
        clientSecret: config.oidcClientSecret,
        redirectUri: config.oidcRedirectUri
      };
      
      const initialized = await oidcService.initialize(oidcConfig);
      if (initialized) {
        logger.info('OIDC service initialized successfully');
      } else {
        logger.warn('OIDC service initialization failed - OIDC login will be unavailable');
      }
    } catch (error) {
      logger.error(`Failed to initialize OIDC service: ${error.message}`);
    }
  } else {
    logger.debug('OIDC not enabled in configuration');
  }

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO server if eventBus is provided
  let socketServer;
  if (eventBus) {
    socketServer = new SocketServer(server, eventBus, config);
    logger.info('WebSocket server initialized for real-time updates');
    
    // Connect logger to socket server for log streaming
    if (logger.setSocketServer) {
      logger.setSocketServer(socketServer);
      logger.info('Logger connected to WebSocket server for real-time log streaming');
    }
  }

  // Start the server
  server.listen(apiPort, () => {
    logger.info(`🚀 TrafegoDNS API server started on port ${apiPort}`);
    logger.info(`📚 API documentation available at http://localhost:${apiPort}/api-docs`);

    if (socketServer) {
      logger.info(`🔌 WebSocket server running for real-time updates`);
    }

  });

  // Handle server errors
  server.on('error', (error) => {
    logger.error(`API server error: ${error.message}`);

    // Additional handling for specific errors
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${apiPort} is already in use. Please choose a different port.`);
    }
  });

  return { server, app, socketServer };
}

module.exports = { startApiServer, app };