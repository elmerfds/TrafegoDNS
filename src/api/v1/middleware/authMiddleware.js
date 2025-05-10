/**
 * Authentication middleware for the API
 */
const { ApiError } = require('./errorMiddleware');
const logger = require('../../../utils/logger');
const User = require('../models/User');
const jwtService = require('../services/jwtService');

/**
 * Middleware to authenticate JWT token
 */
const authenticate = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new ApiError('No token provided', 401, 'AUTHENTICATION_REQUIRED'));
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token
    const decoded = jwtService.verifyAccessToken(token);
    
    if (!decoded) {
      return next(new ApiError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    
    // Attach user to request
    req.user = decoded;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    
    return next(new ApiError('Invalid token', 401, 'INVALID_TOKEN'));
  }
};

/**
 * Middleware to authorize by role
 * @param {Array|string} roles - Roles allowed to access the resource
 */
const authorize = (roles = []) => {
  // Convert string to array
  if (typeof roles === 'string') {
    roles = [roles];
  }
  
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Unauthorized', 401, 'AUTHENTICATION_REQUIRED'));
    }
    
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      logger.warn(`Authorization failed for user ${req.user.username} (${req.user.role}). Required roles: ${roles.join(', ')}`);
      return next(new ApiError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS'));
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  authorize
};