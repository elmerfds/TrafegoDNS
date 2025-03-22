import api from './apiService';

const providersService = {
  // Get all available providers and current provider
  getAllProviders: () => {
    return api.get('/providers');
  },
  
  // Get current provider
  getCurrentProvider: () => {
    return api.get('/providers/current');
  },
  
  // Switch to a different provider
  switchProvider: (provider) => {
    return api.post('/providers/switch', { provider });
  },
  
  // Get provider configuration
  getProviderConfig: (provider) => {
    return api.get(`/providers/${provider}`);
  },
  
  // Update provider configuration
  updateProviderConfig: (provider, config) => {
    return api.post(`/providers/${provider}/config`, config);
  },
  
  // Test provider configuration
  testProviderConfig: (provider) => {
    return api.get(`/providers/${provider}/test`);
  }
};

export default providersService;