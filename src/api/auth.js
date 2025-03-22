/**
 * src/api/auth.js
 * Authentication middleware for the API
 */
const logger = require('../utils/logger');

/**
 * Validate API key from request headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const configApiKey = process.env.API_KEY;
  
  // Skip validation if API key is not configured
  if (!configApiKey) {
    logger.debug('API authentication is disabled (no API_KEY set)');
    return next();
  }
  
  // Check if API key is present and matches
  if (!apiKey) {
    logger.warn(`API request rejected: Missing API key from ${req.ip}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required'
    });
  }
  
  if (apiKey !== configApiKey) {
    logger.warn(`API request rejected: Invalid API key from ${req.ip}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }
  
  // API key is valid
  logger.debug(`API request authenticated from ${req.ip}`);
  next();
}

module.exports = {
  validateApiKey
};