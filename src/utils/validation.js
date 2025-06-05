/**
 * Input Validation Utilities
 * Comprehensive validation functions for all data types
 */

const protocolHandler = require('./protocolHandler');
const logger = require('./logger');

/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(message, field, value, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.code = code;
  }
}

/**
 * Collection of validation functions
 */
class Validator {
  /**
   * Validate port number
   * @param {any} port - Port to validate
   * @param {string} field - Field name for error reporting
   * @returns {number} Valid port number
   */
  static validatePort(port, field = 'port') {
    if (port === null || port === undefined) {
      throw new ValidationError(`${field} is required`, field, port, 'REQUIRED');
    }

    const portNum = parseInt(port);
    
    if (isNaN(portNum)) {
      throw new ValidationError(`${field} must be a valid number`, field, port, 'INVALID_NUMBER');
    }

    if (portNum < 1 || portNum > 65535) {
      throw new ValidationError(`${field} must be between 1 and 65535`, field, port, 'OUT_OF_RANGE');
    }

    return portNum;
  }

  /**
   * Validate array of ports
   * @param {any} ports - Ports array to validate
   * @param {string} field - Field name for error reporting
   * @param {Object} options - Validation options
   * @returns {number[]} Valid ports array
   */
  static validatePortArray(ports, field = 'ports', options = {}) {
    const { maxLength = 50, minLength = 1 } = options;

    if (!Array.isArray(ports)) {
      throw new ValidationError(`${field} must be an array`, field, ports, 'INVALID_TYPE');
    }

    if (ports.length < minLength) {
      throw new ValidationError(`${field} must contain at least ${minLength} port(s)`, field, ports, 'TOO_SHORT');
    }

    if (ports.length > maxLength) {
      throw new ValidationError(`${field} must contain at most ${maxLength} ports`, field, ports, 'TOO_LONG');
    }

    const validPorts = [];
    const seenPorts = new Set();

    for (let i = 0; i < ports.length; i++) {
      const port = this.validatePort(ports[i], `${field}[${i}]`);
      
      if (seenPorts.has(port)) {
        throw new ValidationError(`Duplicate port ${port} in ${field}`, field, ports, 'DUPLICATE');
      }
      
      seenPorts.add(port);
      validPorts.push(port);
    }

    return validPorts;
  }

  /**
   * Validate port range string
   * @param {any} range - Port range to validate (e.g., "80-8080" or "80,443,8080")
   * @param {string} field - Field name for error reporting
   * @returns {Object} Parsed range object
   */
  static validatePortRange(range, field = 'portRange') {
    if (typeof range !== 'string') {
      throw new ValidationError(`${field} must be a string`, field, range, 'INVALID_TYPE');
    }

    const trimmed = range.trim();
    if (!trimmed) {
      throw new ValidationError(`${field} cannot be empty`, field, range, 'EMPTY');
    }

    // Handle comma-separated ports
    if (trimmed.includes(',')) {
      const ports = trimmed.split(',').map(p => this.validatePort(p.trim(), field));
      return {
        type: 'list',
        ports: ports.sort((a, b) => a - b),
        min: Math.min(...ports),
        max: Math.max(...ports),
        count: ports.length
      };
    }

    // Handle range format (start-end)
    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      if (parts.length !== 2) {
        throw new ValidationError(`${field} must be in format "start-end"`, field, range, 'INVALID_FORMAT');
      }

      const start = this.validatePort(parts[0].trim(), `${field}.start`);
      const end = this.validatePort(parts[1].trim(), `${field}.end`);

      if (start >= end) {
        throw new ValidationError(`${field} start port must be less than end port`, field, range, 'INVALID_RANGE');
      }

      const count = end - start + 1;
      if (count > 10000) {
        throw new ValidationError(`${field} range too large (max 10000 ports)`, field, range, 'RANGE_TOO_LARGE');
      }

      return {
        type: 'range',
        start,
        end,
        count,
        min: start,
        max: end
      };
    }

