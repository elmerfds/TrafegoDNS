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
    return api.get('/auth/profile');
  },
  
  // Get all users (admin only)
  getUsers: () => {
    return api.get('/auth/users');
  },
  
  // Register a new user (admin only)
  registerUser: (userData) => {
    return api.post('/auth/register', userData);
  },
  
  // Update user role (super_admin only)
  updateUserRole: (userId, role) => {
    return api.post(`/auth/users/${userId}/role`, { role });
  }
};

export default authService;