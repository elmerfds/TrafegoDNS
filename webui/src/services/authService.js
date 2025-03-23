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

  getAdminStatus: async () => {
    try {
      const response = await api.get('/profile');
      console.log("User profile from API:", response.data);
      return response.data.user.role === 'admin' || response.data.user.role === 'super_admin';
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  },  
  
  // Get all users (admin only)
  getUsers: () => {
    // Note: should be /auth/users not /api/auth/users since baseURL already has /api
    return api.get('/auth/users').then(response => {
      console.log('Users response:', response.data);
      return response;
    }).catch(error => {
      console.error('Error fetching users:', error);
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