/**
 * TrafegoDNS API Server
 * Main entry point for the API
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');
const logger = require('../utils/logger');
const { errorHandler } = require('./v1/middleware/errorMiddleware');

// Import routes
const v1Routes = require('./v1/routes');

// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json()); // Parse JSON request body
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded request body
app.use(cookieParser()); // Parse cookies
app.use(morgan('dev')); // HTTP request logging

// API documentation setup
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
  apis: ['./src/api/v1/routes/*.js'] // Path to the API docs
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

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
 * @param {Function} callback - Callback function to run after server starts
 * @returns {Object} - Express app instance
 */
function startApiServer(port, callback) {
  const apiPort = port || process.env.API_PORT || 3000;
  
  // Start the server
  const server = app.listen(apiPort, () => {
    logger.info(`🚀 TrafegoDNS API server started on port ${apiPort}`);
    
    if (typeof callback === 'function') {
      callback(server);
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
  
  return app;
}

module.exports = { startApiServer, app };