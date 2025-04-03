/**
 * src/providers/cloudflare/tunnel.js
 * 
 * Cloudflare Tunnel client for TráfegoDNS
 * Handles tunnel-specific operations such as listing, creating, and updating tunnels
 */
const axios = require('axios');
const logger = require('../../utils/logger');

class CloudflareTunnelClient {
  /**
   * Constructor for the Cloudflare Tunnel client
   * @param {Object} config - Configuration options
   * @param {string} config.token - Cloudflare API token
   * @param {string} config.accountId - Cloudflare account ID
   * @param {number} config.timeout - API request timeout (ms)
   */
  constructor(config) {
    this.token = config.token;
    this.accountId = config.accountId;
    
    // Initialize Axios client
    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      timeout: config.timeout || 60000 // Default 60s timeout
    });
    
    logger.trace('CloudflareTunnelClient.constructor: Initialised');
  }
  
  /**
   * Get the account ID if not provided in constructor
   * @returns {Promise<string>} - Cloudflare account ID
   */
  async getAccountId() {
    if (this.accountId) {
      return this.accountId;
    }
    
    logger.debug('CloudflareTunnelClient.getAccountId: Fetching account ID');
    
    try {
      const response = await this.client.get('/accounts');
      
      if (response.data.success && response.data.result.length > 0) {
        this.accountId = response.data.result[0].id;
        logger.debug(`CloudflareTunnelClient.getAccountId: Found account ID: ${this.accountId}`);
        return this.accountId;
      }
      
      throw new Error('No Cloudflare accounts found for this token');
    } catch (error) {
      logger.error(`Failed to get Cloudflare account ID: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * List all tunnels in the account
   * @returns {Promise<Array>} - List of tunnels
   */
  async listTunnels() {
    const accountId = await this.getAccountId();
    
    logger.debug('CloudflareTunnelClient.listTunnels: Listing tunnels');
    
    try {
      const response = await this.client.get(`/accounts/${accountId}/tunnels`);
      
      if (response.data.success) {
        logger.debug(`CloudflareTunnelClient.listTunnels: Found ${response.data.result.length} tunnels`);
        return response.data.result;
      }
      
      throw new Error('Failed to list tunnels: ' + (response.data.errors?.[0]?.message || 'Unknown error'));
    } catch (error) {
      logger.error(`Failed to list Cloudflare tunnels: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get tunnel details by ID or name
   * @param {string} tunnelId - Tunnel ID or name
   * @returns {Promise<Object>} - Tunnel details
   */
  async getTunnel(tunnelId) {
    const accountId = await this.getAccountId();
    
    logger.debug(`CloudflareTunnelClient.getTunnel: Getting tunnel ${tunnelId}`);
    
    try {
      // If tunnelId is a UUID, use it directly
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tunnelId);
      
      if (isUuid) {
        const response = await this.client.get(`/accounts/${accountId}/tunnels/${tunnelId}`);
        
        if (response.data.success) {
          logger.debug(`CloudflareTunnelClient.getTunnel: Found tunnel ${tunnelId}`);
          return response.data.result;
        }
      } else {
        // If tunnelId is a name, fetch all tunnels and filter
        const tunnels = await this.listTunnels();
        const tunnel = tunnels.find(t => t.name === tunnelId);
        
        if (tunnel) {
          logger.debug(`CloudflareTunnelClient.getTunnel: Found tunnel with name ${tunnelId}`);
          return tunnel;
        }
      }
      
      throw new Error(`Tunnel not found: ${tunnelId}`);
    } catch (error) {
      logger.error(`Failed to get Cloudflare tunnel ${tunnelId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the current configuration for a tunnel
   * @param {string} tunnelId - Tunnel ID
   * @returns {Promise<Object>} - Tunnel configuration
   */
  async getTunnelConfiguration(tunnelId) {
    const accountId = await this.getAccountId();
    
    logger.debug(`CloudflareTunnelClient.getTunnelConfiguration: Getting config for tunnel ${tunnelId}`);
    
    try {
      // First ensure we have a valid tunnel ID (converts name to ID if needed)
      const tunnel = await this.getTunnel(tunnelId);
      const actualTunnelId = tunnel.id;
      
      const response = await this.client.get(`/accounts/${accountId}/tunnels/${actualTunnelId}/configurations`);
      
      if (response.data.success) {
        logger.debug(`CloudflareTunnelClient.getTunnelConfiguration: Found config for tunnel ${tunnelId}`);
        return response.data.result;
      }
      
      throw new Error('Failed to get tunnel configuration: ' + (response.data.errors?.[0]?.message || 'Unknown error'));
    } catch (error) {
      logger.error(`Failed to get Cloudflare tunnel configuration for ${tunnelId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update configuration for a tunnel
   * @param {string} tunnelId - Tunnel ID or name
   * @param {Object} config - Tunnel configuration
   * @returns {Promise<Object>} - Updated tunnel configuration
   */
  async updateTunnelConfiguration(tunnelId, config) {
    const accountId = await this.getAccountId();
    
    logger.debug(`CloudflareTunnelClient.updateTunnelConfiguration: Updating config for tunnel ${tunnelId}`);
    logger.trace(`CloudflareTunnelClient.updateTunnelConfiguration: New config: ${JSON.stringify(config)}`);
    
    try {
      // First ensure we have a valid tunnel ID (converts name to ID if needed)
      const tunnel = await this.getTunnel(tunnelId);
      const actualTunnelId = tunnel.id;
      
      // Get existing configuration first
      let existingConfig;
      try {
        existingConfig = await this.getTunnelConfiguration(actualTunnelId);
        logger.debug(`CloudflareTunnelClient.updateTunnelConfiguration: Found existing config for tunnel ${tunnelId}`);
      } catch (error) {
        logger.warn(`No existing configuration found for tunnel ${tunnelId}, creating new one`);
        existingConfig = { config: { ingress: [] } };
      }
      
      // Make sure we have an ingress array
      if (!existingConfig.config) {
        existingConfig.config = {};
      }
      
      if (!existingConfig.config.ingress) {
        existingConfig.config.ingress = [];
      }
      
      // Merge configurations
      const mergedConfig = this.mergeConfigurations(existingConfig, config);
      
      const response = await this.client.put(
        `/accounts/${accountId}/tunnels/${actualTunnelId}/configurations`,
        mergedConfig
      );
      
      if (response.data.success) {
        logger.success(`Updated configuration for tunnel ${tunnelId}`);
        return response.data.result;
      }
      
      throw new Error('Failed to update tunnel configuration: ' + (response.data.errors?.[0]?.message || 'Unknown error'));
    } catch (error) {
      logger.error(`Failed to update Cloudflare tunnel configuration for ${tunnelId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Merge existing tunnel configuration with new configuration
   * @param {Object} existing - Existing tunnel configuration 
   * @param {Object} newConfig - New tunnel configuration to merge
   * @returns {Object} - Merged configuration
   */
  mergeConfigurations(existing, newConfig) {
    // Start with a copy of the existing config
    const merged = JSON.parse(JSON.stringify(existing));
    
    // For hostname-based configurations, replace any existing entry
    if (newConfig.hostname) {
      // Find if this hostname already exists in the configuration
      const existingIndex = merged.config.ingress.findIndex(
        entry => entry.hostname === newConfig.hostname
      );
      
      if (existingIndex >= 0) {
        // Replace existing entry
        merged.config.ingress[existingIndex] = {
          hostname: newConfig.hostname,
          path: newConfig.path || '/',
          service: newConfig.service
        };
        
        logger.debug(`CloudflareTunnelClient.mergeConfigurations: Updated existing entry for ${newConfig.hostname}`);
      } else {
        // Add new entry before the catch-all rule (which should always be last)
        // First check if the last rule is a catch-all
        const hasCatchAll = merged.config.ingress.length > 0 && 
                          !merged.config.ingress[merged.config.ingress.length - 1].hostname;
        
        if (hasCatchAll) {
          // Insert before the catch-all
          merged.config.ingress.splice(merged.config.ingress.length - 1, 0, {
            hostname: newConfig.hostname,
            path: newConfig.path || '/',
            service: newConfig.service
          });
        } else {
          // Add to the end
          merged.config.ingress.push({
            hostname: newConfig.hostname,
            path: newConfig.path || '/',
            service: newConfig.service
          });
          
          // Add a catch-all rule if it doesn't exist
          merged.config.ingress.push({
            service: "http_status:404"
          });
        }
        
        logger.debug(`CloudflareTunnelClient.mergeConfigurations: Added new entry for ${newConfig.hostname}`);
      }
    } 
    // For more complex configurations, replace the entire config
    else if (newConfig.config) {
      merged.config = newConfig.config;
      logger.debug('CloudflareTunnelClient.mergeConfigurations: Replaced entire configuration');
    }
    
    return merged;
  }
  
  /**
   * Configure a hostname to route through a tunnel
   * @param {string} tunnelId - Tunnel ID or name
   * @param {string} hostname - Hostname to route (e.g., app.example.com)
   * @param {string} service - Service URL (e.g., http://localhost:3000)
   * @param {string} path - Path prefix (e.g., / or /api)
   * @returns {Promise<Object>} - Updated tunnel configuration
   */
  async configureHostname(tunnelId, hostname, service, path = '/') {
    logger.debug(`CloudflareTunnelClient.configureHostname: Configuring ${hostname} on tunnel ${tunnelId}`);
    
    return this.updateTunnelConfiguration(tunnelId, {
      hostname,
      service,
      path
    });
  }
  
  /**
   * Remove a hostname from a tunnel configuration
   * @param {string} tunnelId - Tunnel ID or name
   * @param {string} hostname - Hostname to remove
   * @returns {Promise<Object>} - Updated tunnel configuration
   */
  async removeHostname(tunnelId, hostname) {
    const accountId = await this.getAccountId();
    
    logger.debug(`CloudflareTunnelClient.removeHostname: Removing ${hostname} from tunnel ${tunnelId}`);
    
    try {
      // First ensure we have a valid tunnel ID (converts name to ID if needed)
      const tunnel = await this.getTunnel(tunnelId);
      const actualTunnelId = tunnel.id;
      
      // Get existing configuration
      const existingConfig = await this.getTunnelConfiguration(actualTunnelId);
      
      // Make sure we have a valid ingress array
      if (!existingConfig.config || !existingConfig.config.ingress) {
        logger.debug(`CloudflareTunnelClient.removeHostname: No ingress config found for tunnel ${tunnelId}`);
        return existingConfig;
      }
      
      // Find and remove the hostname
      const ingressRules = existingConfig.config.ingress;
      const initialLength = ingressRules.length;
      
      existingConfig.config.ingress = ingressRules.filter(rule => rule.hostname !== hostname);
      
      const removed = initialLength - existingConfig.config.ingress.length;
      
      if (removed > 0) {
        logger.debug(`CloudflareTunnelClient.removeHostname: Removed ${removed} rules for ${hostname}`);
        
        // Make sure we still have a catch-all rule at the end
        const lastRule = existingConfig.config.ingress[existingConfig.config.ingress.length - 1];
        
        if (!lastRule || lastRule.hostname) {
          existingConfig.config.ingress.push({
            service: "http_status:404"
          });
          logger.debug('CloudflareTunnelClient.removeHostname: Added catch-all rule');
        }
        
        // Update the configuration
        const response = await this.client.put(
          `/accounts/${accountId}/tunnels/${actualTunnelId}/configurations`,
          existingConfig
        );
        
        if (response.data.success) {
          logger.success(`Removed ${hostname} from tunnel ${tunnelId}`);
          return response.data.result;
        }
        
        throw new Error('Failed to update tunnel configuration: ' + (response.data.errors?.[0]?.message || 'Unknown error'));
      } else {
        logger.debug(`CloudflareTunnelClient.removeHostname: Hostname ${hostname} not found in tunnel config`);
        return existingConfig;
      }
    } catch (error) {
      logger.error(`Failed to remove ${hostname} from Cloudflare tunnel ${tunnelId}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = CloudflareTunnelClient;