    // Single port
    const port = this.validatePort(trimmed, field);
    return {
      type: 'single',
      port,
      ports: [port],
      min: port,
      max: port,
      count: 1
    };
  }

  /**
   * Validate protocol
   * @param {any} protocol - Protocol to validate
   * @param {string} field - Field name for error reporting
   * @returns {string} Valid protocol
   */
  static validateProtocol(protocol, field = 'protocol') {
    if (protocol === null || protocol === undefined) {
      return 'tcp'; // Default protocol
    }

    if (typeof protocol !== 'string') {
      throw new ValidationError(`${field} must be a string`, field, protocol, 'INVALID_TYPE');
    }

    if (!protocolHandler.isValidProtocol(protocol)) {
      throw new ValidationError(`${field} must be one of: tcp, udp, both`, field, protocol, 'INVALID_PROTOCOL');
    }

    return protocolHandler.normalizeProtocol(protocol);
  }

  /**
   * Validate IP address
   * @param {any} ip - IP address to validate
   * @param {string} field - Field name for error reporting
   * @param {Object} options - Validation options
   * @returns {string} Valid IP address
   */
  static validateIpAddress(ip, field = 'ip', options = {}) {
    const { allowPrivate = true, allowLoopback = true, version = 'both' } = options;

    if (!ip || typeof ip !== 'string') {
      throw new ValidationError(`${field} must be a valid string`, field, ip, 'INVALID_TYPE');
    }

    const trimmed = ip.trim();
    
    // IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const isIPv4 = ipv4Regex.test(trimmed);

    // IPv6 validation (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    const isIPv6 = ipv6Regex.test(trimmed);

    if (!isIPv4 && !isIPv6) {
      throw new ValidationError(`${field} must be a valid IP address`, field, ip, 'INVALID_IP');
    }

    // Version check
    if (version === 'v4' && !isIPv4) {
      throw new ValidationError(`${field} must be a valid IPv4 address`, field, ip, 'INVALID_IPV4');
    }
    
    if (version === 'v6' && !isIPv6) {
      throw new ValidationError(`${field} must be a valid IPv6 address`, field, ip, 'INVALID_IPV6');
    }

    // IPv4 specific validations
    if (isIPv4) {
      const parts = trimmed.split('.').map(Number);
      
      // Check for loopback
      if (!allowLoopback && parts[0] === 127) {
        throw new ValidationError(`${field} cannot be a loopback address`, field, ip, 'LOOPBACK_NOT_ALLOWED');
      }

      // Check for private ranges
      if (!allowPrivate) {
        const isPrivate = 
          (parts[0] === 10) ||                                    // 10.0.0.0/8
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
          (parts[0] === 192 && parts[1] === 168);                 // 192.168.0.0/16

        if (isPrivate) {
          throw new ValidationError(`${field} cannot be a private address`, field, ip, 'PRIVATE_NOT_ALLOWED');
        }
      }
    }

    return trimmed;
  }

  /**
   * Validate hostname
   * @param {any} hostname - Hostname to validate
   * @param {string} field - Field name for error reporting
   * @param {Object} options - Validation options
   * @returns {string} Valid hostname
   */
  static validateHostname(hostname, field = 'hostname', options = {}) {
    const { required = true } = options;
    
    // If field is not required and value is empty, return undefined
    if (!required && (!hostname || hostname === '')) {
      return undefined;
    }
    
    if (!hostname || typeof hostname !== 'string') {
      throw new ValidationError(`${field} must be a valid string`, field, hostname, 'INVALID_TYPE');
    }

    const trimmed = hostname.trim();
    
    if (trimmed.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, hostname, 'EMPTY');
    }

    if (trimmed.length > 253) {
      throw new ValidationError(`${field} cannot exceed 253 characters`, field, hostname, 'TOO_LONG');
    }

    // Check if it's an IP address first
    try {
      this.validateIpAddress(trimmed, field);
      return trimmed; // Valid IP address
    } catch (error) {
      // Not an IP, continue with hostname validation
    }

    // Hostname validation
    const hostnameRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    
    if (!hostnameRegex.test(trimmed)) {
      throw new ValidationError(`${field} must be a valid hostname or IP address`, field, hostname, 'INVALID_HOSTNAME');
    }

    return trimmed;
  }

  /**
   * Validate container ID
   * @param {any} containerId - Container ID to validate
   * @param {string} field - Field name for error reporting
   * @returns {string} Valid container ID
   */
  static validateContainerId(containerId, field = 'containerId') {
    if (!containerId || typeof containerId !== 'string') {
      throw new ValidationError(`${field} must be a valid string`, field, containerId, 'INVALID_TYPE');
    }

    const trimmed = containerId.trim();
    
    if (trimmed.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, containerId, 'EMPTY');
    }

    // Docker container ID is typically 64 characters (full) or 12 characters (short)
    if (trimmed.length !== 12 && trimmed.length !== 64) {
      throw new ValidationError(`${field} must be 12 or 64 characters long`, field, containerId, 'INVALID_LENGTH');
    }

    // Must be hexadecimal
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(trimmed)) {
      throw new ValidationError(`${field} must contain only hexadecimal characters`, field, containerId, 'INVALID_FORMAT');
    }

    return trimmed.toLowerCase();
  }

  /**
   * Validate duration in seconds
   * @param {any} duration - Duration to validate
   * @param {string} field - Field name for error reporting
   * @param {Object} options - Validation options
   * @returns {number} Valid duration in seconds
   */
  static validateDuration(duration, field = 'duration', options = {}) {
    const { min = 60, max = 86400 } = options; // 1 minute to 24 hours by default

    if (duration === null || duration === undefined) {
      return 3600; // Default 1 hour
    }

    const durationNum = parseInt(duration);
    
    if (isNaN(durationNum)) {
      throw new ValidationError(`${field} must be a valid number`, field, duration, 'INVALID_NUMBER');
    }

    if (durationNum < min) {
      throw new ValidationError(`${field} must be at least ${min} seconds`, field, duration, 'TOO_SHORT');
    }

    if (durationNum > max) {
      throw new ValidationError(`${field} cannot exceed ${max} seconds`, field, duration, 'TOO_LONG');
    }

    return durationNum;
  }

  /**
   * Validate service type
   * @param {any} serviceType - Service type to validate
   * @param {string} field - Field name for error reporting
   * @returns {string} Valid service type
   */
  static validateServiceType(serviceType, field = 'serviceType') {
    const validTypes = ['web', 'api', 'database', 'cache', 'monitoring', 'development', 'custom'];

    if (!serviceType) {
      return 'custom'; // Default
    }

    if (typeof serviceType !== 'string') {
      throw new ValidationError(`${field} must be a string`, field, serviceType, 'INVALID_TYPE');
    }

    const normalized = serviceType.toLowerCase().trim();
    
    if (!validTypes.includes(normalized)) {
      throw new ValidationError(`${field} must be one of: ${validTypes.join(', ')}`, field, serviceType, 'INVALID_SERVICE_TYPE');
    }

    return normalized;
  }

  /**
   * Validate string with length constraints
   * @param {any} value - String to validate
   * @param {string} field - Field name for error reporting
   * @param {Object} options - Validation options
   * @returns {string} Valid string
   */
  static validateString(value, field, options = {}) {
    const { required = false, minLength = 0, maxLength = 1000, pattern = null } = options;

    if (!value || typeof value !== 'string') {
      if (required) {
        throw new ValidationError(`${field} is required`, field, value, 'REQUIRED');
      }
      return value || '';
    }

    const trimmed = value.trim();

    if (required && trimmed.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field, value, 'EMPTY');
    }

    if (trimmed.length < minLength) {
      throw new ValidationError(`${field} must be at least ${minLength} characters`, field, value, 'TOO_SHORT');
    }

    if (trimmed.length > maxLength) {
      throw new ValidationError(`${field} cannot exceed ${maxLength} characters`, field, value, 'TOO_LONG');
    }

    if (pattern && !pattern.test(trimmed)) {
      throw new ValidationError(`${field} format is invalid`, field, value, 'INVALID_FORMAT');
    }

    return trimmed;
  }

  /**
   * Validate boolean value
   * @param {any} value - Value to validate
   * @param {string} field - Field name for error reporting
   * @param {boolean} defaultValue - Default value if undefined
   * @returns {boolean} Valid boolean
   */
  static validateBoolean(value, field, defaultValue = false) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    throw new ValidationError(`${field} must be a boolean value`, field, value, 'INVALID_BOOLEAN');
  }

  /**
   * Validate pagination parameters
   * @param {Object} params - Parameters object
   * @returns {Object} Valid pagination parameters
   */
  static validatePagination(params = {}) {
    const page = params.page ? parseInt(params.page) : 1;
    const limit = params.limit ? parseInt(params.limit) : 20;

    if (isNaN(page) || page < 1) {
      throw new ValidationError('Page must be a positive integer', 'page', params.page, 'INVALID_PAGE');
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100', 'limit', params.limit, 'INVALID_LIMIT');
    }

    return {
      page,
      limit,
      offset: (page - 1) * limit
    };
  }
}

