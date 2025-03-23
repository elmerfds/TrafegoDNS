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

  // Get authenticated user info (whoami)
  getWhoami: () => {
    return api.get('/auth/whoami');
  },
  
  // Get current user profile
  getProfile: () => {
    // Try both profile endpoints for maximum compatibility
    return api.get('/profile').catch(error => {
      // If the main profile endpoint fails, try the alternative one
      console.log('Primary profile endpoint failed, trying alternative');
      return api.get('/auth/profile');
    }).then(response => {
      console.log("Profile response:", response.data);
      
      if (!response.data || !response.data.user) {
        console.error("Unexpected profile response format:", response.data);
        throw new Error("Invalid profile response format");
      }
      
      return response;
    });
  },
  
  // Get all users (admin only)
  getUsers: () => {
    return api.get('/auth/users');
  },
  
  // Register a new user (admin only)
  registerUser: (userData) => {
    return api.post('/auth/register', userData);
  },
  
  // Update user role (admin only)
  updateUserRole: (userId, role) => {
    return api.post(`/auth/users/${userId}/role`, { role });
  }
};

export default authService;