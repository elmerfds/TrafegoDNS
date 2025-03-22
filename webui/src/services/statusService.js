import api from './apiService';

const statusService = {
  // Get current application status
  getStatus: () => {
    return api.get('/status');
  },
  
  // Get current statistics
  getStats: () => {
    return api.get('/status/stats');
  },
  
  // Reset statistics
  resetStats: () => {
    return api.post('/status/stats/reset');
  },
  
  // Get public IP addresses
  getPublicIPs: () => {
    return api.get('/status/ip');
  },
  
  // Get recent application logs
  getLogs: () => {
    return api.get('/status/logs');
  }
};

export default statusService;