/**
 * Validation middleware factory
 * @param {Object} schema - Validation schema
 * @returns {Function} Express middleware
 */
function createValidationMiddleware(schema) {
  return (req, res, next) => {
    const errors = [];

    try {
      // Validate body
      if (schema.body) {
        req.validatedBody = validateObjectSchema(req.body || {}, schema.body, 'body');
      }

      // Validate query
      if (schema.query) {
        req.validatedQuery = validateObjectSchema(req.query || {}, schema.query, 'query');
      }

      // Validate params
      if (schema.params) {
        req.validatedParams = validateObjectSchema(req.params || {}, schema.params, 'params');
      }

      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.apiValidationError([error.message], 'Input validation failed');
      }
      
      logger.error('Validation middleware error:', error);
      return res.apiError('Validation failed', 400, 'VALIDATION_ERROR');
    }
  };
}

/**
 * Validate object against schema
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Validation schema
 * @param {string} context - Context for error reporting
 * @returns {Object} Validated object
 */
function validateObjectSchema(obj, schema, context = 'object') {
  const validated = {};

  for (const [key, rules] of Object.entries(schema)) {
    try {
      const value = obj[key];
      
      if (rules.validator) {
        validated[key] = rules.validator(value, `${context}.${key}`, rules.options || {});
      } else {
        validated[key] = value;
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Validation failed for ${context}.${key}`, key, obj[key]);
    }
  }

  return validated;
}

module.exports = {
  Validator,
  ValidationError,
  createValidationMiddleware,
  validateObjectSchema
};