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
   * Modified to support partial revealing of sensitive environment values
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
      
      // Get the showSensitive option from query parameters (defaults to false)
      const showSensitive = req.query.showSensitive === 'true';
      
      // Apply partial masking to sensitive data
      const maskedConfig = { ...config };
      
      // Helper function for partial masking
      const partialMask = (value, field) => {
        if (!value) return value;
        
        // Return full value if explicitly requested
        if (showSensitive) return value;
        
        // For environment variables, extract the actual value
        if (value === 'CONFIGURED_FROM_ENV') {
          // Get the real env variable value
          const envValue = getEnvVariableValue(provider, field);
          if (!envValue) return 'ENV_VALUE_UNAVAILABLE';
          
          // Apply partial masking to the real value
          const visibleChars = 4; // Number of characters to show at the end
          return '*'.repeat(Math.max(0, envValue.length - visibleChars)) + 
                 envValue.slice(-visibleChars);
        }
        
        // For regular stored values, apply standard partial masking
        const visibleChars = 4; // Number of characters to keep visible at the end
        return '*'.repeat(Math.max(0, value.length - visibleChars)) + 
               value.slice(-visibleChars);
      };
      
      // Helper function to get environment variable value
      const getEnvVariableValue = (provider, field) => {
        // Map of provider fields to environment variables
        const envMappings = {
          'cloudflare': {
            'token': process.env.CLOUDFLARE_TOKEN,
            'zone': process.env.CLOUDFLARE_ZONE
          },
          'digitalocean': {
            'token': process.env.DO_TOKEN,
            'domain': process.env.DO_DOMAIN
          },
          'route53': {
            'accessKey': process.env.ROUTE53_ACCESS_KEY,
            'secretKey': process.env.ROUTE53_SECRET_KEY,
            'zone': process.env.ROUTE53_ZONE,
            'zoneId': process.env.ROUTE53_ZONE_ID,
            'region': process.env.ROUTE53_REGION
          }
        };
        
        // Return the env value if available
        return envMappings[provider] && envMappings[provider][field] 
          ? envMappings[provider][field] 
          : null;
      };
      
      // Apply masking to sensitive fields
      const sensitiveFields = ['token', 'apiKey', 'secretKey', 'accessKey', 'password'];
      
      sensitiveFields.forEach(field => {
        if (field in maskedConfig) {
          maskedConfig[field] = partialMask(maskedConfig[field], field);
        }
      });
      
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
   * GET /api/providers/{provider}/sensitive - Get provider sensitive information (new endpoint)
   * Returns actual unmasked values for sensitive fields
   */
  router.get('/:provider/sensitive', (req, res) => {
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
      
      // Check if user is authenticated as admin
      if (!req.user || req.user.role !== 'admin') {
        logger.warn(`Unauthorized attempt to access sensitive information for ${provider}`);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Administrator access required to view sensitive information'
        });
      }
      
      // Get provider config
      const config = state.providers.configs[provider] || {};
      
      // Create a new object for sensitive fields only
      const sensitiveFields = {};
      
      // Helper function to get environment variable value
      const getEnvVariableValue = (provider, field) => {
        // Map of provider fields to environment variables
        const envMappings = {
          'cloudflare': {
            'token': process.env.CLOUDFLARE_TOKEN,
            'zone': process.env.CLOUDFLARE_ZONE
          },
          'digitalocean': {
            'token': process.env.DO_TOKEN,
            'domain': process.env.DO_DOMAIN
          },
          'route53': {
            'accessKey': process.env.ROUTE53_ACCESS_KEY,
            'secretKey': process.env.ROUTE53_SECRET_KEY,
            'zone': process.env.ROUTE53_ZONE,
            'zoneId': process.env.ROUTE53_ZONE_ID,
            'region': process.env.ROUTE53_REGION
          }
        };
        
        // Return the env value if available
        return envMappings[provider] && envMappings[provider][field] 
          ? envMappings[provider][field] 
          : 'ENV_VALUE_UNAVAILABLE';
      };
      
      // List of sensitive fields to process
      const sensitiveFieldsList = ['token', 'apiKey', 'secretKey', 'accessKey', 'password'];
      
      // Get values for sensitive fields
      sensitiveFieldsList.forEach(field => {
        if (field in config) {
          sensitiveFields[field] = config[field] === 'CONFIGURED_FROM_ENV' ? 
            getEnvVariableValue(provider, field) : config[field];
        }
      });
      
      // Log access for security auditing
      logger.info(`Sensitive information accessed for provider ${provider} by user ${req.user.username}`);
      
      res.json({
        provider,
        sensitiveFields
      });
    } catch (error) {
      logger.error(`Error getting provider sensitive info: ${error.message}`);
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