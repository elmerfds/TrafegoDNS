// src/api/middleware/auth.js
const logger = require('../../utils/logger');

function verifyAuthToken(req, res, next) {
  const path = req.path;
  const fullPath = req.baseUrl + path;
  
  logger.debug(`Auth middleware for path: ${fullPath}`);
  
  // Handle public routes first
  if (isPublicRoute(fullPath) || isPublicRoute(path)) {
    logger.debug(`Skipping auth for public route: ${fullPath}`);
    return next();
  }
  
  // Skip auth if disabled globally via env variable
  if (process.env.AUTH_ENABLED === 'false') {
    logger.debug(`Auth disabled via env, skipping check for ${fullPath}`);
    req.user = { id: 'system', username: 'system', role: 'super_admin' };
    return next();
  }
  
  // Check for token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.debug(`Unauthorized - no/invalid token format for ${fullPath}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token is required'
    });
  }
  
  // Extract token
  const token = authHeader.split(' ')[1];
  
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
    // Verify token
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
    logger.debug(`Auth successful - User: ${decoded.username}, Role: ${decoded.role}`);
    
    // Check user role for protected routes
    if (isAdminRoute(fullPath) && !authService.isAdmin(req.user)) {
      logger.warn(`Admin access attempted by non-admin user: ${req.user.username}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Administrator privileges required'
      });
    }
    
    if (isSuperAdminRoute(fullPath) && !authService.isSuperAdmin(req.user)) {
      logger.warn(`Super admin access attempted by non-super-admin user: ${req.user.username}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Super Administrator privileges required'
      });
    }
    
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

// Helper functions to determine route types
function isPublicRoute(path) {
  const publicRoutes = [
    '/health',
    '/api/health',
    '/api/auth/login',
    '/api/auth/status',
    '/api/auth/oidc/login',
    '/api/auth/oidc/callback',
    '/api/placeholder'
  ];
  
  return publicRoutes.some(route => 
    path === route || 
    path.startsWith(`${route}/`) ||
    path.split('?')[0] === route
  );
}

function isSuperAdminRoute(path) {
  const superAdminRoutes = [
    '/auth/users',
    '/api/auth/users/create-admin'
  ];
  
  return superAdminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`)
  );
}

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
    '/auth/users',
    '/api/auth/users'     
  ];
  
  return adminRoutes.some(route => 
    path.endsWith(route) || 
    path.includes(`${route}/`)
  );
}

module.exports = {
  verifyAuthToken,
  isPublicRoute,
  isAdminRoute,
  isSuperAdminRoute
};