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
    // Try both endpoints for maximum compatibility
    return api.get('/profile').catch(error => {
      console.log('Primary profile endpoint failed, trying alternative');
      return api.get('/auth/profile');
    });
  },
  
  // Get all users (admin only)
  getUsers: () => {
    return api.get('/auth/users').catch(error => {
      console.error('Error fetching users:', error);
      // If we get a 403, we should handle this gracefully
      if (error.response && error.response.status === 403) {
        return { data: { users: [] }, status: 403, statusText: "Forbidden" };
      }
      throw error;
    });
  },
  
  // Register a new user (admin only)
  registerUser: (userData) => {
    return api.post('/auth/register', userData);
  },
  
  // Update user role (admin only)
  updateUserRole: (userId, role) => {
    return api.post(`/auth/users/${userId}/role`, { role });
  },
  
  // Delete a user (admin/super_admin only)
  deleteUser: (userId) => {
    return api.post(`/auth/users/${userId}/delete`);
  }
};

export default authService;