/**
 * Error handling middleware for the API
 */
const logger = require('../../../utils/logger');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error with appropriate level based on status code
  const statusCode = err.statusCode || 500;
  
  if (statusCode >= 500) {
    logger.error(`API Error: ${err.message}`);
    logger.trace(err.stack);
  } else if (statusCode >= 400) {
    logger.warn(`API Client Error: ${err.message}`);
  }
  
  // Create standardized error response
  const errorResponse = {
    status: 'error',
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  };
  
  // Include error details if available
  if (err.details && Object.keys(err.details).length > 0) {
    errorResponse.details = err.details;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Not found error handler
 */
const notFound = (req, res, next) => {
  const error = new ApiError(
    `Endpoint not found: ${req.method} ${req.originalUrl}`,
    404,
    'ENDPOINT_NOT_FOUND'
  );
  next(error);
};

module.exports = {
  ApiError,
  errorHandler,
  notFound
};