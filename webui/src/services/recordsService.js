import api from './apiService';

const recordsService = {
  // Get all tracked records
  getAllRecords: () => {
    return api.get('/records');
  },
  
  // Get tracked DNS records
  getTrackedRecords: () => {
    return api.get('/records/tracked');
  },
  
  // Get preserved hostnames
  getPreservedHostnames: () => {
    return api.get('/records/preserved');
  },
  
  // Update preserved hostnames
  updatePreservedHostnames: (hostnames) => {
    return api.post('/records/preserved', { hostnames });
  },
  
  // Get managed hostnames
  getManagedHostnames: () => {
    return api.get('/records/managed');
  },
  
  // Update managed hostnames
  updateManagedHostnames: (hostnames) => {
    return api.post('/records/managed', { hostnames });
  },
  
  // Create a new DNS record
  createRecord: (record) => {
    return api.post('/records/create', record);
  },
  
  // Update a DNS record
  updateRecord: (id, record) => {
    return api.post('/records/update', { id, record });
  },
  
  // Delete a DNS record
  deleteRecord: (id) => {
    return api.post('/records/delete', { id });
  },
  
  // Trigger cleanup of orphaned records
  cleanupOrphanedRecords: () => {
    return api.post('/records/cleanup');
  }
};

export default recordsService;