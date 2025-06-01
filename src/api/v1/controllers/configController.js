/**
 * Configuration Controller
 * Handles application configuration settings
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');

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
    // Get current configuration from ConfigManager properties
    const safeConfig = {
      // Application settings
      operationMode: ConfigManager.operationMode,
      pollInterval: ConfigManager.pollInterval,
      watchDockerEvents: ConfigManager.watchDockerEvents,
      cleanupOrphaned: ConfigManager.cleanupOrphaned,
      cleanupGracePeriod: ConfigManager.cleanupGracePeriod,
      
      // DNS provider settings
      dnsProvider: ConfigManager.dnsProvider,
      dnsLabelPrefix: ConfigManager.dnsLabelPrefix,
      dnsDefaultType: ConfigManager.defaultType,
      dnsDefaultContent: ConfigManager.defaultContent,
      dnsDefaultProxied: ConfigManager.defaultProxied,
      dnsDefaultTTL: ConfigManager.defaultTTL,
      dnsDefaultManage: ConfigManager.defaultManage,
      
      // Provider-specific zones
      cloudflareZone: ConfigManager.cloudflareZone || '',
      route53Zone: ConfigManager.route53Zone || '',
      route53ZoneId: ConfigManager.route53ZoneId || '',
      route53Region: ConfigManager.route53Region || '',
      digitalOceanDomain: ConfigManager.digitalOceanDomain || '',
      
      // Domain settings
      domain: ConfigManager.getProviderDomain(),
      
      // IP settings
      publicIP: ConfigManager.getPublicIPSync(),
      publicIPv6: ConfigManager.getPublicIPv6Sync(),
      ipRefreshInterval: ConfigManager.ipRefreshInterval,
      
      // Traefik settings (if applicable)
      traefikApiUrl: ConfigManager.traefikApiUrl || '',
      traefikApiUsername: ConfigManager.traefikApiUsername || '',
      
      // Docker settings
      dockerSocket: ConfigManager.dockerSocket,
      
      // Label prefixes
      genericLabelPrefix: ConfigManager.genericLabelPrefix || 'dns.',
      traefikLabelPrefix: ConfigManager.traefikLabelPrefix || 'traefik.',
      
      // Advanced settings
      managedHostnames: ConfigManager.managedHostnames || '',
      preservedHostnames: ConfigManager.preservedHostnames || '',
      
      // Cache settings
      dnsCacheRefreshInterval: ConfigManager.dnsCacheRefreshInterval,
      
      // Network settings
      apiTimeout: ConfigManager.apiTimeout,
      
      // Record defaults
      recordDefaults: ConfigManager.recordDefaults || {}
    };
    
    // Add secret status (which secrets are set, but not the values)
    const secretStatus = await ConfigManager.getSecretStatus();
    Object.assign(safeConfig, secretStatus);
    
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
    
    // DNS provider settings
    dnsProvider,
    dnsLabelPrefix,
    dnsDefaultType,
    dnsDefaultContent,
    dnsDefaultProxied,
    dnsDefaultTTL,
    dnsDefaultManage,
    
    // Provider-specific zones
    cloudflareZone,
    route53Zone,
    route53ZoneId,
    route53Region,
    digitalOceanDomain,
    
    // Traefik settings
    traefikApiUrl,
    traefikApiUsername,
    
    // Docker settings
    dockerSocket,
    
    // Label prefixes
    genericLabelPrefix,
    traefikLabelPrefix,
    
    // Advanced settings
    managedHostnames,
    preservedHostnames,
    
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
  if (dnsProvider !== undefined) updatedConfig.dnsProvider = dnsProvider;
  if (dnsLabelPrefix !== undefined) updatedConfig.dnsLabelPrefix = dnsLabelPrefix;
  if (dnsDefaultType !== undefined) updatedConfig.dnsDefaultType = dnsDefaultType;
  if (dnsDefaultContent !== undefined) updatedConfig.dnsDefaultContent = dnsDefaultContent;
  if (dnsDefaultProxied !== undefined) updatedConfig.dnsDefaultProxied = dnsDefaultProxied;
  if (dnsDefaultTTL !== undefined) updatedConfig.dnsDefaultTTL = dnsDefaultTTL;
  if (dnsDefaultManage !== undefined) updatedConfig.dnsDefaultManage = dnsDefaultManage;
  if (cloudflareZone !== undefined) updatedConfig.cloudflareZone = cloudflareZone;
  if (route53Zone !== undefined) updatedConfig.route53Zone = route53Zone;
  if (route53ZoneId !== undefined) updatedConfig.route53ZoneId = route53ZoneId;
  if (route53Region !== undefined) updatedConfig.route53Region = route53Region;
  if (digitalOceanDomain !== undefined) updatedConfig.digitalOceanDomain = digitalOceanDomain;
  if (traefikApiUrl !== undefined) updatedConfig.traefikApiUrl = traefikApiUrl;
  if (traefikApiUsername !== undefined) updatedConfig.traefikApiUsername = traefikApiUsername;
  if (dockerSocket !== undefined) updatedConfig.dockerSocket = dockerSocket;
  if (genericLabelPrefix !== undefined) updatedConfig.genericLabelPrefix = genericLabelPrefix;
  if (traefikLabelPrefix !== undefined) updatedConfig.traefikLabelPrefix = traefikLabelPrefix;
  if (managedHostnames !== undefined) updatedConfig.managedHostnames = managedHostnames;
  if (preservedHostnames !== undefined) updatedConfig.preservedHostnames = preservedHostnames;
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
 * @desc    Get all settings from database
 * @route   GET /api/v1/config/settings
 * @access  Private/Admin
 */
