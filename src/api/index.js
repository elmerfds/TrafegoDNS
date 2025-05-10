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
const swaggerJsDoc = require('swagger-jsdoc');
const logger = require('../utils/logger');
const { errorHandler } = require('./v1/middleware/errorMiddleware');
const { globalLimiter } = require('./v1/middleware/rateLimitMiddleware');
const configureCors = require('./v1/middleware/corsMiddleware');
const SocketServer = require('./socketServer');

// Import routes
const v1Routes = require('./v1/routes');

// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
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

if (enableSwagger) {
  try {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'TrafegoDNS API',
          version: '1.0.0',
          description: 'API for managing DNS records via TrafegoDNS',
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          },
          contact: {
            name: 'API Support',
            url: 'https://github.com/elmerfds/TrafegoDNS'
          }
        },
        servers: [
          {
            url: '/api/v1',
            description: 'API v1'
          }
        ]
      },
      // Use absolute path to avoid issues in different environments
      apis: [__dirname + '/v1/routes/*.js']
    };

    const swaggerDocs = swaggerJsDoc(swaggerOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
    logger.info('API documentation available at /api-docs');
  } catch (error) {
    logger.warn(`Failed to initialize Swagger documentation: ${error.message}`);
    logger.debug(error.stack);

    // Add a placeholder endpoint that explains swagger is disabled
    app.get('/api-docs', (req, res) => {
      res.send('API documentation is currently unavailable. Enable it by setting ENABLE_SWAGGER=true');
    });
  }
} else {
  logger.info('API documentation disabled. Enable it by setting ENABLE_SWAGGER=true');

  // Add a placeholder endpoint that explains swagger is disabled
  app.get('/api-docs', (req, res) => {
    res.send('API documentation is disabled. Enable it by setting ENABLE_SWAGGER=true');
  });
}

// API Routes
app.use('/api/v1', v1Routes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
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