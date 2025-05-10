/**
 * Configuration Controller
 * Handles application configuration settings
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../utils/apiError');

/**
 * @desc    Get application configuration
 * @route   GET /api/v1/config
 * @access  Private/Admin
 */
const getConfig = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get current configuration
    const config = ConfigManager.getConfig();
    
    // Filter out sensitive information
    const safeConfig = {
      // Application settings
      operationMode: config.operationMode,
      pollInterval: config.pollInterval,
      watchDockerEvents: config.watchDockerEvents,
      cleanupOrphaned: config.cleanupOrphaned,
      cleanupGracePeriod: config.cleanupGracePeriod,
      
      // DNS provider settings
      dnsProvider: config.dnsProvider,
      dnsLabelPrefix: config.dnsLabelPrefix,
      dnsDefaultType: config.dnsDefaultType,
      dnsDefaultContent: config.dnsDefaultContent,
      dnsDefaultProxied: config.dnsDefaultProxied,
      dnsDefaultTTL: config.dnsDefaultTTL,
      dnsDefaultManage: config.dnsDefaultManage,
      
      // Domain settings
      domain: config.domain,
      
      // IP settings
      publicIP: config.publicIP,
      publicIPv6: config.publicIPv6,
      ipRefreshInterval: config.ipRefreshInterval,
      
      // Traefik settings (if applicable)
      traefikApiUrl: config.traefikApiUrl ? 
        config.traefikApiUrl.replace(/\/\/.*@/, '//***:***@') : null, // Hide auth details
      
      // Docker settings
      dockerSocket: config.dockerSocket,
      
      // Cache settings
      dnsCacheRefreshInterval: config.dnsCacheRefreshInterval,
      
      // Network settings
      apiTimeout: config.apiTimeout
    };
    
    res.json({
      status: 'success',
      data: {
        config: safeConfig
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get configuration: ${error.message}`,
      500,
      'CONFIG_GET_ERROR'
    );
  }
});

/**
 * @desc    Update application configuration
 * @route   PUT /api/v1/config
 * @access  Private/Admin
 */
const updateConfig = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Extract allowed configuration properties to update
  const {
    // Application settings
    pollInterval,
    watchDockerEvents,
    cleanupOrphaned,
    cleanupGracePeriod,
    
    // DNS default settings
    dnsDefaultType,
    dnsDefaultProxied,
    dnsDefaultTTL,
    dnsDefaultManage,
    
    // Network settings
    apiTimeout,
    
    // Cache settings
    dnsCacheRefreshInterval,
    ipRefreshInterval
  } = req.body;
  
  // Build updated config object with only the provided values
  const updatedConfig = {};
  
  // Add provided values to the update object
  if (pollInterval !== undefined) updatedConfig.pollInterval = pollInterval;
  if (watchDockerEvents !== undefined) updatedConfig.watchDockerEvents = watchDockerEvents;
  if (cleanupOrphaned !== undefined) updatedConfig.cleanupOrphaned = cleanupOrphaned;
  if (cleanupGracePeriod !== undefined) updatedConfig.cleanupGracePeriod = cleanupGracePeriod;
  if (dnsDefaultType !== undefined) updatedConfig.dnsDefaultType = dnsDefaultType;
  if (dnsDefaultProxied !== undefined) updatedConfig.dnsDefaultProxied = dnsDefaultProxied;
  if (dnsDefaultTTL !== undefined) updatedConfig.dnsDefaultTTL = dnsDefaultTTL;
  if (dnsDefaultManage !== undefined) updatedConfig.dnsDefaultManage = dnsDefaultManage;
  if (apiTimeout !== undefined) updatedConfig.apiTimeout = apiTimeout;
  if (dnsCacheRefreshInterval !== undefined) updatedConfig.dnsCacheRefreshInterval = dnsCacheRefreshInterval;
  if (ipRefreshInterval !== undefined) updatedConfig.ipRefreshInterval = ipRefreshInterval;
  
  // Make sure at least one property is being updated
  if (Object.keys(updatedConfig).length === 0) {
    throw new ApiError(
      'No valid configuration properties provided for update',
      400,
      'CONFIG_UPDATE_INVALID'
    );
  }
  
  try {
    // Update configuration
    const result = await ConfigManager.updateConfig(updatedConfig);
    
    if (!result.success) {
      throw new ApiError(
        result.error || 'Failed to update configuration',
        400,
        'CONFIG_UPDATE_ERROR'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: 'Configuration updated successfully',
        updatedProperties: Object.keys(updatedConfig),
        requiresRestart: result.requiresRestart || false
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to update configuration: ${error.message}`,
      error.statusCode || 500,
      error.code || 'CONFIG_UPDATE_ERROR'
    );
  }
});

