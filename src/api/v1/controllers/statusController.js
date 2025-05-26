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
  
  // Get configuration values
  const { ConfigManager } = global.services || {};
  const packageJson = require('../../../../package.json');
  
  // Basic status info
  const status = {
    version: packageJson.version || process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    hostname: os.hostname(),
    services: {}
  };
  
  // Add DNS provider status if available
  if (DNSManager && DNSManager.dnsProvider) {
    status.services.dnsProvider = {
      type: DNSManager.config.dnsProvider || ConfigManager?.dnsProvider,
      domain: DNSManager.config.domain || ConfigManager?.domain,
      status: 'active'
    };
  } else if (ConfigManager) {
    status.services.dnsProvider = {
      type: ConfigManager.dnsProvider,
      domain: ConfigManager.domain,
      status: 'inactive'
    };
  }
  
  // Add Docker monitor status if available
  if (DockerMonitor) {
    try {
      let dockerConnected = false;
      // Try different ways to check connection
      if (typeof DockerMonitor.testConnection === 'function') {
        dockerConnected = await DockerMonitor.testConnection();
      } else if (DockerMonitor.docker) {
        // Try to ping Docker
        try {
          await DockerMonitor.docker.ping();
          dockerConnected = true;
        } catch {
          dockerConnected = false;
        }
      }
      
      status.services.dockerMonitor = {
        status: dockerConnected ? 'connected' : 'disconnected',
        socketPath: DockerMonitor.config?.dockerSocket || ConfigManager?.dockerSocket || '/var/run/docker.sock'
      };
    } catch (error) {
      status.services.dockerMonitor = {
        status: 'error',
        error: error.message
      };
    }
  }
  
  // Add operation mode
  if (ConfigManager) {
    status.operationMode = ConfigManager.operationMode;
  } else if (global.config) {
    status.operationMode = global.config.operationMode;
  }
  
  // Add statistics
  try {
    const { database } = require('../../../database');
    let dnsRecordCount = 0;
    let containerCount = 0;
    let hostnameCount = 0;
    
    // Try to get DNS record count from managed records (app-managed records)
    if (database && database.repositories && database.repositories.dnsManager) {
      try {
        // Count non-orphaned, app-managed records
        if (database.repositories.dnsManager.managedRecords) {
          dnsRecordCount = await database.repositories.dnsManager.managedRecords.count({ is_orphaned: 0 });
        }
      } catch (e) {
        logger.debug(`Failed to get DNS record count from managed records: ${e.message}`);
        // Fallback to provider cache (all records)
        if (database.repositories.dnsManager.providerCache) {
          try {
            dnsRecordCount = await database.repositories.dnsManager.providerCache.count();
          } catch (e2) {
            logger.debug(`Failed to get DNS record count from provider cache: ${e2.message}`);
          }
        }
      }
    }
    
    // Try to get container count
    if (DockerMonitor) {
      try {
        // Check if containerTracker exists (new architecture)
        if (DockerMonitor.containerTracker && DockerMonitor.containerTracker.containerIdToName) {
          containerCount = DockerMonitor.containerTracker.containerIdToName.size || 0;
        } else if (DockerMonitor.containerIds) {
          // Fallback to containerIds
          containerCount = DockerMonitor.containerIds.size || 0;
        } else if (typeof DockerMonitor.getContainerCount === 'function') {
          // Fallback to method
          containerCount = await DockerMonitor.getContainerCount();
        } else if (DockerMonitor.containers) {
          // Fallback to containers map
          containerCount = DockerMonitor.containers.size || 0;
        }
      } catch (e) {
        logger.debug(`Failed to get container count: ${e.message}`);
      }
    }
    
    // Try to get hostname count from database
    if (database && database.repositories && database.repositories.dnsManager) {
      try {
        // Get unique managed hostnames from database
        if (database.repositories.dnsManager.managedRecords) {
          const managedRecords = await database.repositories.dnsManager.managedRecords.findAll();
          const uniqueHostnames = new Set();
          
          if (managedRecords && Array.isArray(managedRecords)) {
            managedRecords.forEach(record => {
              if (record.name && !record.is_orphaned) {
                uniqueHostnames.add(record.name);
              }
            });
          }
          
          hostnameCount = uniqueHostnames.size;
          
          // Also try to add preserved hostnames if available
          if (DNSManager && DNSManager.recordTracker && Array.isArray(DNSManager.recordTracker.preservedHostnames)) {
            hostnameCount += DNSManager.recordTracker.preservedHostnames.length;
          }
        }
      } catch (e) {
        logger.debug(`Failed to get hostname count from database: ${e.message}`);
        
        // Fallback to simple count
        if (database.repositories.dnsManager.managedRecords) {
          try {
            hostnameCount = await database.repositories.dnsManager.managedRecords.count();
          } catch (e2) {
            logger.debug(`Failed to get hostname count from database: ${e2.message}`);
          }
        }
      }
    }
    
    status.statistics = {
      totalRecords: dnsRecordCount || 0,
      totalContainers: containerCount || 0,
      totalHostnames: hostnameCount || 0
    };
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