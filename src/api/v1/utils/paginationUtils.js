/**
 * Pagination Utilities
 * Provides helper functions for implementing pagination in API endpoints
 */

/**
 * Extract pagination parameters from request query
 * @param {Object} query - Express request query object
 * @returns {Object} Pagination parameters
 */
const getPaginationParams = (query) => {
  // Default values
  const DEFAULT_PAGE = 1;
  const DEFAULT_LIMIT = 10;
  const MAX_LIMIT = 100;
  
  // Extract and validate page
  let page = parseInt(query.page || DEFAULT_PAGE, 10);
  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }
  
  // Extract and validate limit
  let limit = parseInt(query.limit || DEFAULT_LIMIT, 10);
  if (isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }
  // Cap limit to prevent excessive queries
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }
  
  // Calculate offset
  const offset = (page - 1) * limit;
  
  return {
    page,
    limit,
    offset
  };
};

/**
 * Apply pagination to an array of items
 * @param {Array} items - Array of items to paginate
 * @param {Object} params - Pagination parameters
 * @returns {Object} Paginated result
 */
const paginateArray = (items, params) => {
  const { page, limit, offset } = params;
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / limit);
  
  // Slice the array based on pagination params
  const paginatedItems = items.slice(offset, offset + limit);
  
  return {
    data: paginatedItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Generate pagination links for API response
 * @param {Object} req - Express request object
 * @param {Object} pagination - Pagination information
 * @returns {Object} Pagination links
 */
const generatePaginationLinks = (req, pagination) => {
  const { page, totalPages } = pagination;
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  
  // Create a new query object without pagination params
  const query = { ...req.query };
  delete query.page;
  delete query.limit;
  
  // Convert the query to a string
  const queryString = Object.keys(query)
    .map(key => `${key}=${query[key]}`)
    .join('&');
  
  // Build links object
  const links = {
    self: `${baseUrl}?page=${page}&limit=${pagination.limit}${queryString ? `&${queryString}` : ''}`,
  };
  
  if (pagination.hasPrevPage) {
    links.prev = `${baseUrl}?page=${page - 1}&limit=${pagination.limit}${queryString ? `&${queryString}` : ''}`;
  }
  
  if (pagination.hasNextPage) {
    links.next = `${baseUrl}?page=${page + 1}&limit=${pagination.limit}${queryString ? `&${queryString}` : ''}`;
  }
  
  links.first = `${baseUrl}?page=1&limit=${pagination.limit}${queryString ? `&${queryString}` : ''}`;
  links.last = `${baseUrl}?page=${totalPages || 1}&limit=${pagination.limit}${queryString ? `&${queryString}` : ''}`;
  
  return links;
};

/**
 * Format a paginated response for API endpoints
 * @param {Object} req - Express request object
 * @param {Array} items - Array of items to paginate
 * @param {Object} params - Pagination parameters
 * @returns {Object} Formatted response
 */
const formatPaginatedResponse = (req, items, params) => {
  const result = paginateArray(items, params);
  const links = generatePaginationLinks(req, result.pagination);
  
  return {
    status: 'success',
    data: result.data,
    pagination: {
      ...result.pagination,
      links
    }
  };
};

module.exports = {
  getPaginationParams,
  paginateArray,
  formatPaginatedResponse
};