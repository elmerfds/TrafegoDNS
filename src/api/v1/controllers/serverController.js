/**
 * Server Controller
 * Handles server management API requests
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

/**
 * @desc    Get all configured servers
 * @route   GET /api/v1/servers
 * @access  Private
 */
const getServers = asyncHandler(async (req, res) => {
  try {
    const { database } = global.services || {};
    
    if (!database?.repositories?.server) {
      // If no database repository, return default host server only
      return res.json({
        success: true,
        data: {
          servers: [
            {
              id: 'host',
              name: 'Host Server',
              ip: process.env.HOST_IP || process.env.DOCKER_HOST_IP || 'localhost',
              isHost: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        }
      });
    }

    const servers = await database.repositories.server.findAll();
    
    // Always include the host server
    const hostServer = {
      id: 'host',
      name: 'Host Server',
      ip: process.env.HOST_IP || process.env.DOCKER_HOST_IP || 'localhost',
      isHost: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Get host IP from config if available
    try {
      const { ConfigManager } = global.services || {};
      if (ConfigManager) {
        const config = ConfigManager.getConfig();
        if (config.hostIp) {
          hostServer.ip = config.hostIp;
        }
      }
    } catch (configError) {
      logger.debug(`Could not get host IP from config: ${configError.message}`);
    }

    const allServers = [hostServer, ...servers];

    res.json({
      success: true,
      data: {
        servers: allServers
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get servers: ${error.message}`,
      500,
      'GET_SERVERS_FAILED'
    );
  }
});

/**
 * @desc    Create a new server
 * @route   POST /api/v1/servers
 * @access  Private
 */
const createServer = asyncHandler(async (req, res) => {
  const { name, ip, description } = req.body;

  if (!name || !ip) {
    throw new ApiError('Name and IP are required', 400, 'MISSING_REQUIRED_FIELDS');
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^host\.docker\.internal$/;
  if (!ipRegex.test(ip.trim())) {
    throw new ApiError('Invalid IP address format', 400, 'INVALID_IP_FORMAT');
  }

  try {
    const { database } = global.services || {};
    
    if (!database?.repositories?.server) {
      throw new ApiError('Server management not available', 500, 'SERVER_MANAGEMENT_UNAVAILABLE');
    }

    // Check if server with same name or IP already exists
    const existingServers = await database.repositories.server.findAll();
    const existingServer = existingServers.find(s => 
      s.name.toLowerCase() === name.trim().toLowerCase() || 
      s.ip === ip.trim()
    );

    if (existingServer) {
      throw new ApiError('A server with this name or IP already exists', 409, 'SERVER_ALREADY_EXISTS');
    }

    const server = await database.repositories.server.create({
      name: name.trim(),
      ip: ip.trim(),
      description: description?.trim() || null,
      isHost: false,
      createdBy: req.user?.username || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    logger.info(`Created new server: ${server.name} (${server.ip})`);

    res.status(201).json({
      success: true,
      data: {
        server
      },
      message: 'Server created successfully'
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to create server: ${error.message}`,
      500,
      'CREATE_SERVER_FAILED'
    );
  }
});

/**
 * @desc    Update a server
 * @route   PUT /api/v1/servers/:id
 * @access  Private
 */
const updateServer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, ip, description } = req.body;

  if (!name || !ip) {
    throw new ApiError('Name and IP are required', 400, 'MISSING_REQUIRED_FIELDS');
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^host\.docker\.internal$/;
  if (!ipRegex.test(ip.trim())) {
    throw new ApiError('Invalid IP address format', 400, 'INVALID_IP_FORMAT');
  }

  try {
    const { database } = global.services || {};
    
    if (!database?.repositories?.server) {
      throw new ApiError('Server management not available', 500, 'SERVER_MANAGEMENT_UNAVAILABLE');
    }

    // Don't allow updating the host server via this endpoint
    if (id === 'host') {
      throw new ApiError('Cannot update host server via this endpoint', 400, 'CANNOT_UPDATE_HOST_SERVER');
    }

    const server = await database.repositories.server.findById(id);
    if (!server) {
      throw new ApiError('Server not found', 404, 'SERVER_NOT_FOUND');
    }

    // Check if another server with same name or IP already exists (excluding current server)
    const existingServers = await database.repositories.server.findAll();
    const existingServer = existingServers.find(s => 
      s.id !== id && (
        s.name.toLowerCase() === name.trim().toLowerCase() || 
        s.ip === ip.trim()
      )
    );

    if (existingServer) {
      throw new ApiError('A server with this name or IP already exists', 409, 'SERVER_ALREADY_EXISTS');
    }

    const updatedServer = await database.repositories.server.update(id, {
      name: name.trim(),
      ip: ip.trim(),
      description: description?.trim() || null,
      updatedBy: req.user?.username || 'system',
      updatedAt: new Date().toISOString()
    });

    logger.info(`Updated server: ${updatedServer.name} (${updatedServer.ip})`);

    res.json({
      success: true,
      data: {
        server: updatedServer
      },
      message: 'Server updated successfully'
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to update server: ${error.message}`,
      500,
      'UPDATE_SERVER_FAILED'
    );
  }
});

/**
 * @desc    Delete a server
 * @route   DELETE /api/v1/servers/:id
 * @access  Private
 */
const deleteServer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Don't allow deleting the host server
  if (id === 'host') {
    throw new ApiError('Cannot delete the host server', 400, 'CANNOT_DELETE_HOST_SERVER');
  }

  try {
    const { database } = global.services || {};
    
    if (!database?.repositories?.server) {
      throw new ApiError('Server management not available', 500, 'SERVER_MANAGEMENT_UNAVAILABLE');
    }

    const server = await database.repositories.server.findById(id);
    if (!server) {
      throw new ApiError('Server not found', 404, 'SERVER_NOT_FOUND');
    }

    await database.repositories.server.delete(id);

    logger.info(`Deleted server: ${server.name} (${server.ip})`);

    res.json({
      success: true,
      message: 'Server deleted successfully'
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to delete server: ${error.message}`,
      500,
      'DELETE_SERVER_FAILED'
    );
  }
});

/**
 * @desc    Test server connectivity
 * @route   POST /api/v1/servers/test
 * @access  Private
 */
const testServerConnectivity = asyncHandler(async (req, res) => {
  const { ip, ports = [22, 80, 443] } = req.body;

  if (!ip) {
    throw new ApiError('IP address is required', 400, 'MISSING_IP');
  }

  // Validate IP format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$|^host\.docker\.internal$/;
  if (!ipRegex.test(ip.trim())) {
    throw new ApiError('Invalid IP address format', 400, 'INVALID_IP_FORMAT');
  }

  try {
    const { PortMonitor } = global.services || {};
    
    if (!PortMonitor) {
      throw new ApiError('Port monitor not available', 500, 'PORT_MONITOR_UNAVAILABLE');
    }

    const results = {};
    for (const port of ports) {
      try {
        const available = await PortMonitor.availabilityChecker.checkPort(port, 'tcp', ip.trim());
        results[port] = {
          reachable: !available, // If port check fails, it means we can't reach it
          available: available
        };
      } catch (error) {
        results[port] = {
          reachable: false,
          available: false,
          error: error.message
        };
      }
    }

    const reachablePorts = Object.values(results).filter(r => r.reachable).length;
    const isReachable = reachablePorts > 0;

    res.json({
      success: true,
      data: {
        ip: ip.trim(),
        isReachable,
        reachablePorts,
        totalPorts: ports.length,
        results
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to test server connectivity: ${error.message}`,
      500,
      'TEST_CONNECTIVITY_FAILED'
    );
  }
});

module.exports = {
  getServers,
  createServer,
  updateServer,
  deleteServer,
  testServerConnectivity
};