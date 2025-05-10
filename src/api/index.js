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

// Create Express app
const app = express();

// Serve static files from the 'public' directory
app.use(express.static(__dirname + '/public'));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"]
    }
  },
  // Disable HTTPS requirement for development environments
  strictTransportSecurity: false,
  // Don't set origin policies for API - allows HTTP and different origins
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginEmbedderPolicy: false,
  originAgentCluster: false
})); // Security headers with CSP configured for documentation
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
function startApiServer(port, config, eventBus, callback) {
  const apiPort = port || process.env.API_PORT || 3000;

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO server if eventBus is provided
  let socketServer;
  if (eventBus) {
    socketServer = new SocketServer(server, eventBus, config);
    logger.info('WebSocket server initialized for real-time updates');
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