/**
 * API Error utility class
 * Used for standardized API error handling
 */

/**
 * ApiError class for handling API errors with standardized format
 */
class ApiError extends Error {
  /**
   * Create a new API error
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code identifier
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode = 500, code = 'SERVER_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Format error response
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (err, req, res) => {
  // Default values for server errors
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'SERVER_ERROR';
  let details = err.details || null;
  
  // Handle different types of errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    code = 'VALIDATION_ERROR';
    details = err.details || err.message;
  } else if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
    statusCode = 400;
    message = 'Invalid JSON in request body';
    code = 'INVALID_JSON';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  }
  
  // Build error response
  const errorResponse = {
    status: 'error',
    code,
    message
  };
  
  // Add details if available
  if (details) {
    errorResponse.details = details;
  }
  
  // Add request ID if available
  if (req.id) {
    errorResponse.requestId = req.id;
  }
  
  // Return the error response
  return res.status(statusCode).json(errorResponse);
};

module.exports = {
  ApiError,
  formatErrorResponse
};