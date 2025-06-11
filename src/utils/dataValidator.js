/**
 * Data Validator
 * Comprehensive validation and sanitization for all data types
 */
const logger = require('./logger');

class DataValidator {
  /**
   * Validate data against a schema
   * @param {Object} data - Data to validate
   * @param {Object} schema - Validation schema
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  static validate(data, schema, options = {}) {
    const { strict = false, allowUnknown = false, sanitize = true } = options;
    
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedData: sanitize ? { ...data } : data
    };
    
    try {
      // Check required fields
      for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        
        // Required field check
        if (rules.required && (value === undefined || value === null || value === '')) {
          result.errors.push(`Field '${field}' is required`);
          result.isValid = false;
          continue;
        }
        
        // Skip validation if field is not provided and not required
        if (value === undefined || value === null) {
          continue;
        }
        
        // Type validation
        if (rules.type && !this.validateType(value, rules.type)) {
          result.errors.push(`Field '${field}' must be of type '${rules.type}'`);
          result.isValid = false;
        }
        
        // Enum validation
        if (rules.enum && !rules.enum.includes(value)) {
          result.errors.push(`Field '${field}' must be one of: ${rules.enum.join(', ')}`);
          result.isValid = false;
        }
        
        // Pattern validation
        if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
          result.errors.push(`Field '${field}' does not match required pattern`);
          result.isValid = false;
        }
        
        // Length validation
        if (rules.minLength && value.length < rules.minLength) {
          result.errors.push(`Field '${field}' must be at least ${rules.minLength} characters`);
          result.isValid = false;
        }
        
        if (rules.maxLength && value.length > rules.maxLength) {
          result.errors.push(`Field '${field}' must be no more than ${rules.maxLength} characters`);
          result.isValid = false;
        }
        
        // Numeric range validation
        if (rules.min !== undefined && value < rules.min) {
          result.errors.push(`Field '${field}' must be at least ${rules.min}`);
          result.isValid = false;
        }
        
        if (rules.max !== undefined && value > rules.max) {
          result.errors.push(`Field '${field}' must be no more than ${rules.max}`);
          result.isValid = false;
        }
        
        // Custom validation
        if (rules.validator && typeof rules.validator === 'function') {
          const customResult = rules.validator(value, data);
          if (customResult !== true) {
            result.errors.push(customResult || `Field '${field}' failed custom validation`);
            result.isValid = false;
          }
        }
        
        // Sanitization
        if (sanitize && rules.sanitizer && typeof rules.sanitizer === 'function') {
          try {
            result.sanitizedData[field] = rules.sanitizer(value, data);
          } catch (sanitizeError) {
            result.warnings.push(`Failed to sanitize field '${field}': ${sanitizeError.message}`);
          }
        }
      }
      
      // Check for unknown fields in strict mode
      if (strict && !allowUnknown) {
        for (const field of Object.keys(data)) {
          if (!schema[field]) {
            result.errors.push(`Unknown field '${field}' not allowed in strict mode`);
            result.isValid = false;
          }
        }
      }
      
    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
      result.isValid = false;
    }
    
    return result;
  }
  
  /**
   * Validate data type
   * @private
   */
  static validateType(value, expectedType) {
    switch (expectedType.toLowerCase()) {
      case 'string':
        return typeof value === 'string';
      case 'number':
      case 'integer':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'email':
        return typeof value === 'string' && this.isValidEmail(value);
      case 'url':
        return typeof value === 'string' && this.isValidUrl(value);
      case 'ip':
        return typeof value === 'string' && this.isValidIP(value);
      case 'port':
        return typeof value === 'number' && value >= 1 && value <= 65535;
      case 'hostname':
        return typeof value === 'string' && this.isValidHostname(value);
      default:
        return true; // Unknown types pass validation
    }
  }
  
  /**
   * DNS Record validation schemas
   */
  static getDNSRecordSchema() {
    return {
      type: {
        required: true,
        type: 'string',
        enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'],
        sanitizer: (value) => value.toUpperCase()
      },
      name: {
        required: true,
        type: 'hostname',
        maxLength: 253,
        sanitizer: (value) => value.toLowerCase().trim()
      },
      content: {
        required: true,
        type: 'string',
        maxLength: 4096,
        validator: (value, data) => this.validateDNSContent(value, data.type),
        sanitizer: (value, data) => this.sanitizeDNSContent(value, data.type)
      },
      ttl: {
        type: 'integer',
        min: 1,
        max: 2147483647,
        sanitizer: (value) => parseInt(value) || 300
      },
      priority: {
        type: 'integer',
        min: 0,
        max: 65535,
        validator: (value, data) => {
          if (['MX', 'SRV'].includes(data.type) && value === undefined) {
            return 'Priority is required for MX and SRV records';
          }
          return true;
        }
      },
      proxied: {
        type: 'boolean',
        sanitizer: (value) => Boolean(value)
      }
    };
  }
  
