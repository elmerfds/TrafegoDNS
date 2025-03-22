// src/services/apiService.js
import axios from 'axios';

// Create base axios instance
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor with improved debugging
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      console.log(`Adding auth token for ${config.url}`);
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.log(`No token available for ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with improved debugging
api.interceptors.response.use(
  (response) => {
    console.log(`Response from ${response.config.url}:`, response.status);
    return response;
  },
  (error) => {
    console.error(`API Error for ${error.config?.url}:`, error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // Handle 401 Unauthorized
    if (error.response && error.response.status === 401) {
      if (!window.location.pathname.includes('/login')) {
        console.log('Unauthorized, redirecting to login page');
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;