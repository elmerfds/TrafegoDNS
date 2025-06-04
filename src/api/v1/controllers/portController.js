/**
 * Port Controller
 * Handles port-related API requests with enhanced validation and error handling
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');
const DataValidator = require('../../../utils/dataValidator');
const { errorHandler, ValidationError, BusinessLogicError } = require('../../../utils/errorHandler');
const { transactionManager } = require('../../../database/transactionManager');
const { dataConsistencyService } = require('../../../services/dataConsistencyService');
const protocolHandler = require('../../../utils/protocolHandler');

/**
 * @desc    Get ports currently in use
 * @route   GET /api/v1/ports/in-use
 * @access  Private
 */
const getPortsInUse = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { server = 'localhost' } = req.query;
  
  logger.info(`📡 API: Getting ports in use for server: ${server}`);

  try {
    const portsInUse = await PortMonitor.getPortsInUse(server);
    
    logger.info(`📡 API: Returning ${portsInUse.length} ports`);
    
    // Check for port 80 in API response
    const port80 = portsInUse.find(p => p.port === 80);
    if (port80) {
      logger.info(`✅ API: Port 80 is in response: ${JSON.stringify(port80)}`);
    } else {
      logger.warn(`⚠️ API: Port 80 NOT in response`);
    }
    
    res.json({
      success: true,
      data: {
        ports: portsInUse,
        server,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get ports in use: ${error.message}`,
      500,
      'GET_PORTS_FAILED'
    );
  }
});

/**
 * @desc    Check port availability
 * @route   POST /api/v1/ports/check-availability
 * @access  Private
 */
const checkPortAvailability = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data using comprehensive validator
    const validationResult = DataValidator.validate(req.body, {
      ports: {
        required: true,
        type: 'array',
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Ports array is required and cannot be empty';
          }
          const invalidPorts = value.filter(port => 
            !Number.isInteger(port) || port < 1 || port > 65535
          );
          if (invalidPorts.length > 0) {
            return `Invalid port numbers: ${invalidPorts.join(', ')}`;
          }
          return true;
        }
      },
      protocol: {
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => (value || 'both').toLowerCase()
      },
      server: {
        type: 'string',
        sanitizer: (value) => (value || 'localhost').trim()
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const { ports, protocol, server } = validationResult.sanitizedData;

    // Execute port availability check with error handling
    const result = await errorHandler.executeWithRetry(
      async () => {
        return await PortMonitor.checkPortsAvailability(ports, protocol, server);
      },
      {
        context: {
          operation: 'port_availability_check',
          ports,
          protocol,
          server,
          userId: req.user?.id
        }
      }
    );
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_availability_check',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'CHECK_AVAILABILITY_FAILED',
      message: `Failed to check port availability: ${error.message}`
    });
  }
});

/**
 * @desc    Reserve ports for a container
 * @route   POST /api/v1/ports/reserve
 * @access  Private
 */
const reservePorts = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data using comprehensive validator
    const validationResult = DataValidator.validate(req.body, {
      ports: {
        required: true,
        type: 'array',
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Ports array is required and cannot be empty';
          }
          const invalidPorts = value.filter(port => 
            !Number.isInteger(port) || port < 1 || port > 65535
          );
          if (invalidPorts.length > 0) {
            return `Invalid port numbers: ${invalidPorts.join(', ')}`;
          }
          return true;
        }
      },
      containerId: {
        required: true,
        type: 'string',
        minLength: 1,
        sanitizer: (value) => value.trim()
      },
      protocol: {
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => (value || 'tcp').toLowerCase()
      },
      duration: {
        type: 'integer',
        min: 60, // Minimum 1 minute
        max: 31536000, // Maximum 1 year
        sanitizer: (value) => parseInt(value) || 3600
      },
      server: {
        type: 'string',
        sanitizer: (value) => (value || 'localhost').trim()
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const validatedData = validationResult.sanitizedData;
    
    // Add user info to metadata
    const metadata = {
      ...req.body.metadata,
      createdBy: req.user?.username || 'system',
      createdAt: new Date().toISOString()
    };

    // Execute port reservation with consistency checks and transaction management
    const result = await dataConsistencyService.executeWithConsistency(
      'port_reserve',
      async (transaction) => {
        return await PortMonitor.reservePorts({
          ...validatedData,
          metadata
        }, { transaction });
      },
      validatedData,
      {
        context: {
          userId: req.user?.id,
          operation: 'port_reservation',
          metadata
        }
      }
    );

    if (result.conflicts && result.conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'PORT_CONFLICTS',
        message: 'Some ports are already in use',
        data: {
          conflicts: result.conflicts,
          available: result.available || []
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Ports reserved successfully',
      data: result
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_reservation',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    if (error instanceof BusinessLogicError) {
      return res.status(409).json({
        success: false,
        error: 'BUSINESS_LOGIC_ERROR',
        message: error.message,
        context: error.context
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'PORT_RESERVATION_FAILED',
      message: `Failed to reserve ports: ${error.message}`
    });
  }
});

/**
 * @desc    Release port reservations
 * @route   DELETE /api/v1/ports/reserve
 * @access  Private
 */
const releasePorts = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data
    const validationResult = DataValidator.validate(req.body, {
      containerId: {
        required: true,
        type: 'string',
        minLength: 1,
        sanitizer: (value) => value.trim()
      },
      ports: {
        type: 'array',
        validator: (value) => {
          if (value && Array.isArray(value)) {
            const invalidPorts = value.filter(port => 
              !Number.isInteger(port) || port < 1 || port > 65535
            );
            if (invalidPorts.length > 0) {
              return `Invalid port numbers: ${invalidPorts.join(', ')}`;
            }
          }
          return true;
        }
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const { containerId, ports } = validationResult.sanitizedData;

    // Execute port release with consistency checks and transaction management
    const result = await dataConsistencyService.executeWithConsistency(
      'port_release',
      async (transaction) => {
        return await PortMonitor.releasePorts(containerId, ports, { transaction });
      },
      { containerId, ports },
      {
        context: {
          userId: req.user?.id,
          operation: 'port_release'
        }
      }
    );
    
    return res.json({
      success: true,
      message: 'Ports released successfully',
      data: result
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_release',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'PORT_RELEASE_FAILED',
      message: `Failed to release ports: ${error.message}`
    });
  }
});

/**
 * @desc    Update port documentation
 * @route   PUT /api/v1/ports/:port/documentation
 * @access  Private
 */
const updatePortDocumentation = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const port = parseInt(req.params.port);
  const { documentation, server = 'localhost' } = req.body;

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ApiError('Invalid port number', 400, 'INVALID_PORT');
  }

  try {
    await PortMonitor.updatePortDocumentation(port, documentation, server);
    
    res.json({
      success: true,
      message: 'Port documentation updated successfully'
    });
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'update_port_documentation',
      port,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      error: 'UPDATE_DOCUMENTATION_FAILED',
      message: `Failed to update documentation: ${error.message}`
    });
  }
});

/**
 * @desc    Update port service label
 * @route   PUT /api/v1/ports/:port/label
 * @access  Private
 */
const updatePortServiceLabel = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const port = parseInt(req.params.port);
  const { serviceLabel, server = 'localhost', protocol = 'tcp' } = req.body;

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ApiError('Invalid port number', 400, 'INVALID_PORT');
  }

  if (!serviceLabel || serviceLabel.trim().length === 0) {
    throw new ApiError('Service label is required', 400, 'MISSING_SERVICE_LABEL');
  }

  try {
    await PortMonitor.updatePortServiceLabel(port, serviceLabel.trim(), server, protocol);
    
    res.json({
      success: true,
      message: 'Port service label updated successfully'
    });
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'update_port_service_label',
      port,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      error: 'UPDATE_SERVICE_LABEL_FAILED',
      message: `Failed to update service label: ${error.message}`
    });
  }
});

/**
 * @desc    Suggest alternative ports
 * @route   POST /api/v1/ports/suggest-alternatives
 * @access  Private
 */
const suggestAlternativePorts = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data using comprehensive validator
    const validationResult = DataValidator.validate(req.body, {
      requestedPorts: {
        required: true,
        type: 'array',
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Requested ports array is required and cannot be empty';
          }
          const invalidPorts = value.filter(port => 
            !Number.isInteger(port) || port < 1 || port > 65535
          );
          if (invalidPorts.length > 0) {
            return `Invalid port numbers: ${invalidPorts.join(', ')}`;
          }
          return true;
        }
      },
      protocol: {
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => (value || 'tcp').toLowerCase()
      },
      serviceType: {
        type: 'string',
        sanitizer: (value) => (value || 'custom').toLowerCase().trim()
      },
      maxSuggestions: {
        type: 'integer',
        min: 1,
        max: 20,
        sanitizer: (value) => parseInt(value) || 5
      },
      server: {
        type: 'string',
        sanitizer: (value) => (value || 'localhost').trim()
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const { requestedPorts, protocol, serviceType, maxSuggestions, server } = validationResult.sanitizedData;

    logger.info(`📡 API: Suggest alternatives request:`, {
      ports: requestedPorts,
      protocol,
      serviceType,
      maxSuggestions
    });

    // Execute port suggestion with error handling and retry
    const suggestionsResult = await errorHandler.executeWithRetry(
      async () => {
        return await PortMonitor.suggestionEngine.suggestAlternativePorts({
          requestedPorts,
          protocol,
          maxSuggestions
        });
      },
      {
        context: {
          operation: 'port_suggestion',
          requestedPorts,
          protocol,
          serviceType,
          userId: req.user?.id
        }
      }
    );
    
    logger.info(`📡 API: Suggestions result:`, suggestionsResult);

    return res.json({
      success: true,
      message: 'Port alternatives suggested successfully',
      data: {
        suggestions: suggestionsResult || [],
        original: requestedPorts,
        protocol,
        serviceType,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_suggestion',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'SUGGEST_ALTERNATIVES_FAILED',
      message: `Failed to suggest alternatives: ${error.message}`
    });
  }
});

/**
 * @desc    Validate deployment configuration
 * @route   POST /api/v1/ports/validate-deployment
 * @access  Private
 */
const validateDeployment = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data using comprehensive validator
    const validationResult = DataValidator.validate(req.body, {
      ports: {
        required: true,
        type: 'array',
        validator: (value) => {
          if (!Array.isArray(value) || value.length === 0) {
            return 'Ports array is required and cannot be empty';
          }
          const invalidPorts = value.filter(port => 
            !Number.isInteger(port) || port < 1 || port > 65535
          );
          if (invalidPorts.length > 0) {
            return `Invalid port numbers: ${invalidPorts.join(', ')}`;
          }
          return true;
        }
      },
      containerId: {
        type: 'string',
        sanitizer: (value) => value ? value.trim() : value
      },
      containerName: {
        type: 'string',
        sanitizer: (value) => value ? value.trim() : value
      },
      serviceType: {
        type: 'string',
        sanitizer: (value) => value ? value.toLowerCase().trim() : 'custom'
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const deploymentConfig = validationResult.sanitizedData;

    // Execute deployment validation with consistency checks
    const validation = await dataConsistencyService.executeWithConsistency(
      'deployment_validate',
      async (transaction) => {
        return await PortMonitor.validateDeployment(deploymentConfig, { transaction });
      },
      deploymentConfig,
      {
        context: {
          userId: req.user?.id,
          operation: 'deployment_validation'
        },
        skipPostValidation: true // Validation operation doesn't modify data
      }
    );

    const statusCode = validation.isValid ? 200 : 409;

    res.status(statusCode).json({
      success: validation.isValid,
      data: validation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'deployment_validation',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'VALIDATE_DEPLOYMENT_FAILED',
      message: `Failed to validate deployment: ${error.message}`
    });
  }
});

/**
 * @desc    Get port monitoring statistics
 * @route   GET /api/v1/ports/statistics
 * @access  Private
 */
const getPortStatistics = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Execute statistics retrieval with error handling and caching
    const statistics = await errorHandler.executeWithRetry(
      async () => {
        return await PortMonitor.getStatistics();
      },
      {
        context: {
          operation: 'port_statistics',
          userId: req.user?.id
        }
      }
    );
    
    // Add consistency metrics if available
    const consistencyMetrics = dataConsistencyService.getMetrics();
    const enhancedStatistics = {
      ...statistics,
      consistency: {
        lastCheck: consistencyMetrics.lastCheck?.timestamp,
        rulesViolated: consistencyMetrics.rulesViolated,
        autoFixesApplied: consistencyMetrics.autoFixesApplied
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: enhancedStatistics
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_statistics',
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      error: 'GET_STATISTICS_FAILED',
      message: `Failed to get port statistics: ${error.message}`
    });
  }
});

/**
 * @desc    Get active port reservations
 * @route   GET /api/v1/ports/reservations
 * @access  Private
 */
const getPortReservations = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { containerId, ports } = req.query;

  try {
    const filters = {};
    
    if (containerId) {
      filters.containerId = containerId;
    }
    
    if (ports) {
      filters.ports = ports.split(',').map(p => parseInt(p)).filter(p => !isNaN(p));
    }

    const reservations = await PortMonitor.getReservations(filters);
    
    res.json({
      success: true,
      data: {
        reservations,
        count: reservations.length
      }
    });
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'get_port_reservations',
      query: req.query,
      userId: req.user?.id
    });
    
    return res.status(500).json({
      success: false,
      error: 'GET_RESERVATIONS_FAILED',
      message: `Failed to get reservations: ${error.message}`
    });
  }
});

/**
 * @desc    Get port recommendations
 * @route   POST /api/v1/ports/recommendations
 * @access  Private
 */
const getPortRecommendations = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    return res.apiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const {
    requestedPorts = [],
    serviceType = 'custom',
    protocol = 'tcp',
    preferredRange,
    containerName
  } = req.body;

  // Validate and normalize protocol
  if (!protocolHandler.isValidProtocol(protocol)) {
    return res.apiValidationError(['Protocol must be tcp, udp, or both']);
  }

  const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);

  try {
    const recommendations = await PortMonitor.getPortRecommendations({
      requestedPorts,
      serviceType,
      protocol: normalizedProtocol,
      preferredRange,
      containerName
    });

    return res.apiSuccess(recommendations, 'Port recommendations generated successfully');
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_recommendations',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'GET_RECOMMENDATIONS_FAILED',
      message: `Failed to get recommendations: ${error.message}`
    });
  }
});

/**
 * @desc    Scan port range for availability
 * @route   POST /api/v1/ports/scan-range
 * @access  Private
 */
const scanPortRange = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  try {
    // Validate input data using comprehensive validator
    const validationResult = DataValidator.validate(req.body, {
      startPort: {
        required: true,
        type: 'port',
        sanitizer: (value) => parseInt(value)
      },
      endPort: {
        required: true,
        type: 'port',
        sanitizer: (value) => parseInt(value)
      },
      protocol: {
        type: 'string',
        enum: ['tcp', 'udp', 'both'],
        sanitizer: (value) => (value || 'tcp').toLowerCase()
      },
      server: {
        type: 'string',
        sanitizer: (value) => (value || 'localhost').trim()
      }
    }, {
      // Custom validation for port range
      validator: (data) => {
        const { startPort, endPort } = data;
        if (startPort >= endPort) {
          return 'Start port must be less than end port';
        }
        if (endPort - startPort > 1000) {
          return 'Port range too large (max 1000 ports)';
        }
        return true;
      }
    });

    if (!validationResult.isValid) {
      throw new ValidationError(
        validationResult.errors.join(', '),
        null,
        'VALIDATION_FAILED'
      );
    }

    const { startPort, endPort, protocol, server } = validationResult.sanitizedData;

    // Execute port range scan with error handling
    const results = await errorHandler.executeWithRetry(
      async () => {
        return await PortMonitor.scanPortRange(startPort, endPort, protocol, server);
      },
      {
        context: {
          operation: 'port_range_scan',
          startPort,
          endPort,
          protocol,
          server,
          userId: req.user?.id
        },
        maxRetries: 1 // Reduce retries for potentially long-running operations
      }
    );
    
    const availablePorts = Object.entries(results)
      .filter(([_, available]) => available)
      .map(([port, _]) => parseInt(port));
    
    const summary = {
      totalPorts: endPort - startPort + 1,
      availablePorts: availablePorts.length,
      unavailablePorts: (endPort - startPort + 1) - availablePorts.length,
      availabilityPercentage: Math.round((availablePorts.length / (endPort - startPort + 1)) * 100)
    };

    return res.json({
      success: true,
      message: 'Port range scan completed successfully',
      data: {
        results,
        summary,
        metadata: {
          startPort,
          endPort,
          protocol,
          server,
          timestamp: new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    await errorHandler.handleError(error, {
      operation: 'port_range_scan',
      data: req.body,
      userId: req.user?.id
    });
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'PORT_SCAN_FAILED',
      message: `Failed to scan port range: ${error.message}`
    });
  }
});

module.exports = {
  getPortsInUse,
  checkPortAvailability,
  reservePorts,
  releasePorts,
  updatePortDocumentation,
  updatePortServiceLabel,
  suggestAlternativePorts,
  validateDeployment,
  getPortStatistics,
  getPortReservations,
  getPortRecommendations,
  scanPortRange
};