/**
 * Rate Limiting Middleware
 * Provides protection against excessive API requests
 */
const rateLimit = require('express-rate-limit');
const logger = require('../../../utils/logger');

/**
 * Create a configurable rate limiter
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 60 * 1000, // 1 minute by default
    max: 100, // 100 requests per minute by default
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Don't use deprecated headers
    message: 'Too many requests, please try again later.',
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP ${req.ip}`);
      res.status(429).json({
        status: 'error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message
      });
    }
  };

  const limiterOptions = { ...defaultOptions, ...options };
  
  return rateLimit(limiterOptions);
};

/**
 * Default global rate limiter
 * Applies to all API routes
 */
const globalLimiter = createRateLimiter();

/**
 * Stricter rate limiter for auth endpoints
 * Helps prevent brute force attacks
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: 'Too many login attempts, please try again after 15 minutes'
});

/**
 * Rate limiter for write operations (POST, PUT, DELETE)
 */
const writeLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30 // 30 write operations per 5 minutes
});

module.exports = {
  globalLimiter,
  authLimiter,
  writeLimiter,
  createRateLimiter
};