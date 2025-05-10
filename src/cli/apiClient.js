/**
 * TrafegoDNS CLI API Client
 * 
 * This client allows the CLI to communicate with the API server
 * using local authentication bypass when appropriate.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const crypto = require('crypto');

class ApiClient {
  constructor(config) {
    this.config = config;
    
    // Generate a secure internal token
    this.internalToken = config.localAuthBypass?.internalToken || 
                         process.env.TRAFEGO_INTERNAL_TOKEN || 
                         crypto.randomBytes(32).toString('hex');
    
    // Set up axios client with base configuration
    this.client = axios.create({
      baseURL: `http://localhost:${process.env.API_PORT || 3000}/api/v1`,
      timeout: config.apiTimeout || 60000,
      headers: {
        'Content-Type': 'application/json',
        'X-Trafego-Internal': this.internalToken,
        'X-Trafego-CLI': '1'
      }
    });
    
    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        if (process.env.NODE_ENV === 'development') {
          logger.debug(`CLI API Request: ${config.method.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        logger.error(`CLI API Request Error: ${error.message}`);
        return Promise.reject(error);
      }
    );
    
    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        return response.data;
      },
      (error) => {
        if (error.response) {
          logger.error(`CLI API Error: ${error.response.status} - ${error.response.data.message || 'Unknown error'}`);
          return Promise.reject(error.response.data);
        } else if (error.request) {
          logger.error(`CLI API Error: No response received`);
          return Promise.reject({ message: 'No response received from API server' });
        } else {
          logger.error(`CLI API Error: ${error.message}`);
          return Promise.reject({ message: error.message });
        }
      }
    );
  }
  
  /**
   * Get system status
   */
  async getStatus() {
    return this.client.get('/status');
  }
  
  /**
   * Get all DNS records
   */
  async getDnsRecords(params = {}) {
    return this.client.get('/dns/records', { params });
  }
  
  /**
   * Get a specific DNS record
   */
  async getDnsRecord(id) {
    return this.client.get(`/dns/records/${id}`);
  }
  
  /**
   * Create a DNS record
   */
  async createDnsRecord(recordData) {
    return this.client.post('/dns/records', recordData);
  }
  
  /**
   * Update a DNS record
   */
  async updateDnsRecord(id, recordData) {
    return this.client.put(`/dns/records/${id}`, recordData);
  }
  
  /**
   * Delete a DNS record
   */
  async deleteDnsRecord(id) {
    return this.client.delete(`/dns/records/${id}`);
  }
  
  /**
   * Get all managed hostnames
   */
  async getHostnames(params = {}) {
    return this.client.get('/hostnames', { params });
  }
  
  /**
   * Force DNS refresh
   */
  async refreshDns() {
    return this.client.post('/dns/refresh');
  }
  
  /**
   * Get configuration
   */
  async getConfig() {
    return this.client.get('/config');
  }
  
  /**
   * Update configuration
   */
  async updateConfig(configData) {
    return this.client.patch('/config', configData);
  }
  
  /**
   * Get all containers
   */
  async getContainers(params = {}) {
    return this.client.get('/containers', { params });
  }
  
  /**
   * Get a specific container
   */
  async getContainer(id) {
    return this.client.get(`/containers/${id}`);
  }
}

module.exports = ApiClient;