import api from './apiService';

const settingsService = {
  // Get current application settings
  getSettings: () => {
    return api.get('/settings');
  },
  
  // Update application settings
  updateSettings: (settings) => {
    return api.post('/settings', settings);
  },
  
  // Reset application settings to defaults
  resetSettings: () => {
    return api.post('/settings/reset');
  },
  
  // Get current operation mode and available modes
  getOperationMode: () => {
    return api.get('/mode');
  },
  
  // Switch operation mode
  switchOperationMode: (mode) => {
    return api.post('/mode/switch', { mode });
  }
};

export default settingsService;