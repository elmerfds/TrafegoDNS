/**
 * Configuration Actions
 * Action handlers for configuration operations
 */
const logger = require('../../utils/logger');

/**
 * Register configuration action handlers with the action broker
 * @param {ActionBroker} broker - The action broker
 * @param {Object} services - Application services
 */
function registerConfigActions(broker, services) {
  // Load initial configuration
  broker.registerHandler('CONFIG_INITIALIZE', async (action, broker) => {
    const { ConfigManager } = services;
    if (!ConfigManager) {
      throw new Error('Config manager not initialized');
    }

    try {
      // Get config from service
      const config = {
        // General settings
        operationMode: ConfigManager.operationMode,
        pollInterval: ConfigManager.pollInterval,
        watchDockerEvents: ConfigManager.watchDockerEvents,
        cleanupOrphaned: ConfigManager.cleanupOrphaned,
        cleanupGracePeriod: ConfigManager.cleanupGracePeriod,
        
        // DNS settings
        dnsProvider: ConfigManager.dnsProvider,
        dnsLabelPrefix: ConfigManager.dnsLabelPrefix,
        defaultRecordType: ConfigManager.defaultRecordType,
        defaultContent: ConfigManager.defaultContent,
        defaultProxied: ConfigManager.defaultProxied,
        defaultTTL: ConfigManager.defaultTTL,
        defaultManage: ConfigManager.defaultManage,
        
        // Record defaults by type
        recordDefaults: ConfigManager.recordDefaults,
        
        // API settings
        apiSettings: {
          port: ConfigManager.apiPort || 3000,
          enabled: ConfigManager.useApiMode !== false,
          localAuthBypass: ConfigManager.localAuthBypass?.enabled !== false,
          swaggerEnabled: ConfigManager.enableSwagger === true
        }
      };

      // Update state
      broker.updateState('config', config, action, 'config:initialized');
      return config;
    } catch (error) {
      logger.error(`Failed to initialize config: ${error.message}`);
      throw error;
    }
  });

  // Update configuration
  broker.registerHandler('CONFIG_UPDATE', async (action, broker) => {
    const { ConfigManager } = services;
    if (!ConfigManager) {
      throw new Error('Config manager not initialized');
    }

    try {
      const currentConfig = broker.stateStore.getState('config');
      const updates = action.payload;

      // Apply updates to current config
      const updatedConfig = {
        ...currentConfig,
        ...updates
      };

      // Update in the actual ConfigManager
      const result = await ConfigManager.updateConfig(updates);

      if (!result.success) {
        throw new Error(result.error || 'Failed to update configuration');
      }

      // Update state
      broker.updateState('config', updatedConfig, action, 'config:updated');

      // Return updated config with metadata
      return {
        ...updatedConfig,
        requiresRestart: result.requiresRestart || false,
        updatedProperties: Object.keys(updates)
      };
    } catch (error) {
      logger.error(`Failed to update config: ${error.message}`);
      throw error;
    }
  });

  // Toggle operation mode
  broker.registerHandler('CONFIG_SET_MODE', async (action, broker) => {
    const { ConfigManager } = services;
    if (!ConfigManager) {
      throw new Error('Config manager not initialized');
    }

    try {
      const { mode } = action.payload;

      // Validate mode
      if (!mode || !['traefik', 'direct'].includes(mode)) {
        throw new Error('Invalid operation mode. Valid values are "traefik" or "direct"');
      }

      // Update mode
      const result = await ConfigManager.updateConfig({ operationMode: mode });

      if (!result.success) {
        throw new Error(result.error || `Failed to update operation mode to ${mode}`);
      }

      // Get current config and update it
      const currentConfig = broker.stateStore.getState('config');
      const updatedConfig = {
        ...currentConfig,
        operationMode: mode
      };

      // Update state
      broker.updateState('config', updatedConfig, action, 'config:mode:changed');

      // Return updated config with metadata
      return {
        previousMode: result.previousConfig.operationMode,
        currentMode: mode,
        requiresRestart: true
      };
    } catch (error) {
      logger.error(`Failed to set operation mode: ${error.message}`);
      throw error;
    }
  });
}

module.exports = { registerConfigActions };