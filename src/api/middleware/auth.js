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
  
  // Skip authentication check if AUTH_ENABLED is false
  if (process.env.AUTH_ENABLED === 'false') {
    logger.debug(`Authentication disabled via environment variable, skipping auth check for ${req.path}`);
    // Set a dummy admin user for the request
    req.user = { 
      id: 'system',
      username: 'system',
      role: 'super_admin' 
    };
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
  
  // Check if route requires super admin
  if (isSuperAdminRoute(req.path) && decoded.role !== 'super_admin') {
    logger.warn(`Unauthorized access attempt to super admin route ${req.path} by ${decoded.username}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Only super administrators can access this resource'
    });
  }
  
  // Check if route requires admin
  if (isAdminRoute(req.path) && !['admin', 'super_admin'].includes(decoded.role)) {
    logger.warn(`Unauthorized access attempt to admin route ${req.path} by ${decoded.username}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Administrator privileges required'
    });
  }
  
  logger.debug(`Authenticated request to ${req.path} by ${decoded.username} (${decoded.role})`);
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
 * Check if a route is super admin-only
 * @param {string} path - Request path
 * @returns {boolean} Whether the route is super admin-only
 */
function isSuperAdminRoute(path) {
  const superAdminRoutes = [
    '/auth/users'
  ];
  
  return superAdminRoutes.some(route => path.endsWith(route));
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
    '/mode/switch',
    '/records/managed',
    '/records/preserved',
    '/records/create',
    '/records/update',
    '/records/delete',
    '/records/cleanup'
  ];
  
  return adminRoutes.some(route => path.endsWith(route));
}

module.exports = {
  verifyAuthToken
};