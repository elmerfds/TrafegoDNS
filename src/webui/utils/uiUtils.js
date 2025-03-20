/**
 * Utility functions for UI components
 */

/**
 * Truncate a string to a maximum length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
export const truncateString = (str, maxLength = 30) => {
  if (!str) return '';
  
  if (str.length <= maxLength) return str;
  
  return `${str.substring(0, maxLength)}...`;
};

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
export const formatNumber = (num) => {
  if (num === undefined || num === null) return '0';
  
  return num.toLocaleString();
};

/**
 * Get a status badge variant based on status
 * @param {string|boolean} status - Status value
 * @returns {string} - Bootstrap badge variant
 */
export const getStatusBadgeVariant = (status) => {
  if (status === 'running' || status === 'connected' || status === true) {
    return 'success';
  } else if (status === 'warning' || status === 'partial') {
    return 'warning';
  } else if (status === 'error' || status === false) {
    return 'danger';
  }
  
  return 'secondary';
};

/**
 * Encode a value for use in URL parameters
 * @param {string} value - Value to encode
 * @returns {string} - URL encoded value
 */
export const encodeUrlParam = (value) => {
  return encodeURIComponent(value).replace(/%20/g, '+');
};

/**
 * Debounce a function to limit its execution frequency
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait = 300) => {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle a function to limit its execution frequency
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} - Throttled function
 */
export const throttle = (func, limit = 300) => {
  let inThrottle;
  
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Generate a random ID for UI elements
 * @param {string} prefix - ID prefix
 * @returns {string} - Random ID
 */
export const generateId = (prefix = 'id') => {
  return `${prefix}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Parse query parameters from URL
 * @returns {Object} - Object with query parameters
 */
export const parseQueryParams = () => {
  const params = {};
  const queryString = window.location.search;
  
  if (!queryString) return params;
  
  const urlParams = new URLSearchParams(queryString);
  
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  
  return params;
};