/**
 * @desc    Get DNS provider configuration
 * @route   GET /api/v1/config/provider
 * @access  Private/Admin
 */
const getProviderConfig = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get current provider configuration
    const providerConfig = DNSManager.getProviderConfig();
    
    // Remove sensitive information
    const safeConfig = {
      provider: providerConfig.provider,
      domain: providerConfig.domain,
      // Additional provider-specific details without credentials
      providerSpecific: {
        type: providerConfig.providerSpecific?.type || null,
        features: {
          proxied: providerConfig.providerSpecific?.features?.proxied || false,
          minTTL: providerConfig.providerSpecific?.features?.minTTL || null,
          defaultTTL: providerConfig.providerSpecific?.features?.defaultTTL || null,
          requiresTrailingDot: providerConfig.providerSpecific?.features?.requiresTrailingDot || false,
          supportsBatchProcessing: providerConfig.providerSpecific?.features?.supportsBatchProcessing || false
        }
      }
    };
    
    res.json({
      status: 'success',
      data: {
        config: safeConfig
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get provider configuration: ${error.message}`,
      500,
      'PROVIDER_CONFIG_GET_ERROR'
    );
  }
});

/**
 * @desc    Toggle operation mode (traefik/direct)
 * @route   PUT /api/v1/config/mode
 * @access  Private/Admin
 */
const toggleOperationMode = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate mode
  if (!mode || !['traefik', 'direct'].includes(mode)) {
    throw new ApiError(
      'Invalid operation mode. Valid values are "traefik" or "direct"',
      400,
      'VALIDATION_ERROR'
    );
  }
  
  try {
    // Update operation mode
    const result = await ConfigManager.updateConfig({ operationMode: mode });
    
    if (!result.success) {
      throw new ApiError(
        result.error || `Failed to update operation mode to ${mode}`,
        400,
        'MODE_UPDATE_ERROR'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: `Operation mode updated to ${mode}`,
        previousMode: result.previousConfig.operationMode,
        currentMode: mode,
        requiresRestart: true
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to update operation mode: ${error.message}`,
      error.statusCode || 500,
      error.code || 'MODE_UPDATE_ERROR'
    );
  }
});

/**
 * @desc    Get application status and metrics
 * @route   GET /api/v1/config/status
 * @access  Private
 */
const getAppStatus = asyncHandler(async (req, res) => {
  const { 
    DNSManager, 
    DockerMonitor, 
    StatusReporter,
    TraefikMonitor = null // Optional
  } = global.services || {};
  
  if (!DNSManager || !DockerMonitor || !StatusReporter) {
    throw new ApiError('Required services not initialized', 500, 'SERVICES_NOT_INITIALIZED');
  }
  
  try {
    // Get application status
    const status = StatusReporter.getStatus();
    
    // Gather information from various services
    const dockerStatus = {
      connected: DockerMonitor.isConnected(),
      socket: DockerMonitor.config?.dockerSocket || null,
      containerCount: status.containers?.total || 0,
      eventsEnabled: DockerMonitor.config?.watchDockerEvents || false
    };
    
    const dnsStatus = {
      provider: DNSManager.config?.dnsProvider || null,
      domain: DNSManager.config?.domain || null,
      recordCount: status.dns?.recordCount || 0,
      orphanedRecords: status.dns?.orphanedRecords || 0,
      cleanupEnabled: DNSManager.config?.cleanupOrphaned || false,
      lastSync: status.dns?.lastSync || null
    };
    
    const traefikStatus = TraefikMonitor ? {
      connected: TraefikMonitor.isConnected(),
      apiUrl: TraefikMonitor.config?.traefikApiUrl ? 
        TraefikMonitor.config.traefikApiUrl.replace(/\/\/.*@/, '//***:***@') : null, // Hide auth details
      routerCount: status.traefik?.routerCount || 0,
      lastSync: status.traefik?.lastSync || null
    } : null;
    
    // Get application metrics
    const metrics = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      operationMode: DNSManager.config?.operationMode || 'unknown',
      taskCount: status.tasks?.completed || 0,
      errorCount: status.tasks?.errors || 0,
      lastError: status.lastError || null
    };
    
    res.json({
      status: 'success',
      data: {
        status: {
          docker: dockerStatus,
          dns: dnsStatus,
          traefik: traefikStatus,
          operationMode: DNSManager.config?.operationMode || 'unknown'
        },
        metrics,
        startTime: status.startTime || null
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get application status: ${error.message}`,
      500,
      'STATUS_GET_ERROR'
    );
  }
});

module.exports = {
  getConfig,
  updateConfig,
  getProviderConfig,
  toggleOperationMode,
  getAppStatus
};