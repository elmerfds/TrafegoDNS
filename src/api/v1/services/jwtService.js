/**
 * JWT Service
 * Handles JWT token generation and verification
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../../../utils/logger');
const User = require('../models/User');

// Get JWT secrets from environment or generate secure ones
// Support both specific secrets and fallback to JWT_SECRET
let ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
let REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

// If secrets are not provided in env vars, generate secure ones and warn
if (!ACCESS_TOKEN_SECRET) {
  ACCESS_TOKEN_SECRET = crypto.randomBytes(64).toString('hex');
  logger.warn('JWT_ACCESS_SECRET not found in environment, generated a random one');
  logger.warn('This will cause all existing tokens to become invalid when the service restarts');
  logger.warn('For production, please set JWT_ACCESS_SECRET in environment variables');
}

if (!REFRESH_TOKEN_SECRET) {
  REFRESH_TOKEN_SECRET = crypto.randomBytes(64).toString('hex');
  logger.warn('JWT_REFRESH_SECRET not found in environment, generated a random one');
  logger.warn('This will cause all existing refresh tokens to become invalid when the service restarts');
  logger.warn('For production, please set JWT_REFRESH_SECRET in environment variables');
}

// Token expiration times
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

// Get token expiry in milliseconds
const getExpiryMs = (expiry) => {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 3600000; // Default to 1 hour

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000; // seconds
    case 'm': return value * 60 * 1000; // minutes
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    default: return 3600000; // Default to 1 hour
  }
};

/**
 * Generate access and refresh tokens for a user
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
const generateTokens = (user) => {
  // Create payload for access token
  const accessPayload = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  // Generate access token
  logger.debug(`Generating token for user ${user.username} with secret: ${ACCESS_TOKEN_SECRET?.substring(0, 8)}...`);
  const accessToken = jwt.sign(
    accessPayload,
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  logger.debug(`Generated token: ${accessToken?.substring(0, 20)}...`);

  // Create payload for refresh token (minimal information)
  const refreshPayload = {
    id: user.id,
    type: 'refresh'
  };

  // Generate refresh token
  const refreshToken = jwt.sign(
    refreshPayload,
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: getExpiryMs(ACCESS_TOKEN_EXPIRY) / 1000 // in seconds
  };
};

/**
 * Verify access token
 * @param {string} token - Access token to verify
 * @returns {Object|null} - Decoded token or null if invalid
 */
const verifyAccessToken = async (token) => {
  try {
    // Check if token is revoked
    const userInstance = new User();
    const isRevoked = await userInstance.isTokenRevoked(token);
    if (isRevoked) {
      logger.debug('Token is revoked');
      return null;
    }

    // Verify token
    logger.debug(`Attempting to verify token with secret: ${ACCESS_TOKEN_SECRET?.substring(0, 8)}...`);
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    logger.debug(`Token verified successfully for user: ${decoded.username}`);
    return decoded;
  } catch (error) {
    logger.warn(`Token verification failed: ${error.message}`);
    logger.debug(`Token: ${token?.substring(0, 20)}...`);
    logger.debug(`Secret used: ${ACCESS_TOKEN_SECRET?.substring(0, 8)}...`);
    return null;
  }
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token to verify
 * @returns {Object|null} - Decoded token or null if invalid
 */
const verifyRefreshToken = (token) => {
  try {
    // Check if token is revoked
    if (User.isTokenRevoked(token)) {
      return null;
    }

    // Verify token
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET);
    
    // Verify it's a refresh token
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    logger.debug(`Refresh token verification failed: ${error.message}`);
    return null;
  }
};

/**
 * Revoke token
 * @param {string} token - Token to revoke
 * @param {boolean} isRefresh - Whether it's a refresh token
 */
const revokeToken = (token, isRefresh = false) => {
  try {
    // Verify token to get expiration
    const secret = isRefresh ? REFRESH_TOKEN_SECRET : ACCESS_TOKEN_SECRET;
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true });
    
    // Get expiration timestamp
    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    
    // Add to revoked tokens
    return User.revokeToken(token, expiresAt);
  } catch (error) {
    logger.debug(`Failed to revoke token: ${error.message}`);
    return false;
  }
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  revokeToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};