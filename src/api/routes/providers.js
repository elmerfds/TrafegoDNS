/**
 * src/api/routes/providers.js
 * API routes for managing DNS providers
 */
const express = require('express');
const logger = require('../../utils/logger');
const { DNSProviderFactory } = require('../../providers');

/**
 * Create router for provider endpoints
 * @param {Object} stateManager - State Manager instance
 * @param {Object} config - Configuration manager instance
 * @returns {Object} Express router
 */
function createProvidersRouter(stateManager, config) {
  const router = express.Router();
  
  /**
   * GET /api/providers - Get all available providers and current provider
   */
  router.get('/', (req, res) => {
    try {
      const availableProviders = DNSProviderFactory.getAvailableProviders();
      
      // Update state with available providers
      stateManager.updateAvailableProviders(availableProviders);
      
      // Get current provider from state
      const providerState = stateManager.getState().providers;
      
      res.json({
        current: providerState.current,
        available: availableProviders,
        configs: providerState.configs
      });
    } catch (error) {
      logger.error(`Error getting providers: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/providers/current - Get current provider
   */
  router.get('/current', (req, res) => {
    try {
      const state = stateManager.getState();
      res.json({
        current: state.providers.current,
        config: state.providers.configs[state.providers.current] || {}
      });
    } catch (error) {
      logger.error(`Error getting current provider: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/providers/switch - Switch to a different provider
   */
  router.post('/switch', async (req, res) => {
    try {
      const { provider } = req.body;
      
      if (!provider) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'provider parameter is required'
        });
      }
      
      // Get available providers
      const availableProviders = DNSProviderFactory.getAvailableProviders();
      
      // Check if provider is valid
      if (!availableProviders.includes(provider)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Provider '${provider}' is not available. Available providers: ${availableProviders.join(', ')}`
        });
      }
      
      // Switch provider in state manager
      const providerState = stateManager.switchProvider(provider);
      
      logger.info(`Switched DNS provider to ${provider}`);
      
      res.json({
        success: true,
        current: providerState.current,
        available: providerState.available
      });
    } catch (error) {
      logger.error(`Error switching provider: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/providers/{provider} - Get provider configuration
   */
  router.get('/:provider', (req, res) => {
    try {
      const { provider } = req.params;
      const state = stateManager.getState();
      
      // Check if provider exists
      if (!state.providers.available.includes(provider)) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Provider '${provider}' not found`
        });
      }
      
      // Get provider config
      const config = state.providers.configs[provider] || {};
      
      // Mask sensitive data
      const maskedConfig = { ...config };
      if (maskedConfig.token) maskedConfig.token = '***';
      if (maskedConfig.apiKey) maskedConfig.apiKey = '***';
      if (maskedConfig.secretKey) maskedConfig.secretKey = '***';
      
      res.json({
        provider,
        config: maskedConfig,
        isCurrent: state.providers.current === provider
      });
    } catch (error) {
      logger.error(`Error getting provider config: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/providers/{provider}/config - Update provider configuration
   */
  router.post('/:provider/config', async (req, res) => {
    try {
      const { provider } = req.params;
      const config = req.body;
      
      if (!config) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Request body must contain provider configuration'
        });
      }
      
      // Validate configuration based on provider type
      let validationError = null;
      
      switch (provider) {
        case 'cloudflare':
          if (!config.token || !config.zone) {
            validationError = 'Cloudflare configuration requires token and zone parameters';
          }
          break;
        case 'digitalocean':
          if (!config.token || !config.domain) {
            validationError = 'DigitalOcean configuration requires token and domain parameters';
          }
          break;
        case 'route53':
          if (!config.accessKey || !config.secretKey || !config.zone) {
            validationError = 'Route53 configuration requires accessKey, secretKey, and zone parameters';
          }
          break;
        default:
          // Generic validation for other providers
          if (Object.keys(config).length === 0) {
            validationError = 'Configuration cannot be empty';
          }
      }
      
      if (validationError) {
        return res.status(400).json({
          error: 'Bad Request',
          message: validationError
        });
      }
      
      // Update provider config in state manager
      stateManager.updateProviderConfig(provider, config);
      
      // If this is the current provider, we need to update the DNS manager
      const dnsManager = req.app.locals.dnsManager;
      if (dnsManager && stateManager.getState().providers.current === provider) {
        dnsManager.updateProviderConfig(provider, config);
      }
      
      logger.info(`Updated configuration for ${provider} provider`);
      
      res.json({
        success: true,
        provider,
        message: `Configuration for ${provider} updated successfully`
      });
    } catch (error) {
      logger.error(`Error updating provider config: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/providers/{provider}/test - Test provider configuration
   */
  router.get('/:provider/test', async (req, res) => {
    try {
      const { provider } = req.params;
      const state = stateManager.getState();
      
      // Check if provider exists
      if (!state.providers.available.includes(provider)) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Provider '${provider}' not found`
        });
      }
      
      // Get provider config
      const providerConfig = state.providers.configs[provider];
      
      if (!providerConfig) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `No configuration found for provider '${provider}'`
        });
      }
      
      // Create a temporary provider instance
      const factory = new DNSProviderFactory(config);
      const testProvider = await factory.createProvider(provider);
      
      // Test connection
      const result = await testProvider.testConnection();
      
      res.json({
        success: result.success,
        provider,
        message: result.message,
        details: result.details || {}
      });
    } catch (error) {
      logger.error(`Error testing provider: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createProvidersRouter;