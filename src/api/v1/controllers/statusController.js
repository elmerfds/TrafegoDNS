/**
 * Status controller
 * Handles system status and metric endpoints
 */
const asyncHandler = require('express-async-handler');
const os = require('os');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

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

module.exports = {
  getStatus,
  getMetrics,
  getLogs
};