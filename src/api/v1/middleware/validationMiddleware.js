/**
 * Request Validation Middleware
 * Provides validation schemas and middleware for all API endpoints
 */

const { Validator, createValidationMiddleware } = require('../../../utils/validation');

/**
 * Common validation schemas
 */
const schemas = {
  // Port-related validations
  portAvailabilityCheck: {
    body: {
      ports: { 
        validator: Validator.validatePortArray,
        options: { maxLength: 100, minLength: 1 }
      },
      protocol: { 
        validator: Validator.validateProtocol 
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      }
    }
  },

  portReservation: {
    body: {
      ports: { 
        validator: Validator.validatePortArray,
        options: { maxLength: 50, minLength: 1 }
      },
      containerId: { 
        validator: Validator.validateContainerId 
      },
      protocol: { 
        validator: Validator.validateProtocol 
      },
      duration: { 
        validator: Validator.validateDuration,
        options: { min: 60, max: 86400 }
      },
      containerName: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 255 }
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      }
    }
  },

  portReservationRelease: {
    body: {
      containerId: { 
        validator: Validator.validateContainerId 
      },
      ports: { 
        validator: Validator.validatePortArray,
        options: { required: false, maxLength: 50 }
      }
    }
  },

  portSuggestions: {
    body: {
      requestedPorts: { 
        validator: Validator.validatePortArray,
        options: { maxLength: 20, minLength: 1 }
      },
      protocol: { 
        validator: Validator.validateProtocol 
      },
      serviceType: { 
        validator: Validator.validateServiceType 
      },
      maxSuggestions: {
        validator: (value, field) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 50) {
            throw new Error(`${field} must be between 1 and 50`);
          }
          return num;
        }
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      }
    }
  },

  portRecommendations: {
    body: {
      requestedPorts: { 
        validator: Validator.validatePortArray,
        options: { required: false, maxLength: 20 }
      },
      serviceType: { 
        validator: Validator.validateServiceType 
      },
      protocol: { 
        validator: Validator.validateProtocol 
      },
      preferredRange: {
        validator: (value, field) => {
          if (!value) return undefined;
          if (typeof value !== 'object' || !value.start || !value.end) {
            throw new Error(`${field} must have start and end properties`);
          }
          return {
            start: Validator.validatePort(value.start, `${field}.start`),
            end: Validator.validatePort(value.end, `${field}.end`)
          };
        }
      },
      containerName: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 255 }
      }
    }
  },

  portScanRange: {
    body: {
      startPort: { 
        validator: Validator.validatePort 
      },
      endPort: { 
        validator: Validator.validatePort 
      },
      protocol: { 
        validator: Validator.validateProtocol 
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      }
    }
  },

  deploymentValidation: {
    body: {
      ports: { 
        validator: Validator.validatePortArray,
        options: { maxLength: 50, minLength: 1 }
      },
      containerId: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 255 }
      },
      containerName: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 255 }
      },
      serviceType: { 
        validator: Validator.validateServiceType 
      },
      protocol: { 
        validator: Validator.validateProtocol 
      }
    }
  },

  // Server-related validations
  serverCreate: {
    body: {
      name: {
        validator: Validator.validateString,
        options: { required: true, minLength: 1, maxLength: 100 }
      },
      ip: { 
        validator: Validator.validateIpAddress,
        options: { allowPrivate: true, allowLoopback: true }
      },
      description: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 500 }
      }
    }
  },

  serverUpdate: {
    body: {
      name: {
        validator: Validator.validateString,
        options: { required: false, minLength: 1, maxLength: 100 }
      },
      ip: { 
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateIpAddress(value, field, { allowPrivate: true, allowLoopback: true });
        }
      },
      description: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 500 }
      }
    }
  },

  // Port documentation update
  portDocumentationUpdate: {
    params: {
      port: { 
        validator: Validator.validatePort 
      }
    },
    body: {
      documentation: {
        validator: Validator.validateString,
        options: { required: false, maxLength: 2000 }
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      }
    }
  },

  portServiceLabelUpdate: {
    params: {
      port: { 
        validator: Validator.validatePort 
      }
    },
    body: {
      serviceLabel: {
        validator: Validator.validateString,
        options: { required: true, minLength: 1, maxLength: 100 }
      },
      server: { 
        validator: Validator.validateHostname,
        options: { required: false }
      },
      protocol: { 
        validator: Validator.validateProtocol 
      }
    }
  },

  // Configuration validations
  configUpdate: {
    body: {
      hostIp: {
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateIpAddress(value, field, { allowPrivate: true, allowLoopback: true });
        }
      },
      portManagementEnabled: {
        validator: Validator.validateBoolean
      }
    }
  },

  // Query parameter validations
  portListQuery: {
    query: {
      server: { 
        validator: (value, field) => {
          if (!value) return 'localhost';
          return Validator.validateHostname(value, field);
        }
      },
      protocol: { 
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateProtocol(value, field);
        }
      },
      service: {
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateString(value, field, { maxLength: 100 });
        }
      },
      status: {
        validator: (value, field) => {
          if (!value) return undefined;
          const validStatuses = ['open', 'closed', 'filtered', 'unknown'];
          const normalized = value.toLowerCase();
          if (!validStatuses.includes(normalized)) {
            throw new Error(`${field} must be one of: ${validStatuses.join(', ')}`);
          }
          return normalized;
        }
      },
      page: {
        validator: (value, field) => {
          if (!value) return 1;
          const num = parseInt(value);
          if (isNaN(num) || num < 1) {
            throw new Error(`${field} must be a positive integer`);
          }
          return num;
        }
      },
      limit: {
        validator: (value, field) => {
          if (!value) return 20;
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 100) {
            throw new Error(`${field} must be between 1 and 100`);
          }
          return num;
        }
      }
    }
  },

  alertQuery: {
    query: {
      severity: {
        validator: (value, field) => {
          if (!value) return undefined;
          const validSeverities = ['low', 'medium', 'high', 'critical'];
          const normalized = value.toLowerCase();
          if (!validSeverities.includes(normalized)) {
            throw new Error(`${field} must be one of: ${validSeverities.join(', ')}`);
          }
          return normalized;
        }
      },
      acknowledged: {
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateBoolean(value, field);
        }
      },
      page: {
        validator: (value, field) => {
          if (!value) return 1;
          const num = parseInt(value);
          if (isNaN(num) || num < 1) {
            throw new Error(`${field} must be a positive integer`);
          }
          return num;
        }
      },
      limit: {
        validator: (value, field) => {
          if (!value) return 20;
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 100) {
            throw new Error(`${field} must be between 1 and 100`);
          }
          return num;
        }
      }
    }
  },

  reservationQuery: {
    query: {
      containerId: {
        validator: (value, field) => {
          if (!value) return undefined;
          return Validator.validateContainerId(value, field);
        }
      },
      ports: {
        validator: (value, field) => {
          if (!value) return undefined;
          const portStrings = value.split(',');
          return portStrings.map(p => Validator.validatePort(p.trim(), field));
        }
      },
      page: {
        validator: (value, field) => {
          if (!value) return 1;
          const num = parseInt(value);
          if (isNaN(num) || num < 1) {
            throw new Error(`${field} must be a positive integer`);
          }
          return num;
        }
      },
      limit: {
        validator: (value, field) => {
          if (!value) return 20;
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num > 100) {
            throw new Error(`${field} must be between 1 and 100`);
          }
          return num;
        }
      }
    }
  }
};

