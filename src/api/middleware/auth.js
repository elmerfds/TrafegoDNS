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
  const path = req.path;
  const fullPath = req.baseUrl + path; // Get the complete path including base URL
  
  logger.debug(`Auth middleware for full path: ${fullPath}, path: ${path}`);
  
  // Get full authorization header for debugging
  const authHeader = req.headers.authorization;
  logger.debug(`Auth header present: ${!!authHeader}, for path: ${fullPath}`);
  
  // Handle public routes
  if (isPublicRoute(fullPath) || isPublicRoute(path)) {
    logger.debug(`Skipping auth for public route: ${fullPath}`);
    return next();
  }
  
  // Skip auth if disabled
  if (process.env.AUTH_ENABLED && process.env.AUTH_ENABLED.toLowerCase() === 'false') {
    logger.debug(`Auth disabled via env, skipping check for ${fullPath}`);
    req.user = { id: 'system', username: 'system', role: 'super_admin' };
    return next();
  }
  
  // Check for token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.debug(`Unauthorized - no/invalid token format for ${fullPath}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // Extract token
  const token = authHeader.split(' ')[1];
  logger.debug(`Token length: ${token.length} for path: ${fullPath}`);
  
  // Get auth service
  const authService = req.app.get('authService') || req.app.locals.authService;
  
  if (!authService) {
    logger.error(`Auth service not available for path: ${fullPath}`);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication service not available'
    });
  }
  
  try {
    // Very explicitly verify token
    const decoded = authService.verifyToken(token);
    if (!decoded) {
      logger.warn(`Token verification failed for path: ${fullPath}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    
    // Set user info
    req.user = decoded;
    logger.debug(`Auth successful - User: ${decoded.username}, Role: ${decoded.role}, Path: ${fullPath}`);
    
    // Continue
    return next();
  } catch (error) {
    logger.error(`Token verification error for ${fullPath}: ${error.message}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: `Token verification failed: ${error.message}`
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
    '/api/auth/oidc/callback',
    '/api/placeholder'
  ];
  
  // Check for exact matches
  if (publicRoutes.includes(path)) {
    return true;
  }
  
  // Check for path prefixes
  return publicRoutes.some(route => 
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
  // Routes that should only be accessible by super_admin
  const superAdminRoutes = [
    '/auth/users',
    '/api/auth/users',
    '/users',
    '/auth/users/create-admin',
    '/api/auth/users/create-admin'
  ];
  
  // Check for exact matches first
  if (superAdminRoutes.includes(path)) {
    return true;
  }
  
  // For more specific routes that include parameters
  return superAdminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`) ||
    // Match paths that might have query parameters
    path.split('?')[0].endsWith(route)
  );
}

/**
 * Check if a route is admin-only
 * @param {string} path - Request path
 * @returns {boolean} Whether the route is admin-only
 */
function isAdminRoute(path) {
  const adminRoutes = [
    '/auth/users',
    '/api/auth/users',
    '/users',    
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

  // Check for exact matches first
  if (adminRoutes.includes(path)) {
    return true;
  }
   
  // More flexible matching that works with path parameters
  return adminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`) ||
    // Match paths that might have query parameters
    path.split('?')[0].endsWith(route)
  );
}

module.exports = {
  verifyAuthToken,
  isPublicRoute,
  isAdminRoute,
  isSuperAdminRoute
};