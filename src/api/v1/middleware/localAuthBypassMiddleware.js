/**
 * Local Authentication Bypass Middleware
 * 
 * This middleware allows API requests from localhost or local CLI to bypass authentication.
 * Used for internal CLI operations while maintaining security for external requests.
 */
const { ApiError } = require('./errorMiddleware');
const logger = require('../../../utils/logger');

/**
 * Middleware that checks if the request is local and bypasses authentication if needed
 * @param {Object} config - Configuration object with localAuthBypass settings
 */
const localAuthBypass = (config) => {
  return (req, res, next) => {
    // Skip if local auth bypass is disabled in configuration
    if (!config?.localAuthBypass?.enabled) {
      return next();
    }

    // Check if request is from localhost or local CLI
    const isLocalRequest = (
      // Check if request originated from localhost
      req.ip === '127.0.0.1' || 
      req.ip === '::1' ||
      req.ip === 'localhost' ||
      // Check for CLI client identifier header 
      req.headers['x-trafego-cli'] === config.localAuthBypass.cliToken ||
      // Check for internal bypass token
      req.headers['x-trafego-internal'] === config.localAuthBypass.internalToken
    );

    if (isLocalRequest) {
      // Bypass authentication by setting a privileged user
      req.user = {
        id: 'local-cli',
        username: 'local-cli',
        role: 'admin' // Always grant admin privileges to local CLI
      };
      
      // Add a header to indicate this request bypassed auth
      res.setHeader('X-Auth-Bypassed', 'true');
      
      // Log the access with a debug level (only when debugging)
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Local CLI access: ${req.method} ${req.originalUrl}`);
      }
    }

    next();
  };
};

module.exports = localAuthBypass;