/**
 * Create validation middleware for specific schema
 * @param {string} schemaName - Name of schema to use
 * @returns {Function} Express middleware
 */
function validate(schemaName) {
  const schema = schemas[schemaName];
  if (!schema) {
    throw new Error(`Validation schema '${schemaName}' not found`);
  }
  
  return createValidationMiddleware(schema);
}

/**
 * Middleware to validate request size
 * @param {Object} options - Size limit options
 * @returns {Function} Express middleware
 */
function validateRequestSize(options = {}) {
  const { maxBodySize = 1024 * 1024, maxArrayLength = 1000 } = options; // 1MB default

  return (req, res, next) => {
    // Check body size
    const bodySize = JSON.stringify(req.body || {}).length;
    if (bodySize > maxBodySize) {
      return res.apiError('Request body too large', 413, 'REQUEST_TOO_LARGE');
    }

    // Check array lengths recursively
    const checkArrayLengths = (obj, path = '') => {
      if (Array.isArray(obj)) {
        if (obj.length > maxArrayLength) {
          throw new Error(`Array at ${path} exceeds maximum length of ${maxArrayLength}`);
        }
        obj.forEach((item, index) => checkArrayLengths(item, `${path}[${index}]`));
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          checkArrayLengths(value, path ? `${path}.${key}` : key);
        });
      }
    };

    try {
      checkArrayLengths(req.body);
      next();
    } catch (error) {
      return res.apiError(error.message, 400, 'ARRAY_TOO_LARGE');
    }
  };
}

/**
 * Middleware to sanitize inputs
 * @returns {Function} Express middleware
 */
function sanitizeInputs() {
  return (req, res, next) => {
    // Sanitize strings in body, query, and params
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // Remove potentially dangerous characters
          sanitized[key] = value
            .trim()
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
        } else if (Array.isArray(value)) {
          sanitized[key] = value.map(item => 
            typeof item === 'string' ? sanitizeObject({ temp: item }).temp : item
          );
        } else if (value && typeof value === 'object') {
          sanitized[key] = sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    req.params = sanitizeObject(req.params);

    next();
  };
}

module.exports = {
  validate,
  validateRequestSize,
  sanitizeInputs,
  schemas
};