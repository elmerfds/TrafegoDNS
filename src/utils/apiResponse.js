/**
 * API Response Utility
 * Provides standardized response formatting for all API endpoints
 */

class ApiResponse {
  /**
   * Create a successful response
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @param {Object} meta - Additional metadata (pagination, etc.)
   * @returns {Object} Standardized success response
   */
  static success(data = null, message = 'Success', meta = {}) {
    const response = {
      success: true,
      status: 'success',
      message,
      data,
      timestamp: new Date().toISOString()
    };

    // Add metadata if provided
    if (Object.keys(meta).length > 0) {
      response.meta = meta;
    }

    return response;
  }

  /**
   * Create an error response
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} errorCode - Application-specific error code
   * @param {Object} details - Additional error details
   * @returns {Object} Standardized error response
   */
  static error(message = 'An error occurred', statusCode = 500, errorCode = null, details = {}) {
    const response = {
      success: false,
      status: 'error',
      message,
      statusCode,
      timestamp: new Date().toISOString()
    };

    // Add error code if provided
    if (errorCode) {
      response.errorCode = errorCode;
    }

    // Add error details if provided
    if (Object.keys(details).length > 0) {
      response.details = details;
    }

    return response;
  }

  /**
   * Create a validation error response
   * @param {Array|Object} errors - Validation errors
   * @param {string} message - Error message
   * @returns {Object} Standardized validation error response
   */
  static validationError(errors, message = 'Validation failed') {
    return this.error(message, 400, 'VALIDATION_ERROR', { errors });
  }

