/**
 * Status controller
 * Handles system status and metric endpoints
 */
const asyncHandler = require('express-async-handler');
const os = require('os');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');
const EnvironmentLoader = require('../../../config/EnvironmentLoader');

/**
 * @desc    Get system status
 * @route   GET /api/v1/status
 * @access  Private
 */
const getStatus = asyncHandler(async (req, res) => {
  // Get references to main services
  const { DNSManager, DockerMonitor } = global.services || {};
  
  // Basic status info
  const status = {
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    hostname: os.hostname(),
    services: {}
  };
  
  // Add DNS provider status if available
  if (DNSManager && DNSManager.dnsProvider) {
    status.services.dnsProvider = {
      type: DNSManager.config.dnsProvider,
      domain: DNSManager.config.getProviderDomain(),
      status: 'active'
    };
  }
  
  // Add Docker monitor status if available
  if (DockerMonitor) {
    try {
      const dockerConnected = await DockerMonitor.testConnection();
      status.services.dockerMonitor = {
        status: dockerConnected ? 'connected' : 'disconnected',
        socketPath: DockerMonitor.config.dockerSocket
      };
    } catch (error) {
      status.services.dockerMonitor = {
        status: 'error',
        error: error.message
      };
    }
  }
  
  // Add operation mode
  if (global.config) {
    status.operationMode = global.config.operationMode;
  }
  
  // Add statistics
  try {
    const database = require('../../../database');
    if (database && database.repositories) {
      const dnsRecordCount = await database.repositories.dnsRecord.count();
      const containerCount = DockerMonitor ? await DockerMonitor.getContainerCount() : 0;
      const hostnameCount = await database.repositories.managedRecords.count();
      
      status.statistics = {
        totalRecords: dnsRecordCount || 0,
        totalContainers: containerCount || 0,
        totalHostnames: hostnameCount || 0
      };
    }
  } catch (error) {
    logger.warn(`Failed to get statistics: ${error.message}`);
    status.statistics = {
      totalRecords: 0,
      totalContainers: 0,
      totalHostnames: 0
    };
  }
  
  // Add basic health status
  status.healthy = true;
  status.mode = status.operationMode;
  status.provider = status.services?.dnsProvider?.type || 'Unknown';
  
  res.json({
    status: 'success',
    data: status
  });
});

/**
 * @desc    Get system metrics
 * @route   GET /api/v1/status/metrics
 * @access  Private
 */
const getMetrics = asyncHandler(async (req, res) => {
  // System metrics
  const metrics = {
    system: {
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      cpu: {
        cores: os.cpus().length,
        load: os.loadavg()
      },
      uptime: os.uptime()
    },
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };
  
  // Add DNS metrics if available
  if (global.dnsStats) {
    metrics.dns = global.dnsStats;
  }
  
  res.json({
    status: 'success',
    data: metrics
  });
});

/**
 * @desc    Get recent logs
 * @route   GET /api/v1/status/logs
 * @access  Private
 */
const getLogs = asyncHandler(async (req, res) => {
  // This is a placeholder - in a real implementation,
  // we would integrate with the actual logging system
  res.json({
    status: 'success',
    message: 'Log retrieval not implemented yet',
    data: {
      logs: [] // Empty for now
    }
  });
});

/**
 * @desc    Get environment variables for debugging (only in development)
 * @route   GET /api/v1/status/env
 * @access  Private/Admin
 */
const getEnvironment = asyncHandler(async (req, res) => {
  // Allow in development mode or if explicitly enabled
  const showEnvVars = EnvironmentLoader.isEnabled('DEBUG_MODE') ||
                      process.env.NODE_ENV === 'development';

  if (!showEnvVars) {
    return res.json({
      status: 'error',
      message: 'Environment variables are only available in development mode or with DEBUG_MODE=true'
    });
  }

  // Include only relevant, non-sensitive variables
  const safeVars = [
    'NODE_ENV',
    'ENABLE_SWAGGER',
    'USE_API_MODE',
    'API_PORT',
    'API_ONLY',
    'LOCAL_AUTH_BYPASS',
    'LOG_LEVEL',
    'OPERATION_MODE',
    'DNS_PROVIDER',
    'DEBUG_MODE'
  ];

  // Use EnvironmentLoader to get debug info
  const envVars = EnvironmentLoader.getDebugInfo(safeVars);

  // Add helper variables with processed values
  const processedValues = {
    // Add boolean interpretation of key variables
    SWAGGER_ENABLED: EnvironmentLoader.isEnabled('ENABLE_SWAGGER'),
    API_ENABLED: EnvironmentLoader.isEnabled('USE_API_MODE'),
    DEBUG_ENABLED: EnvironmentLoader.isEnabled('DEBUG_MODE'),
    LOCAL_BYPASS_ENABLED: EnvironmentLoader.isEnabled('LOCAL_AUTH_BYPASS')
  };

  res.json({
    status: 'success',
    data: {
      environment: envVars,
      processedValues
    }
  });
});

module.exports = {
  getStatus,
  getMetrics,
  getLogs,
  getEnvironment
};