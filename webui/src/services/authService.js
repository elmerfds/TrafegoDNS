// webui/src/services/authService.js

import api from './apiService';

const authService = {
  // Login with username and password
  login: (username, password) => {
    return api.post('/auth/login', { username, password });
  },
  
  // Get authentication status
  getAuthStatus: () => {
    return api.get('/auth/status');
  },

  // Get current user profile
  getProfile: () => {
    return api.get('/profile').catch(error => {
      console.log('Primary profile endpoint failed, trying alternative');
      return api.get('/auth/profile');
    });
  }
};

export default authService;

export default authService;