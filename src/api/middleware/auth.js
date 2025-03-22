// src/api/middleware/auth.js
// Authentication middleware for API routes

const logger = require('../../utils/logger');

/**
 * Verify JWT token from request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function verifyAuthToken(req, res, next) {
  const path = req.path;
  
  // More detailed logging to help with debugging
  logger.debug(`Auth middleware processing request for path: ${path}`);
  
  // Skip authentication for auth routes and public routes
  if (path.includes('/auth/') || isPublicRoute(path)) {
    logger.debug(`Skipping auth check for public route: ${path}`);
    return next();
  }
  
  // Skip authentication check if AUTH_ENABLED is false
  if (process.env.AUTH_ENABLED && process.env.AUTH_ENABLED.toLowerCase() === 'false') {
    logger.debug(`Authentication disabled via environment variable, skipping auth check for ${path}`);
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
    logger.debug(`Unauthorized access attempt to ${path} (no token or invalid token format)`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // Extract token
  const token = authHeader.split(' ')[1];
  logger.debug(`Token received for ${path} (length: ${token.length})`);
  
  // Get auth service from app
  const authService = req.app.get('authService');
  
  if (!authService) {
    logger.error('Auth service not available in middleware');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service not available'
    });
  }
  
  try {
    // Verify token
    const decoded = authService.verifyToken(token);
    
    if (!decoded) {
      logger.debug(`Token verification failed for ${path} (null result)`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    
    // Log successful token verification
    logger.debug(`Token verified successfully for user: ${decoded.username} (${decoded.role})`);
    
    // Set user in request
    req.user = decoded;
    
    // Check if route requires super admin
    if (isSuperAdminRoute(path) && decoded.role !== 'super_admin') {
      logger.warn(`Unauthorized access attempt to super admin route ${path} by ${decoded.username}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only super administrators can access this resource'
      });
    }
    
    // Check if route requires admin
    if (isAdminRoute(path) && !['admin', 'super_admin'].includes(decoded.role)) {
      logger.warn(`Unauthorized access attempt to admin route ${path} by ${decoded.username}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Administrator privileges required'
      });
    }
    
    logger.debug(`Authenticated request to ${path} by ${decoded.username} (${decoded.role})`);
    next();
  } catch (error) {
    // Handle any exceptions during token verification
    logger.error(`Token verification error for ${path}: ${error.message}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed'
    });
  }
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
    '/api/docs',
    '/api/auth/login',
    '/api/auth/status',
    '/api/auth/oidc/login',
    '/api/auth/oidc/callback'
  ];
  
  return publicRoutes.some(route => 
    path === route || 
    path.startsWith(`${route}/`) ||
    // More flexible matching for query parameters
    path.split('?')[0] === route
  );
}

/**
 * Check if a route is super admin-only
 * @param {string} path - Request path
 * @returns {boolean} Whether the route is super admin-only
 */
function isSuperAdminRoute(path) {
  const superAdminRoutes = [
    '/auth/users',
    '/api/auth/users'
  ];
  
  // More flexible matching that works with base path
  return superAdminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`)
  );
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
    '/records/cleanup',
    '/api/providers/switch',
    '/api/settings/reset',
    '/api/mode/switch',
    '/api/records/managed',
    '/api/records/preserved',
    '/api/records/create',
    '/api/records/update',
    '/api/records/delete',
    '/api/records/cleanup'
  ];
  
  // More flexible matching that works with path parameters
  return adminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`) ||
    // Match paths that might have query parameters
    path.split('?')[0].endsWith(route)
  );
}

module.exports = {
  verifyAuthToken
};