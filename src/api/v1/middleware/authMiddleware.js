/**
 * Authentication middleware for the API
 */
const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorMiddleware');
const logger = require('../../../utils/logger');

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'trafegodns-jwt-secret';
// Token expiration
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

/**
 * In-memory user store (will be replaced with proper storage in production)
 * This is just for initial implementation and testing
 */
let users = [
  {
    id: '1',
    username: 'admin',
    // Default password: admin123
    passwordHash: '$2a$10$mR3TyEQwA.bCpkTz8YGsIuRgIWPXxZH7KtNE9TCMxDxU52aw9hq.O',
    role: 'admin',
    createdAt: new Date(),
    lastLogin: null
  }
];

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
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach user to request
    req.user = decoded;
    
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
 * @param {Array} roles - Array of roles allowed to access the resource
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Unauthorized', 401, 'AUTHENTICATION_REQUIRED'));
    }
    
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new ApiError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS'));
    }
    
    next();
  };
};

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
const generateTokens = (user) => {
  // Create payload for token (don't include sensitive data)
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role
  };
  
  // Generate access token
  const accessToken = jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  
  // Generate refresh token with longer expiry
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  
  return {
    accessToken,
    refreshToken
  };
};

/**
 * Find user by ID
 * @param {string} id - User ID
 * @returns {Object|null} - User object or null if not found
 */
const findUserById = (id) => {
  return users.find(user => user.id === id) || null;
};

/**
 * Find user by username
 * @param {string} username - Username to find
 * @returns {Object|null} - User object or null if not found
 */
const findUserByUsername = (username) => {
  return users.find(user => user.username === username) || null;
};

/**
 * Update user
 * @param {Object} userData - User data to update
 * @returns {Object} - Updated user object
 */
const updateUser = (userData) => {
  const index = users.findIndex(u => u.id === userData.id);
  
  if (index === -1) {
    throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  // Update user
  users[index] = {
    ...users[index],
    ...userData,
    updatedAt: new Date()
  };
  
  return users[index];
};

module.exports = {
  authenticate,
  authorize,
  generateTokens,
  findUserById,
  findUserByUsername,
  updateUser,
  users
};