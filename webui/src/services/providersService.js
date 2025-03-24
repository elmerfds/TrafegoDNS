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
  getProviderConfig: (provider, showSensitive = false) => {
    return api.get(`/providers/${provider}`, {
      params: { showSensitive: showSensitive ? 'true' : 'false' }
    });
  },
  
  // Get sensitive information for a provider
  getSensitiveInfo: (provider) => {
    return api.get(`/providers/${provider}/sensitive`);
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
  fetchAllProviderConfigs: async (showSensitive = false) => {
    try {
      // Get all available providers first
      const providersResponse = await api.get('/providers');
      const providers = providersResponse.data;
      
      // For each provider, get its specific configuration
      if (providers && providers.available && Array.isArray(providers.available)) {
        const configPromises = providers.available.map(provider => 
          api.get(`/providers/${provider}`, {
            params: { showSensitive: showSensitive ? 'true' : 'false' }
          })
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
  
  // Helper functions for dealing with masked values and environment variables
  
  // Check if a provider has configuration from environment variables
  checkEnvironmentConfig: (provider, config) => {
    if (!config) return false;
    return Object.values(config).some(value => value === 'CONFIGURED_FROM_ENV');
  },
  
  // Check if a specific field is from an env variable
  isFromEnvironment: (config, field) => {
    if (!config || !config[field]) return false;
    return config[field] === 'CONFIGURED_FROM_ENV';
  },
  
  // Check if a value is masked in the API response
  isMaskedValue: (value) => {
    if (typeof value !== 'string') return false;
    return value === '***' || value === '********' || /^\*+$/.test(value);
  },
  
  // Check if a value is configured from an environment variable
  isEnvironmentValue: (value) => {
    return value === 'CONFIGURED_FROM_ENV';
  },
  
  // Get the real value for a sensitive field (includes calling sensitive API)
  getSensitiveValue: async (provider, field) => {
    try {
      const response = await api.get(`/providers/${provider}/sensitive`);
      if (response.data && response.data.sensitiveFields && response.data.sensitiveFields[field]) {
        return response.data.sensitiveFields[field];
      }
      return null;
    } catch (error) {
      console.error(`Error fetching sensitive value for ${provider}.${field}:`, error);
      return null;
    }
  }
};

export default providersService;