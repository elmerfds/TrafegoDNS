// src/webui/services/apiService.js
import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 second timeout
});

// Add request interceptor for logging
api.interceptors.request.use(
  config => {
    console.log(`API Request: ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  response => {
    console.log(`API Response from ${response.config.url}:`, response.status);
    return response;
  },
  error => {
    // Handle errors globally
    if (error.response) {
      console.error('API Error Response:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('API Error: No response received', error.request);
    } else {
      console.error('API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// API functions

// Status and config
export const fetchStatus = async () => {
  console.log('Fetching application status');
  const response = await api.get('/status');
  return response.data;
};

export const fetchConfig = async () => {
  console.log('Fetching configuration');
  const response = await api.get('/config');
  return response.data;
};

export const updateLogLevel = async (level) => {
  console.log(`Updating log level to ${level}`);
  const response = await api.post('/config/log-level', { level });
  return response.data;
};

// DNS records
export const fetchRecords = async () => {
  console.log('Fetching DNS records');
  const response = await api.get('/records');
  return response.data;
};

export const fetchTrackedRecords = async () => {
  console.log('Fetching tracked DNS records');
  const response = await api.get('/records/tracked');
  return response.data;
};

export const triggerRefresh = async () => {
  console.log('Triggering DNS records refresh');
  const response = await api.post('/refresh');
  return response.data;
};

export const deleteRecord = async (id) => {
  console.log(`Deleting DNS record with ID: ${id}`);
  const response = await api.delete(`/records/${id}`);
  return response.data;
};

// Preserved hostnames
export const fetchPreservedHostnames = async () => {
  console.log('Fetching preserved hostnames');
  const response = await api.get('/preserved-hostnames');
  return response.data;
};

export const addPreservedHostname = async (hostname) => {
  console.log(`Adding preserved hostname: ${hostname}`);
  const response = await api.post('/preserved-hostnames', { hostname });
  return response.data;
};

export const removePreservedHostname = async (hostname) => {
  console.log(`Removing preserved hostname: ${hostname}`);
  const response = await api.delete(`/preserved-hostnames/${encodeURIComponent(hostname)}`);
  return response.data;
};

// Managed hostnames
export const fetchManagedHostnames = async () => {
  console.log('Fetching managed hostnames');
  const response = await api.get('/managed-hostnames');
  return response.data;
};

export const addManagedHostname = async (hostnameData) => {
  console.log(`Adding managed hostname: ${hostnameData.hostname}`);
  const response = await api.post('/managed-hostnames', hostnameData);
  return response.data;
};

export const removeManagedHostname = async (hostname) => {
  console.log(`Removing managed hostname: ${hostname}`);
  const response = await api.delete(`/managed-hostnames/${encodeURIComponent(hostname)}`);
  return response.data;
};

// Activity log
export const fetchActivityLog = async (params = {}) => {
  console.log('Fetching activity log with params:', params);
  const response = await api.get('/activity-log', { params });
  return response.data;
};

// Cleanup operations
export const toggleCleanup = async (enabled) => {
  console.log(`Toggling cleanup orphaned records: ${enabled}`);
  const response = await api.post('/cleanup/toggle', { enabled });
  return response.data;
};

export const runCleanup = async () => {
  console.log('Running manual cleanup');
  const response = await api.post('/cleanup/run');
  return response.data;
};

// Cache operations
export const refreshCache = async () => {
  console.log('Refreshing DNS cache');
  const response = await api.post('/cache/refresh');
  return response.data;
};

// Operation mode
export const setOperationMode = async (mode) => {
  console.log(`Setting operation mode to: ${mode}`);
  const response = await api.post('/operation-mode', { mode });
  return response.data;
};

export default api;