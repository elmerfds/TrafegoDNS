/**
 * Port Controller
 * Handles port-related API requests
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');

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

  const { ports, protocol = 'tcp' } = req.body;

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

  if (!['tcp', 'udp'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp or udp', 400, 'INVALID_PROTOCOL');
  }

  try {
    const result = await PortMonitor.checkPortsAvailability(ports, protocol);
    
    res.json({
      success: true,
      data: result,
      meta: {
        requestedPorts: ports,
        protocol,
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
 * @desc    Reserve ports
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
    metadata = {} 
  } = req.body;

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  if (!containerId) {
    throw new ApiError('Container ID is required', 400, 'MISSING_CONTAINER_ID');
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

  if (!['tcp', 'udp'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp or udp', 400, 'INVALID_PROTOCOL');
  }

  if (!Number.isInteger(duration) || duration < 60 || duration > 86400) {
    throw new ApiError('Duration must be between 60 and 86400 seconds', 400, 'INVALID_DURATION');
  }

  try {
    const result = await PortMonitor.reservePorts(ports, containerId, {
      protocol,
      duration,
      metadata: {
        ...metadata,
        requestedBy: req.user?.id || 'api',
        requestedAt: new Date().toISOString()
      }
    });

    if (!result.success) {
      return res.status(409).json({
        success: false,
        error: 'Port conflicts detected',
        data: {
          conflicts: result.conflicts,
          suggestions: result.suggestions
        },
        meta: {
          requestedPorts: ports,
          containerId,
          protocol,
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(201).json({
      success: true,
      data: result,
      meta: {
        requestedPorts: ports,
        containerId,
        protocol,
        duration,
        timestamp: new Date().toISOString()
      }
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

  if (!ports || !Array.isArray(ports) || ports.length === 0) {
    throw new ApiError('Ports array is required', 400, 'INVALID_PORTS');
  }

  if (!containerId) {
    throw new ApiError('Container ID is required', 400, 'MISSING_CONTAINER_ID');
  }

  try {
    const result = await PortMonitor.releasePorts(ports, containerId);
    
    res.json({
      success: true,
      data: result,
      meta: {
        releasedPorts: ports,
        containerId,
        timestamp: new Date().toISOString()
      }
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
    protocol = 'tcp',
    serviceType,
    maxSuggestions = 10,
    nearbyRange = 100,
    preferSequential = true
  } = req.body;

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

  if (!['tcp', 'udp'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp or udp', 400, 'INVALID_PROTOCOL');
  }

  try {
    const result = await PortMonitor.suggestAlternativePorts(ports, protocol, {
      maxSuggestions,
      nearbyRange,
      preferSequential,
      serviceType
    });
    
    res.json({
      success: true,
      data: result,
      meta: {
        originalPorts: ports,
        protocol,
        serviceType,
        options: {
          maxSuggestions,
          nearbyRange,
          preferSequential
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to suggest alternative ports: ${error.message}`,
      500,
      'PORT_SUGGESTION_FAILED'
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

  const deploymentConfig = req.body;

  if (!deploymentConfig || typeof deploymentConfig !== 'object') {
    throw new ApiError('Deployment configuration is required', 400, 'INVALID_DEPLOYMENT_CONFIG');
  }

  const { ports = [], containerId, protocol = 'tcp' } = deploymentConfig;

  if (ports.length > 0) {
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
  }

  if (!['tcp', 'udp'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp or udp', 400, 'INVALID_PROTOCOL');
  }

  try {
    const result = await PortMonitor.validateDeployment(deploymentConfig);
    
    const statusCode = result.valid ? 200 : 409;
    
    res.status(statusCode).json({
      success: true,
      data: result,
      meta: {
        deploymentConfig,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to validate deployment: ${error.message}`,
      500,
      'DEPLOYMENT_VALIDATION_FAILED'
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
      data: statistics,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get port statistics: ${error.message}`,
      500,
      'STATISTICS_FAILED'
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
  
  let portsList = [];
  if (ports) {
    try {
      portsList = ports.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    } catch (error) {
      throw new ApiError('Invalid ports format', 400, 'INVALID_PORTS_FORMAT');
    }
  }

  try {
    let reservations;
    
    if (containerId) {
      reservations = await PortMonitor.reservationManager.getContainerReservations(containerId, true);
    } else {
      reservations = await PortMonitor.reservationManager.getActiveReservations(portsList);
    }
    
    res.json({
      success: true,
      data: {
        reservations,
        count: reservations.length
      },
      meta: {
        containerId: containerId || null,
        ports: portsList.length > 0 ? portsList : null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get port reservations: ${error.message}`,
      500,
      'RESERVATIONS_FETCH_FAILED'
    );
  }
});

/**
 * @desc    Get port recommendations for a service
 * @route   POST /api/v1/ports/recommendations
 * @access  Private
 */
const getPortRecommendations = asyncHandler(async (req, res) => {
  const { PortMonitor } = global.services || {};
  
  if (!PortMonitor) {
    throw new ApiError('Port monitor not initialized', 500, 'PORT_MONITOR_NOT_INITIALIZED');
  }

  const deploymentInfo = req.body;

  if (!deploymentInfo || typeof deploymentInfo !== 'object') {
    throw new ApiError('Deployment information is required', 400, 'INVALID_DEPLOYMENT_INFO');
  }

  try {
    const recommendations = await PortMonitor.suggestionEngine.getPortRecommendations(deploymentInfo);
    
    res.json({
      success: true,
      data: recommendations,
      meta: {
        deploymentInfo,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get port recommendations: ${error.message}`,
      500,
      'RECOMMENDATIONS_FAILED'
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

  const { startPort, endPort, protocol = 'tcp' } = req.body;

  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    throw new ApiError('Invalid start port', 400, 'INVALID_START_PORT');
  }

  if (!Number.isInteger(endPort) || endPort < 1 || endPort > 65535) {
    throw new ApiError('Invalid end port', 400, 'INVALID_END_PORT');
  }

  if (startPort > endPort) {
    throw new ApiError('Start port must be less than or equal to end port', 400, 'INVALID_PORT_RANGE');
  }

  if (endPort - startPort > 1000) {
    throw new ApiError('Port range too large (maximum 1000 ports)', 400, 'RANGE_TOO_LARGE');
  }

  if (!['tcp', 'udp'].includes(protocol)) {
    throw new ApiError('Protocol must be tcp or udp', 400, 'INVALID_PROTOCOL');
  }

  try {
    const results = await PortMonitor.availabilityChecker.scanPortRange(
      startPort, 
      endPort, 
      protocol
    );
    
    const summary = {
      totalPorts: endPort - startPort + 1,
      availablePorts: Object.values(results).filter(available => available).length,
      unavailablePorts: Object.values(results).filter(available => !available).length,
      availabilityPercentage: Math.round(
        (Object.values(results).filter(available => available).length / 
         (endPort - startPort + 1)) * 100
      )
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
  checkPortAvailability,
  reservePorts,
  releasePorts,
  suggestAlternativePorts,
  validateDeployment,
  getPortStatistics,
  getPortReservations,
  getPortRecommendations,
  scanPortRange
};