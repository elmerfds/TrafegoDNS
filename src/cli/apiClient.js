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
const fs = require('fs');

class ApiClient {
  constructor(config) {
    this.config = config || {};

    // Determine if we're running in a container
    const isContainer = process.env.CONTAINER === 'true' ||
                        process.env.IN_CONTAINER === 'true' ||
                        fs.existsSync('/.dockerenv');

    // Try to determine API URL - default to localhost if not specified
    const apiUrl = this.config.apiUrl ||
                   process.env.API_URL ||
                   (isContainer ? 'http://localhost:3000' : 'http://localhost:3000');

    // Generate a secure internal token
    this.internalToken = this.config.localAuthBypass?.cliToken ||
                         process.env.CLI_TOKEN ||
                         'trafegodns-cli';

    // Check if we are running inside the container and can access services directly
    this.hasDirectAccess = isContainer && !!global.services;

    // Set up axios client with base configuration
    this.client = axios.create({
      baseURL: `${apiUrl}/api/v1`,
      timeout: this.config.apiTimeout || 60000,
      headers: {
        'Content-Type': 'application/json',
        'X-Trafego-CLI': this.internalToken,    // Use special header for CLI
        'X-API-KEY': this.internalToken,        // Add API key header for compatibility
        'X-Trafego-Internal': 'true'            // Mark as internal request
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
    // Try direct access first if available
    if (this.hasDirectAccess && global.services?.DNSManager) {
      try {
        const records = await global.services.DNSManager.dnsProvider.getRecordsFromCache(true);
        return { status: 'success', data: records };
      } catch (err) {
        logger.debug(`Direct access failed, falling back to API: ${err.message}`);
      }
    }
    
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
    // Try direct access first if available
    if (this.hasDirectAccess && global.services?.DNSManager) {
      try {
        await global.services.DNSManager.refreshRecords();
        return { status: 'success', message: 'DNS records refreshed successfully' };
      } catch (err) {
        logger.debug(`Direct access failed, falling back to API: ${err.message}`);
      }
    }
    
    return this.client.post('/dns/refresh');
  }

  /**
   * Process DNS records
   * @param {boolean} force - Force update of all records
   */
  async processDnsRecords(force = false) {
    // Try direct access first if available
    if (this.hasDirectAccess && global.services?.Monitor) {
      try {
        const result = await global.services.Monitor.processHostnames(force);
        return { 
          status: 'success', 
          message: 'DNS records processed successfully', 
          data: result 
        };
      } catch (err) {
        logger.debug(`Direct access failed, falling back to API: ${err.message}`);
      }
    }
    
    return this.client.post('/dns/process', { force });
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