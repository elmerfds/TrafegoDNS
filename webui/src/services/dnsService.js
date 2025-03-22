import api from './apiService';

const dnsService = {
  // Trigger a manual poll
  triggerPoll: () => {
    return api.get('/dns/poll');
  },
  
  // Get current DNS records from provider
  getDnsRecords: () => {
    return api.get('/dns/records');
  },
  
  // Get active hostnames
  getActiveHostnames: () => {
    return api.get('/dns/hostnames');
  },
  
  // Check DNS record status for a hostname
  checkHostname: (hostname) => {
    return api.get(`/dns/check/${hostname}`);
  }
};

export default dnsService;