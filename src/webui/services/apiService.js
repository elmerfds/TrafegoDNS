// src/webui/services/apiService.js
import axios from 'axios';

// Create axios instance with default config
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    // Handle errors globally
    console.error('API Error:', error.response || error.message);
    return Promise.reject(error);
  }
);

// API functions

// Status and config
export const fetchStatus = async () => {
  const response = await api.get('/status');
  return response.data;
};

export const fetchConfig = async () => {
  const response = await api.get('/config');
  return response.data;
};

export const updateLogLevel = async (level) => {
  const response = await api.post('/config/log-level', { level });
  return response.data;
};

// DNS records
export const fetchRecords = async () => {
  const response = await api.get('/records');
  return response.data;
};

export const fetchTrackedRecords = async () => {
  const response = await api.get('/records/tracked');
  return response.data;
};

export const triggerRefresh = async () => {
  const response = await api.post('/refresh');
  return response.data;
};

// Preserved hostnames
export const fetchPreservedHostnames = async () => {
  const response = await api.get('/preserved-hostnames');
  return response.data;
};

export const addPreservedHostname = async (hostname) => {
  const response = await api.post('/preserved-hostnames', { hostname });
  return response.data;
};

export const removePreservedHostname = async (hostname) => {
  const response = await api.delete(`/preserved-hostnames/${encodeURIComponent(hostname)}`);
  return response.data;
};

// Managed hostnames
export const fetchManagedHostnames = async () => {
  const response = await api.get('/managed-hostnames');
  return response.data;
};

export const addManagedHostname = async (hostnameData) => {
  const response = await api.post('/managed-hostnames', hostnameData);
  return response.data;
};

export const removeManagedHostname = async (hostname) => {
  const response = await api.delete(`/managed-hostnames/${encodeURIComponent(hostname)}`);
  return response.data;
};

// Activity log
export const fetchActivityLog = async () => {
  const response = await api.get('/activity-log');
  return response.data;
};

export default api;
