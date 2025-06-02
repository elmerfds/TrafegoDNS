/**
 * TrafegoDNS API Server
 * Main entry point for the API
 */
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const logger = require('../utils/logger');
const { errorHandler } = require('./v1/middleware/errorMiddleware');
const { globalLimiter } = require('./v1/middleware/rateLimitMiddleware');
const configureCors = require('./v1/middleware/corsMiddleware');
const SocketServer = require('./socketServer');

// Import routes
const v1Routes = require('./v1/routes');

// Import User model for initialization
const User = require('./v1/models/User');

// Import OIDC service for initialization
const oidcService = require('./v1/services/oidcService');

// Create Express app
const app = express();

const path = require('path');
const fs = require('fs');

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

// Disable all security headers temporarily to debug
app.use((req, res, next) => {
  // Log what's being requested
  if (req.path === '/' || req.path.endsWith('.html')) {
    logger.info(`Serving HTML request: ${req.path} from ${webUIPath || 'no UI path'}`);
  }
  next();
})
app.use(configureCors()); // CORS handling with configuration
app.use(express.json()); // Parse JSON request body
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded request body
app.use(cookieParser()); // Parse cookies
app.use(morgan('dev')); // HTTP request logging
app.use(globalLimiter); // Apply rate limiting to all routes

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

// API Routes
app.use('/api/v1', v1Routes);

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

/**
 * Start the API server
 * @param {number} port - Port to listen on
 * @param {Object} config - Configuration object
 * @param {Object} eventBus - Event bus for real-time events
 * @param {Function} callback - Callback function to run after server starts
 * @returns {Object} - Server instance
 */
async function startApiServer(port, config, eventBus, callback) {
  const apiPort = port || process.env.API_PORT || 3000;

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

    if (typeof callback === 'function') {
      callback(server, socketServer);
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