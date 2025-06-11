/**
 * Pagination Middleware
 * Provides standardized pagination for API endpoints
 */

const ApiResponse = require('../../../utils/apiResponse');
const logger = require('../../../utils/logger');

/**
 * Pagination middleware factory
 * @param {Object} options - Pagination options
 * @param {number} options.defaultLimit - Default number of items per page
 * @param {number} options.maxLimit - Maximum allowed items per page
 * @param {number} options.defaultPage - Default page number
 * @returns {Function} Express middleware function
 */
function paginationMiddleware(options = {}) {
  const {
    defaultLimit = 20,
    maxLimit = 100,
    defaultPage = 1
  } = options;

  return function(req, res, next) {
    try {
      // Extract pagination parameters from query
      const pagination = ApiResponse.extractPagination(req.query, {
        page: defaultPage,
        limit: defaultLimit,
        maxLimit
      });

      // Add pagination to request object
      req.pagination = pagination;

      // Add helper method to response for paginated responses
      res.sendPaginated = function(data, totalCount, message = 'Success') {
        const paginationInfo = {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount
        };

        return res.apiPaginated(data, paginationInfo, message);
      };

      // Add helper method for filtered lists with pagination
      res.sendFilteredList = function(data, totalCount, filters = {}, message = 'Success') {
        const paginationInfo = totalCount !== undefined ? {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount
        } : null;

        return res.apiFilteredList(data, filters, paginationInfo, message);
      };

      logger.debug(`Pagination middleware: page=${pagination.page}, limit=${pagination.limit}, offset=${pagination.offset}`);
      
      next();
    } catch (error) {
      logger.error('Pagination middleware error:', error);
      return res.apiError('Invalid pagination parameters', 400, 'INVALID_PAGINATION');
    }
  };
}

/**
 * Repository pagination helper
 * Converts pagination parameters to database query parameters
 * @param {Object} pagination - Pagination object from request
 * @param {Object} baseQuery - Base query object
 * @returns {Object} Query object with pagination
 */
function applyPagination(pagination, baseQuery = {}) {
  return {
    ...baseQuery,
    limit: pagination.limit,
    offset: pagination.offset
  };
}

/**
 * SQL pagination helper
 * Generates SQL LIMIT and OFFSET clauses
 * @param {Object} pagination - Pagination object from request
 * @returns {Object} SQL clauses and parameters
 */
function getSqlPagination(pagination) {
  return {
    clause: 'LIMIT ? OFFSET ?',
    params: [pagination.limit, pagination.offset]
  };
}

/**
 * Calculate pagination metadata
 * @param {number} totalCount - Total number of items
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Pagination metadata
 */
function calculatePaginationMeta(totalCount, pagination) {
  const { page, limit } = pagination;
  const totalPages = Math.ceil(totalCount / limit);

  return {
    page,
    limit,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    offset: (page - 1) * limit,
    startItem: totalCount > 0 ? ((page - 1) * limit) + 1 : 0,
    endItem: Math.min(page * limit, totalCount)
  };
}

/**
 * Validate pagination parameters
 * @param {Object} query - Request query parameters
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validatePagination(query, options = {}) {
  const {
    maxLimit = 100,
    maxPage = 10000
  } = options;

  const errors = [];
  
  if (query.page !== undefined) {
    const page = parseInt(query.page);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive integer');
    } else if (page > maxPage) {
      errors.push(`Page cannot exceed ${maxPage}`);
    }
  }

  if (query.limit !== undefined) {
    const limit = parseInt(query.limit);
    if (isNaN(limit) || limit < 1) {
      errors.push('Limit must be a positive integer');
    } else if (limit > maxLimit) {
      errors.push(`Limit cannot exceed ${maxLimit}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create paginated response from array data
 * Useful for in-memory pagination when database pagination isn't possible
 * @param {Array} data - Full dataset
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Paginated result
 */
function paginateArray(data, pagination) {
  const { limit, offset } = pagination;
  const totalCount = data.length;
  const paginatedData = data.slice(offset, offset + limit);

  return {
    data: paginatedData,
    meta: calculatePaginationMeta(totalCount, pagination)
  };
}

/**
 * Express route handler wrapper for automatic pagination
 * @param {Function} handler - Route handler function
 * @param {Object} options - Pagination options
 * @returns {Function} Wrapped route handler
 */
function withPagination(handler, options = {}) {
  return async function(req, res, next) {
    try {
      // Apply pagination middleware if not already applied
      if (!req.pagination) {
        const middleware = paginationMiddleware(options);
        await new Promise((resolve, reject) => {
          middleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Call original handler
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Database query builder helper for common pagination patterns
 */
class PaginationQueryBuilder {
  constructor(baseQuery) {
    this.query = baseQuery || '';
    this.params = [];
    this.countQuery = '';
  }

  /**
   * Add WHERE conditions
   * @param {string} condition - SQL WHERE condition
   * @param {Array} params - Parameters for the condition
   * @returns {PaginationQueryBuilder} Fluent interface
   */
  where(condition, params = []) {
    if (this.query.toLowerCase().includes('where')) {
      this.query += ` AND ${condition}`;
    } else {
      this.query += ` WHERE ${condition}`;
    }
    this.params.push(...params);
    return this;
  }

  /**
   * Add ORDER BY clause
   * @param {string} orderBy - ORDER BY clause
   * @returns {PaginationQueryBuilder} Fluent interface
   */
  orderBy(orderBy) {
    this.query += ` ORDER BY ${orderBy}`;
    return this;
  }

  /**
   * Apply pagination
   * @param {Object} pagination - Pagination parameters
   * @returns {Object} Query and count query with parameters
   */
  paginate(pagination) {
    // Create count query by replacing SELECT clause
    this.countQuery = this.query.replace(
      /^SELECT\s+.+?\s+FROM/i,
      'SELECT COUNT(*) as total FROM'
    );

    // Remove ORDER BY from count query (not needed and can cause issues)
    this.countQuery = this.countQuery.replace(/\s+ORDER\s+BY\s+.+$/i, '');

    // Add pagination to main query
    const paginatedQuery = this.query + ' LIMIT ? OFFSET ?';
    const paginatedParams = [...this.params, pagination.limit, pagination.offset];

    return {
      dataQuery: {
        sql: paginatedQuery,
        params: paginatedParams
      },
      countQuery: {
        sql: this.countQuery,
        params: this.params
      }
    };
  }
}

module.exports = {
  paginationMiddleware,
  applyPagination,
  getSqlPagination,
  calculatePaginationMeta,
  validatePagination,
  paginateArray,
  withPagination,
  PaginationQueryBuilder
};