const getAllSettings = asyncHandler(async (req, res) => {
  const database = require('../../../database');
  
  if (!database.isInitialized() || !database.repositories?.setting) {
    throw new ApiError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
  }
  
  try {
    // Get all settings from database
    const settings = await database.repositories.setting.getAll();
    
    res.json({
      status: 'success',
      data: {
        settings,
        count: Object.keys(settings).length
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get settings: ${error.message}`,
      500,
      'SETTINGS_GET_ERROR'
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

/**
 * @desc    Update secrets (admin only)
 * @route   PUT /api/v1/config/secrets
 * @access  Private/Admin
 */
const updateSecrets = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Check if user has admin role
  if (req.user.role !== 'admin') {
    throw new ApiError('Insufficient permissions to manage secrets', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  const {
    cloudflareToken,
    route53AccessKey,
    route53SecretKey,
    digitalOceanToken,
    traefikApiPassword
  } = req.body;
  
  // Build secrets object with only provided values
  const secrets = {};
  if (cloudflareToken !== undefined && cloudflareToken.trim() !== '') {
    secrets.cloudflareToken = cloudflareToken.trim();
  }
  if (route53AccessKey !== undefined && route53AccessKey.trim() !== '') {
    secrets.route53AccessKey = route53AccessKey.trim();
  }
  if (route53SecretKey !== undefined && route53SecretKey.trim() !== '') {
    secrets.route53SecretKey = route53SecretKey.trim();
  }
  if (digitalOceanToken !== undefined && digitalOceanToken.trim() !== '') {
    secrets.digitalOceanToken = digitalOceanToken.trim();
  }
  if (traefikApiPassword !== undefined && traefikApiPassword.trim() !== '') {
    secrets.traefikApiPassword = traefikApiPassword.trim();
  }
  
  if (Object.keys(secrets).length === 0) {
    throw new ApiError('No secrets provided for update', 400, 'NO_SECRETS_PROVIDED');
  }
  
  try {
    // Save secrets with user ID for audit
    const result = await ConfigManager.saveSecrets(secrets, req.user.id);
    
    if (!result.success) {
      throw new ApiError(
        result.error || 'Failed to save secrets',
        500,
        'SECRETS_SAVE_ERROR'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: 'Secrets updated successfully',
        updatedSecrets: Object.keys(secrets),
        requiresRestart: true // Secrets changes typically require restart
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to update secrets: ${error.message}`,
      error.statusCode || 500,
      error.code || 'SECRETS_UPDATE_ERROR'
    );
  }
});

/**
 * @desc    Test secret validation
 * @route   POST /api/v1/config/secrets/test
 * @access  Private/Admin
 */
const testSecrets = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Check if user has admin role
  if (req.user.role !== 'admin') {
    throw new ApiError('Insufficient permissions to test secrets', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  const { provider, secrets } = req.body;
  
  if (!provider || !secrets) {
    throw new ApiError('Provider and secrets are required for testing', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Create temporary provider instance for testing
    const { DNSProviderFactory } = require('../../../providers');
    
    // Build test config
    const testConfig = {
      dnsProvider: provider,
      ...ConfigManager._envConfig // Use existing config as base
    };
    
    // Override with test secrets
    if (secrets.cloudflareToken) testConfig.cloudflareToken = secrets.cloudflareToken;
    if (secrets.route53AccessKey) testConfig.route53AccessKey = secrets.route53AccessKey;
    if (secrets.route53SecretKey) testConfig.route53SecretKey = secrets.route53SecretKey;
    if (secrets.digitalOceanToken) testConfig.digitalOceanToken = secrets.digitalOceanToken;
    
    // Test provider connection
    const testProvider = DNSProviderFactory.createProvider(testConfig);
    
    // Attempt to list records (basic connectivity test)
    await testProvider.getRecordsFromCache(true); // Force refresh to test API
    
    res.json({
      status: 'success',
      data: {
        message: 'Secret validation successful',
        provider: provider,
        testResults: {
          connectivity: true,
          apiAccess: true
        }
      }
    });
  } catch (error) {
    // Return validation failure without exposing sensitive details
    res.json({
      status: 'error',
      data: {
        message: 'Secret validation failed',
        provider: provider,
        testResults: {
          connectivity: false,
          apiAccess: false,
          error: 'Authentication or API access failed'
        }
      }
    });
  }
});

/**
 * @desc    Get decrypted secrets for viewing (admin only)
 * @route   GET /api/v1/config/secrets
 * @access  Private/Admin
 */
const getSecrets = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Check if user has admin role
  if (req.user.role !== 'admin') {
    throw new ApiError('Insufficient permissions to view secrets', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  try {
    const secrets = await ConfigManager.loadSecrets();
    
    // Log the access for security audit
    const database = require('../../../database');
    if (database.repositories && database.repositories.activityLog) {
      try {
        await database.repositories.activityLog.logActivity({
          type: 'tracked',
          recordType: 'secrets',
          hostname: 'system',
          details: `Admin ${req.user.username} viewed secrets`,
          source: 'config',
          metadata: {
            userId: req.user.id,
            username: req.user.username,
            action: 'view_secrets',
            timestamp: new Date().toISOString()
          }
        });
      } catch (auditError) {
        logger.warn(`Failed to log secret view audit: ${auditError.message}`);
      }
    }
    
    res.json({
      status: 'success',
      data: {
        secrets: secrets
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get secrets: ${error.message}`,
      500,
      'SECRETS_GET_ERROR'
    );
  }
});

/**
 * @desc    Get secret status (which secrets are set)
 * @route   GET /api/v1/config/secrets/status
 * @access  Private/Admin
 */
const getSecretStatus = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  // Check if user has admin role
  if (req.user.role !== 'admin') {
    throw new ApiError('Insufficient permissions to view secret status', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  try {
    const secretStatus = await ConfigManager.getSecretStatus();
    
    res.json({
      status: 'success',
      data: {
        secrets: secretStatus
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get secret status: ${error.message}`,
      500,
      'SECRET_STATUS_ERROR'
    );
  }
});

module.exports = {
  getConfig,
  updateConfig,
  getProviderConfig,
  toggleOperationMode,
  getAppStatus,
  getAllSettings,
  updateSecrets,
  testSecrets,
  getSecrets,
  getSecretStatus
};