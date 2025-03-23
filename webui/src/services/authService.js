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
    // Make request to the profile endpoint
    return api.get('/profile').then(response => {
      // Add this console log to see the exact response structure
      console.log("Profile response:", response.data);
      
      // Make sure we have the expected structure
      if (!response.data || !response.data.user) {
        console.error("Unexpected profile response format:", response.data);
        throw new Error("Invalid profile response format");
      }
      
      return response;
    });
  },
  
  // Get all users (admin only)
  getUsers: () => {
    return api.get('/auth/users').catch(error => {
      // Log detailed error for debugging
      console.error('Error in getUsers:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        // Handle permission error specifically
        throw new Error("Insufficient permissions to view users");
      }
      throw error;
    });
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