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

// Create Express app
const app = express();

const path = require('path');
const fs = require('fs');

// Determine the web UI path
const webDistPath = path.join(__dirname, '../web/dist');
const webUiBuildPath = path.join(__dirname, '../../dist'); // Alternative build location
const publicPath = path.join(__dirname, 'public');

let webUIPath = null;
if (fs.existsSync(webDistPath)) {
  webUIPath = webDistPath;
  logger.info(`Web UI found at: ${webDistPath}`);
} else if (fs.existsSync(webUiBuildPath)) {
  webUIPath = webUiBuildPath;
  logger.info(`Web UI found at: ${webUiBuildPath}`);
} else {
  logger.warn('Web UI build not found. Web interface will not be available.');
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  // Disable HTTPS requirement for development environments
  strictTransportSecurity: false,
  // Disable cross-origin policies that might interfere with HTTP access
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  originAgentCluster: false
})); // Security headers with CSP configured for SPA
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

// Serve static files from public directory (for API docs)
app.use('/swagger.html', express.static(publicPath));
app.use('/docs.html', express.static(publicPath));

// Serve static assets if web UI is available
if (webUIPath) {
  // Serve static files (JS, CSS, images) with proper headers
  app.use('/assets', express.static(path.join(webUIPath, 'assets'), {
    maxAge: '1d',
    etag: true
  }));
  
  // Serve other static files (favicon, etc.)
  app.use(express.static(webUIPath, {
    index: false // Don't serve index.html for directory requests
  }));
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

// Serve the web UI for all other routes (SPA support)
app.get('*', (req, res) => {
  if (webUIPath) {
    const indexPath = path.join(webUIPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('index.html not found in web UI build directory.');
    }
  } else {
    // Fallback to placeholder if no build found
    const publicIndexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(publicIndexPath)) {
      res.sendFile(publicIndexPath);
    } else {
      res.status(404).send('Web UI not found. Please build the web UI first.');
    }
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