  /**
   * Port validation schema
   */
  static getPortSchema() {
    return {
      port: {
        required: true,
        type: 'port'
      },
      protocol: {
        required: true,
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => value.toLowerCase()
      },
      server_id: {
        required: true,
        type: 'string',
        minLength: 1,
        sanitizer: (value) => value.trim()
      },
      status: {
        type: 'string',
        enum: ['available', 'unavailable', 'reserved'],
        sanitizer: (value) => value.toLowerCase()
      },
      service: {
        type: 'string',
        maxLength: 255,
        sanitizer: (value) => value ? value.trim() : value
      },
      container_id: {
        type: 'string',
        maxLength: 255,
        sanitizer: (value) => value ? value.trim() : value
      }
    };
  }
  
  /**
   * Port reservation validation schema
   */
  static getPortReservationSchema() {
    return {
      port: {
        required: true,
        type: 'port'
      },
      protocol: {
        required: true,
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => value.toLowerCase()
      },
      container_id: {
        required: true,
        type: 'string',
        minLength: 1,
        sanitizer: (value) => value.trim()
      },
      expires_at: {
        type: 'date',
        validator: (value) => {
          if (value && new Date(value) <= new Date()) {
            return 'Expiration date must be in the future';
          }
          return true;
        }
      },
      duration: {
        type: 'integer',
        min: 60, // Minimum 1 minute
        max: 31536000 // Maximum 1 year
      }
    };
  }
  
  /**
   * User validation schema
   */
  static getUserSchema() {
    return {
      username: {
        required: true,
        type: 'string',
        minLength: 3,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_-]+$/,
        sanitizer: (value) => value.toLowerCase().trim()
      },
      email: {
        type: 'email',
        sanitizer: (value) => value ? value.toLowerCase().trim() : value
      },
      password: {
        type: 'string',
        minLength: 8,
        maxLength: 128,
        validator: (value) => {
          if (value && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
            return 'Password must contain at least one lowercase letter, one uppercase letter, and one number';
          }
          return true;
        }
      },
      role: {
        type: 'string',
        enum: ['admin', 'user', 'viewer'],
        sanitizer: (value) => value.toLowerCase()
      }
    };
  }
  
  /**
   * Validate DNS content based on record type
   * @private
   */
  static validateDNSContent(content, type) {
    if (!content) return 'Content is required';
    
    switch (type?.toUpperCase()) {
      case 'A':
        return this.isValidIPv4(content) || 'Invalid IPv4 address';
      case 'AAAA':
        return this.isValidIPv6(content) || 'Invalid IPv6 address';
      case 'CNAME':
        return this.isValidHostname(content) || 'Invalid hostname';
      case 'MX':
        return this.isValidHostname(content) || 'Invalid mail server hostname';
      case 'TXT':
        return content.length <= 255 || 'TXT record too long (max 255 chars)';
      case 'SRV':
        return this.isValidSRVContent(content) || 'Invalid SRV record format';
      case 'CAA':
        return this.isValidCAAContent(content) || 'Invalid CAA record format';
      default:
        return true;
    }
  }
  
  /**
   * Sanitize DNS content based on record type
   * @private
   */
  static sanitizeDNSContent(content, type) {
    if (!content) return content;
    
    switch (type?.toUpperCase()) {
      case 'A':
      case 'AAAA':
        return content.trim();
      case 'CNAME':
      case 'MX':
        return content.toLowerCase().trim().replace(/\.$/, ''); // Remove trailing dot
      case 'TXT':
        return content.trim();
      case 'SRV':
      case 'CAA':
        return content.trim();
      default:
        return content.trim();
    }
  }
  
  /**
   * Validation helper methods
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  static isValidIP(ip) {
    return this.isValidIPv4(ip) || this.isValidIPv6(ip);
  }
  
  static isValidIPv4(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }
  
  static isValidIPv6(ip) {
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    return ipv6Regex.test(ip);
  }
  
  static isValidHostname(hostname) {
    if (!hostname || hostname.length > 253) return false;
    
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return hostnameRegex.test(hostname);
  }
  
  static isValidSRVContent(content) {
    // SRV format: priority weight port target
    const srvRegex = /^\d+ \d+ \d+ .+$/;
    return srvRegex.test(content);
  }
  
  static isValidCAAContent(content) {
    // CAA format: flags tag value
    const caaRegex = /^\d+ \w+ .+$/;
    return caaRegex.test(content);
  }
}

module.exports = DataValidator;