/**
 * Port Controller
 * Handles port-related API requests
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

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

  const { ports, protocol = 'both', server = 'localhost' } = req.body;

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  // Validate port numbers
  const invalidPorts = ports.filter(port => 
    !Number.isInteger(port) || port < 1 || port > 65535
  );

  if (invalidPorts.length > 0) {
    throw new ApiError(
      `Invalid port numbers: ${invalidPorts.join(', ')}`, 
      400, 
      'INVALID_PORT_NUMBERS'
    );
  }

  if (!['tcp', 'udp', 'both'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp, udp, or both', 400, 'INVALID_PROTOCOL');
  }

  try {
    const result = await PortMonitor.checkPortsAvailability(ports, protocol, server);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to check port availability:', error);
    return res.apiError(
      `Failed to check port availability: ${error.message}`,
      500,
      'CHECK_AVAILABILITY_FAILED'
    );
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
    return res.apiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { 
    ports, 
    containerId, 
    protocol = 'tcp', 
    duration = 3600,
    metadata = {},
    server = 'localhost'
  } = req.body;

  // Validation
  const errors = [];
  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    errors.push('Ports array is required');
  }
  if (!containerId) {
    errors.push('Container ID is required');
  }
  if (!protocolHandler.isValidProtocol(protocol)) {
    errors.push('Protocol must be tcp, udp, or both');
  }

  if (errors.length > 0) {
    return res.apiValidationError(errors);
  }

  // Normalize protocol
  const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);

  // Add user info to metadata
  metadata.createdBy = req.user?.username || 'system';
  metadata.createdAt = new Date().toISOString();

  try {
    const result = await PortMonitor.reservePorts({
      ports,
      containerId,
      protocol: normalizedProtocol,
      duration,
      metadata,
      server
    });

    if (result.conflicts && result.conflicts.length > 0) {
      return res.apiConflict('Some ports are already in use', {
        conflicts: result.conflicts,
        available: result.available || []
      });
    }

    return res.status(201).json(
      ApiResponse.success(result, 'Ports reserved successfully')
    );
  } catch (error) {
    logger.error('Failed to reserve ports:', error);
    return res.apiError(
      `Failed to reserve ports: ${error.message}`,
      500,
      'PORT_RESERVATION_FAILED'
    );
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
    return res.apiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { ports, containerId } = req.body;

  if (!containerId) {
    return res.apiValidationError(['Container ID is required']);
  }

  try {
    const result = await PortMonitor.releasePorts(containerId, ports);
    
    return res.apiSuccess(result, 'Ports released successfully');
  } catch (error) {
    logger.error('Failed to release ports:', error);
    return res.apiError(
      `Failed to release ports: ${error.message}`,
      500,
      'PORT_RELEASE_FAILED'
    );
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
    throw new ApiError(
      `Failed to update documentation: ${error.message}`,
      500,
      'UPDATE_DOCUMENTATION_FAILED'
    );
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
    throw new ApiError(
      `Failed to update service label: ${error.message}`,
      500,
      'UPDATE_SERVICE_LABEL_FAILED'
    );
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
    return res.apiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const {
    requestedPorts: ports,
    protocol = 'tcp',
    serviceType = 'custom',
    maxSuggestions = 5,
    server = 'localhost'
  } = req.body;

  logger.info(`📡 API: Suggest alternatives request: ports=${JSON.stringify(ports)}, protocol=${protocol}, serviceType=${serviceType}`);

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    return res.apiValidationError(['Ports array is required']);
  }

  // Validate and normalize protocol
  if (!protocolHandler.isValidProtocol(protocol)) {
    return res.apiValidationError(['Protocol must be tcp, udp, or both']);
  }

  const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);

  try {
    // Use the standardized method signature
    const suggestionsResult = await PortMonitor.suggestionEngine.suggestAlternativePorts({
      requestedPorts: ports,
      protocol: normalizedProtocol,
      maxSuggestions
    });
    
    logger.info(`📡 API: Suggestions result:`, JSON.stringify(suggestionsResult));

    return res.apiSuccess({
      suggestions: suggestionsResult || [],
      original: ports,
      protocol: normalizedProtocol,
      serviceType,
      timestamp: new Date().toISOString()
    }, 'Port alternatives suggested successfully');
  } catch (error) {
    logger.error('Failed to suggest alternatives:', error);
    return res.apiError(
      `Failed to suggest alternatives: ${error.message}`,
      500,
      'SUGGEST_ALTERNATIVES_FAILED'
    );
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

  const { ports, containerId, containerName, serviceType } = req.body;

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  try {
    const validation = await PortMonitor.validateDeployment({
      ports,
      containerId,
      containerName,
      serviceType
    });

    const statusCode = validation.isValid ? 200 : 409;

    res.status(statusCode).json({
      success: validation.isValid,
      data: validation
    });
  } catch (error) {
    throw new ApiError(
      `Failed to validate deployment: ${error.message}`,
      500,
      'VALIDATE_DEPLOYMENT_FAILED'
    );
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
    const statistics = await PortMonitor.getStatistics();
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get port statistics: ${error.message}`,
      500,
      'GET_STATISTICS_FAILED'
    );
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
    throw new ApiError(
      `Failed to get reservations: ${error.message}`,
      500,
      'GET_RESERVATIONS_FAILED'
    );
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
    logger.error('Failed to get recommendations:', error);
    return res.apiError(
      `Failed to get recommendations: ${error.message}`,
      500,
      'GET_RECOMMENDATIONS_FAILED'
    );
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
    return res.apiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { startPort, endPort, protocol = 'tcp', server = 'localhost' } = req.body;

  // Validation
  const errors = [];
  if (!startPort || !endPort) {
    errors.push('Start and end ports are required');
  }
  if (startPort < 1 || endPort > 65535 || startPort >= endPort) {
    errors.push('Invalid port range');
  }
  if (endPort - startPort > 1000) {
    errors.push('Port range too large (max 1000 ports)');
  }
  if (!protocolHandler.isValidProtocol(protocol)) {
    errors.push('Protocol must be tcp, udp, or both');
  }

  if (errors.length > 0) {
    return res.apiValidationError(errors);
  }

  const normalizedProtocol = protocolHandler.normalizeProtocol(protocol);

  try {
    const results = await PortMonitor.scanPortRange(startPort, endPort, normalizedProtocol, server);
    const availablePorts = Object.entries(results)
      .filter(([_, available]) => available)
      .map(([port, _]) => parseInt(port));
    
    const summary = {
      totalPorts: endPort - startPort + 1,
      availablePorts: availablePorts.length,
      unavailablePorts: (endPort - startPort + 1) - availablePorts.length,
      availabilityPercentage: Math.round((availablePorts.length / (endPort - startPort + 1)) * 100)
    };

    return res.apiSuccess({
      results,
      summary
    }, 'Port range scan completed successfully', {
      startPort,
      endPort,
      protocol: normalizedProtocol,
      server,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to scan port range:', error);
    return res.apiError(
      `Failed to scan port range: ${error.message}`,
      500,
      'PORT_SCAN_FAILED'
    );
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