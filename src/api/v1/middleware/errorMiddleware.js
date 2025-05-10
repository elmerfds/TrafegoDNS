/**
 * Error handling middleware for the API
 */
const logger = require('../../../utils/logger');
const { ApiError, formatErrorResponse } = require('../../../utils/apiError');

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

  // Use the formatErrorResponse utility for consistent error formatting
  return formatErrorResponse(err, req, res);
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