  /**
   * Create a not found response
   * @param {string} resource - Resource that was not found
   * @param {string} identifier - Resource identifier
   * @returns {Object} Standardized not found response
   */
  static notFound(resource = 'Resource', identifier = null) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    
    return this.error(message, 404, 'NOT_FOUND', { resource, identifier });
  }

  /**
   * Create an unauthorized response
   * @param {string} message - Unauthorized message
   * @returns {Object} Standardized unauthorized response
   */
  static unauthorized(message = 'Unauthorized access') {
    return this.error(message, 401, 'UNAUTHORIZED');
  }

  /**
   * Create a forbidden response
   * @param {string} message - Forbidden message
   * @returns {Object} Standardized forbidden response
   */
  static forbidden(message = 'Access forbidden') {
    return this.error(message, 403, 'FORBIDDEN');
  }

  /**
   * Create a conflict response
   * @param {string} message - Conflict message
   * @param {Object} conflictDetails - Details about the conflict
   * @returns {Object} Standardized conflict response
   */
  static conflict(message = 'Resource conflict', conflictDetails = {}) {
    return this.error(message, 409, 'CONFLICT', conflictDetails);
  }

  /**
   * Create a paginated response
   * @param {Array} data - Array of data items
   * @param {Object} pagination - Pagination info
   * @param {number} pagination.page - Current page number
   * @param {number} pagination.limit - Items per page
   * @param {number} pagination.total - Total number of items
   * @param {string} message - Success message
   * @returns {Object} Standardized paginated response
   */
  static paginated(data, pagination, message = 'Success') {
    const { page, limit, total } = pagination;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const meta = {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
        offset: (page - 1) * limit
      }
    };

    return this.success(data, message, meta);
  }

  /**
   * Create a response with statistics
   * @param {any} data - Response data
   * @param {Object} stats - Statistics object
   * @param {string} message - Success message
   * @returns {Object} Standardized response with statistics
   */
  static withStats(data, stats, message = 'Success') {
    return this.success(data, message, { stats });
  }

  /**
   * Create a response for async operations
   * @param {string} operationId - Unique operation identifier
   * @param {string} status - Operation status (pending, processing, completed, failed)
   * @param {string} message - Status message
   * @param {Object} progress - Progress information
   * @returns {Object} Standardized async operation response
   */
  static asyncOperation(operationId, status = 'pending', message = 'Operation initiated', progress = {}) {
    return this.success(null, message, {
      operation: {
        id: operationId,
        status,
        progress,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a response for list operations with filtering
   * @param {Array} data - Array of data items
   * @param {Object} filters - Applied filters
   * @param {Object} pagination - Pagination info (optional)
   * @param {string} message - Success message
   * @returns {Object} Standardized filtered list response
   */
  static filteredList(data, filters, pagination = null, message = 'Success') {
    const meta = { filters };
    
    if (pagination) {
      const { page, limit, total } = pagination;
      const totalPages = Math.ceil(total / limit);
      
      meta.pagination = {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        offset: (page - 1) * limit
      };
    }

    return this.success(data, message, meta);
  }

  /**
   * Express middleware to send standardized responses
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static middleware(req, res, next) {
    // Add helper methods to response object
    res.apiSuccess = (data, message, meta) => {
      const response = ApiResponse.success(data, message, meta);
      return res.status(200).json(response);
    };

    res.apiError = (message, statusCode, errorCode, details) => {
      const response = ApiResponse.error(message, statusCode, errorCode, details);
      return res.status(statusCode || 500).json(response);
    };

    res.apiValidationError = (errors, message) => {
      const response = ApiResponse.validationError(errors, message);
      return res.status(400).json(response);
    };

    res.apiNotFound = (resource, identifier) => {
      const response = ApiResponse.notFound(resource, identifier);
      return res.status(404).json(response);
    };

    res.apiUnauthorized = (message) => {
      const response = ApiResponse.unauthorized(message);
      return res.status(401).json(response);
    };

    res.apiForbidden = (message) => {
      const response = ApiResponse.forbidden(message);
      return res.status(403).json(response);
    };

    res.apiConflict = (message, conflictDetails) => {
      const response = ApiResponse.conflict(message, conflictDetails);
      return res.status(409).json(response);
    };

    res.apiPaginated = (data, pagination, message) => {
      const response = ApiResponse.paginated(data, pagination, message);
      return res.status(200).json(response);
    };

    res.apiWithStats = (data, stats, message) => {
      const response = ApiResponse.withStats(data, stats, message);
      return res.status(200).json(response);
    };

    res.apiAsyncOperation = (operationId, status, message, progress) => {
      const response = ApiResponse.asyncOperation(operationId, status, message, progress);
      return res.status(202).json(response);
    };

    res.apiFilteredList = (data, filters, pagination, message) => {
      const response = ApiResponse.filteredList(data, filters, pagination, message);
      return res.status(200).json(response);
    };

    next();
  }

  /**
   * Helper to extract pagination parameters from request query
   * @param {Object} query - Express request query object
   * @param {Object} defaults - Default pagination values
   * @returns {Object} Pagination parameters
   */
  static extractPagination(query, defaults = {}) {
    const {
      page: defaultPage = 1,
      limit: defaultLimit = 20,
      maxLimit = 100
    } = defaults;

    let page = parseInt(query.page) || defaultPage;
    let limit = parseInt(query.limit) || defaultLimit;

    // Ensure valid values
    page = Math.max(1, page);
    limit = Math.max(1, Math.min(limit, maxLimit));

    return {
      page,
      limit,
      offset: (page - 1) * limit
    };
  }

  /**
   * Helper to extract common filter parameters from request query
   * @param {Object} query - Express request query object
   * @param {Array} allowedFilters - Array of allowed filter field names
   * @returns {Object} Filter parameters
   */
  static extractFilters(query, allowedFilters = []) {
    const filters = {};

    allowedFilters.forEach(field => {
      if (query[field] !== undefined && query[field] !== '') {
        filters[field] = query[field];
      }
    });

    // Common filter patterns
    if (query.search) {
      filters.search = query.search;
    }
    
    if (query.sort) {
      filters.sort = query.sort;
    }
    
    if (query.order && ['asc', 'desc'].includes(query.order.toLowerCase())) {
      filters.order = query.order.toLowerCase();
    }

    return filters;
  }
}

module.exports = ApiResponse;