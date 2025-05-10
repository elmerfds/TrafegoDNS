/**
 * CORS Middleware
 * Handles Cross-Origin Resource Sharing configuration
 */
const cors = require('cors');
const logger = require('../../../utils/logger');

/**
 * Create a configurable CORS middleware
 * @param {Object} config - Application configuration
 * @returns {Function} Express middleware
 */
const configureCors = (config) => {
  // Get CORS configuration from environment or config
  const corsOptions = {
    // Allow specified origins or default to accept any origin when in development
    origin: process.env.CORS_ALLOWED_ORIGINS 
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : config?.corsAllowedOrigins || '*',
    
    // Allow credentials (cookies, authorization headers)
    credentials: process.env.CORS_ALLOW_CREDENTIALS === 'true' 
      || config?.corsAllowCredentials || true,
    
    // Set max age for preflight requests
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400'), // 24 hours by default
    
    // Allowed methods
    methods: process.env.CORS_ALLOWED_METHODS 
      ? process.env.CORS_ALLOWED_METHODS.split(',')
      : config?.corsAllowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    
    // Allowed headers
    allowedHeaders: process.env.CORS_ALLOWED_HEADERS 
      ? process.env.CORS_ALLOWED_HEADERS.split(',')
      : config?.corsAllowedHeaders || ['Content-Type', 'Authorization']
  };
  
  // Log CORS configuration
  logger.debug(`Configuring CORS with options: ${JSON.stringify(corsOptions)}`);
  
  return cors(corsOptions);
};

module.exports = configureCors;