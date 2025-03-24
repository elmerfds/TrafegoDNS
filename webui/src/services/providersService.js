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
  
  // Partially unmask a sensitive value (show last few characters)
  partiallyUnmaskValue: (value, charsToShow = 4) => {
    if (!value || typeof value !== 'string') return value;
    
    // For environment values, use a special indicator
    if (value === 'CONFIGURED_FROM_ENV') return '•••ENV';
    
    // For fully masked values from API, return a partial mask
    if (value === '***' || value === '********' || /^\*+$/.test(value)) {
      // If it's already a mask, create a partial mask with sample digits
      return '•••' + Array(charsToShow).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
    }
    
    // For actual values, only show the last few characters
    return '•'.repeat(Math.max(0, value.length - charsToShow)) + value.slice(-charsToShow);
  },
  
  // Process provider configuration to handle masked and environment values
  processProviderConfig: (provider, config) => {
    // Create a processed copy
    const processed = { ...config };
    
    // List of sensitive fields that might be masked
    const sensitiveFields = ['token', 'apiKey', 'secretKey', 'accessKey', 'password'];
    
    // Process each field
    Object.keys(processed).forEach(field => {
      const value = processed[field];
      
      // For sensitive fields
      if (sensitiveFields.includes(field)) {
        if (providersService.isEnvironmentValue(value)) {
          // Keep environment variable indicator
          processed[field] = 'CONFIGURED_FROM_ENV';
        } else if (providersService.isMaskedValue(value)) {
          // For masked values, create a partial mask
          processed[field] = providersService.partiallyUnmaskValue(value);
        }
      }
    });
    
    return processed;
  }
};

export default providersService;