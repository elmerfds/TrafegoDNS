// src/services/providersService.js
import api from './apiService';

const providersService = {
  // Get all available providers and current provider
  getAllProviders: () => {
    return api.get('/providers');
  },
  
  // Get current provider with detailed config
  getCurrentProvider: () => {
    return api.get('/providers/current');
  },
  
  // Get provider configuration
  getProviderConfig: (provider) => {
    return api.get(`/providers/${provider}`);
  },
  
  // Switch to a different provider
  switchProvider: (provider) => {
    return api.post('/providers/switch', { provider });
  },
  
  // Update provider configuration
  updateProviderConfig: (provider, config) => {
    // Log what we're sending to the API for debugging
    console.log(`Updating ${provider} config:`, config);
    return api.post(`/providers/${provider}/config`, config);
  },
  
  // Test provider configuration
  testProviderConfig: (provider) => {
    return api.get(`/providers/${provider}/test`);
  },
  
  // Fetch all provider configurations
  fetchAllProviderConfigs: async () => {
    try {
      // Get all available providers first
      const providersResponse = await api.get('/providers');
      const providers = providersResponse.data;
      
      // For each provider, get its specific configuration
      if (providers && providers.available && Array.isArray(providers.available)) {
        const configPromises = providers.available.map(provider => 
          api.get(`/providers/${provider}`)
            .then(response => ({ provider, config: response.data.config }))
            .catch(error => {
              console.error(`Error fetching config for ${provider}:`, error);
              return { provider, config: {} };
            })
        );
        
        const configs = await Promise.all(configPromises);
        
        // Organize configs by provider
        const configsByProvider = {};
        configs.forEach(item => {
          configsByProvider[item.provider] = item.config;
        });
        
        return {
          ...providers,
          configs: configsByProvider
        };
      }
      
      return providers;
    } catch (error) {
      console.error('Error fetching all provider configs:', error);
      throw error;
    }
  },
  
  // Check if a provider has configuration from environment variables
  checkEnvironmentConfig: (provider, config) => {
    // No need to make an API call - check if any values are marked as env variables
    if (!config) return false;
    
    return Object.values(config).some(value => value === 'CONFIGURED_FROM_ENV');
  },
  
  // Add this helper function to check if a specific field is from an env variable
  isFromEnvironment: (config, field) => {
    if (!config || !config[field]) return false;
    return config[field] === 'CONFIGURED_FROM_ENV';
  },
  
  // Helper function to determine if a value is masked in the API response
  isMaskedValue: (value) => {
    return value === '***' || value === '********' || /^\*+$/.test(value);
  },
  
  // Helper function to detect environment variable configuration
  isEnvironmentValue: (value) => {
    return value === 'CONFIGURED_FROM_ENV';
  },
  
  // Process provider configuration to handle masked and environment values
  processProviderConfig: (provider, config, fromEnv = false) => {
    // Create a processed copy
    const processed = { ...config };
    
    // Check for sensitive fields that might be masked
    const sensitiveFields = ['token', 'apiKey', 'secretKey', 'accessKey', 'password'];
    
    sensitiveFields.forEach(field => {
      if (processed[field]) {
        // If it's masked in the API response
        if (providersService.isMaskedValue(processed[field])) {
          processed[field] = 'CONFIGURED';
        }
        
        // If it's from environment variables
        if (fromEnv) {
          processed[field] = 'CONFIGURED_FROM_ENV';
        }
      }
    });
    
    return processed;
  }
};

export default providersService;