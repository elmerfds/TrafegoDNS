/**
 * src/api/middleware/auth.js
 * Authentication middleware for API routes
 */
const logger = require('../../utils/logger');

/**
 * Verify JWT token from request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function verifyAuthToken(req, res, next) {
  // Skip authentication for auth routes and public routes
  if (req.path.startsWith('/auth') || isPublicRoute(req.path)) {
    return next();
  }
  
  // Get token from headers
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.debug(`Unauthorized access attempt to ${req.path} (no token)`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // Extract token
  const token = authHeader.split(' ')[1];
  
  // Get auth service from app
  const authService = req.app.get('authService');
  
  if (!authService) {
    logger.error('Auth service not available in middleware');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service not available'
    });
  }
  
  // Verify token
  const decoded = authService.verifyToken(token);
  
  if (!decoded) {
    logger.debug(`Unauthorized access attempt to ${req.path} (invalid token)`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
  
  // Set user in request
  req.user = decoded;
  
  // Check role for admin-only routes
  if (isAdminRoute(req.path) && decoded.role !== 'admin') {
    logger.warn(`Unauthorized access attempt to admin route ${req.path} by ${decoded.username}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Insufficient permissions'
    });
  }
  
  logger.debug(`Authenticated request to ${req.path} by ${decoded.username}`);
  next();
}

/**
 * Check if a route is public (doesn't require authentication)
 * @param {string} path - Request path
 * @returns {boolean} Whether the route is public
 */
function isPublicRoute(path) {
  const publicRoutes = [
    '/health',
    '/api/health',
    '/docs',
    '/api/docs'
  ];
  
  return publicRoutes.some(route => path === route || path.startsWith(`${route}/`));
}

/**
 * Check if a route is admin-only
 * @param {string} path - Request path
 * @returns {boolean} Whether the route is admin-only
 */
function isAdminRoute(path) {
  const adminRoutes = [
    '/providers/switch',
    '/settings/reset',
    '/mode/switch'
  ];
  
  return adminRoutes.some(route => path.endsWith(route));
}

module.exports = {
  verifyAuthToken
};