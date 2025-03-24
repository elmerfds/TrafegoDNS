// src/services/providersService.js - Enhanced version

import api from './apiService';

const providersService = {
  // Get all available providers and current provider with configs
  getAllProviders: () => {
    return api.get('/providers');
  },
  
  // Get current provider with detailed config
  getCurrentProvider: () => {
    return api.get('/providers/current');
  },
  
  // Get specific provider configuration
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
  }
};

export default providersService;