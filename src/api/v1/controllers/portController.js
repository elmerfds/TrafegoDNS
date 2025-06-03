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
      data: result,
      meta: {
        requestedPorts: ports,
        protocol,
        server,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to check port availability: ${error.message}`,
      500,
      'PORT_CHECK_FAILED'
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
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { 
    ports, 
    containerId, 
    protocol = 'tcp', 
    duration = 3600,
    metadata = {},
    server = 'localhost'
  } = req.body;

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  if (!containerId) {
    throw new ApiError('Container ID is required', 400, 'MISSING_CONTAINER_ID');
  }

  // Add user info to metadata
  metadata.createdBy = req.user?.username || 'system';
  metadata.createdAt = new Date().toISOString();

  try {
    const result = await PortMonitor.reservePorts({
      ports,
      containerId,
      protocol,
      duration,
      metadata,
      server
    });

    if (result.conflicts && result.conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        code: 'PORT_CONFLICTS',
        message: 'Some ports are already in use',
        data: result
      });
    }

    res.status(201).json({
      success: true,
      data: result,
      message: 'Ports reserved successfully'
    });
  } catch (error) {
    throw new ApiError(
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
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { ports, containerId } = req.body;

  if (!containerId) {
    throw new ApiError('Container ID is required', 400, 'MISSING_CONTAINER_ID');
  }

  try {
    const result = await PortMonitor.releasePorts(containerId, ports);
    
    res.json({
      success: true,
      data: result,
      message: 'Ports released successfully'
    });
  } catch (error) {
    throw new ApiError(
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
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const {
    ports,
    protocol = 'both',
    serviceType = 'custom',
    maxSuggestions = 5,
    server = 'localhost'
  } = req.body;

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  try {
    const suggestions = await PortMonitor.suggestAlternativePorts({
      ports,
      protocol,
      serviceType,
      maxSuggestions,
      server
    });

    res.json({
      success: true,
      data: {
        suggestions
      }
    });
  } catch (error) {
    throw new ApiError(
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
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const {
    requestedPorts = [],
    serviceType = 'custom',
    protocol = 'tcp',
    preferredRange,
    containerName
  } = req.body;

  try {
    const recommendations = await PortMonitor.getPortRecommendations({
      requestedPorts,
      serviceType,
      protocol,
      preferredRange,
      containerName
    });

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    throw new ApiError(
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
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const { startPort, endPort, protocol = 'tcp', server = 'localhost' } = req.body;

  if (!startPort || !endPort) {
    throw new ApiError('Start and end ports are required', 400, 'MISSING_PORT_RANGE');
  }

  if (startPort < 1 || endPort > 65535 || startPort >= endPort) {
    throw new ApiError('Invalid port range', 400, 'INVALID_PORT_RANGE');
  }

  if (endPort - startPort > 1000) {
    throw new ApiError('Port range too large (max 1000 ports)', 400, 'PORT_RANGE_TOO_LARGE');
  }

  try {
    const results = await PortMonitor.scanPortRange(startPort, endPort, protocol, server);
    const availablePorts = Object.entries(results)
      .filter(([_, available]) => available)
      .map(([port, _]) => parseInt(port));
    
    const summary = {
      totalPorts: endPort - startPort + 1,
      availablePorts: availablePorts.length,
      unavailablePorts: (endPort - startPort + 1) - availablePorts.length,
      availabilityPercentage: Math.round((availablePorts.length / (endPort - startPort + 1)) * 100)
    };

    res.json({
      success: true,
      data: {
        results,
        summary
      },
      meta: {
        startPort,
        endPort,
        protocol,
        server,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
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