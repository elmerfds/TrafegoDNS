/**
 * CloudFlare Tunnel Management Module
 * 
 * File: src/providers/cloudflare/tunnel.js
 * 
 * Handles CloudFlare Tunnel public hostnames management
 */
const axios = require('axios');
const logger = require('../../utils/logger');

class CloudFlareTunnelManager {
  constructor(config, cloudflareProvider) {
    this.config = config;
    this.cloudflareProvider = cloudflareProvider;
    
    // Tunnel configuration
    this.tunnelId = config.cloudflareTunnelId;
    this.tunnelName = config.cloudflareTunnelName;
    this.tunnelToken = config.cloudflareToken; // Reuse the same token
    
    // CloudFlare account ID is required for tunnel operations
    this.accountId = config.cloudflareAccountId;
    
    // Initialize Axios client
    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${this.tunnelToken}`,
        'Content-Type': 'application/json'
      },
      timeout: config.apiTimeout
    });
    
    // Cache for tunnel hostnames
    this.hostnameCache = {
      hostnames: [],
      lastUpdated: 0
    };
    
    // Zone information
    this.zone = config.cloudflareZone;
    this.zoneId = null; // Will be set during init
    
    logger.debug('CloudFlare Tunnel Manager initialised');
  }
  
  /**
   * Initialize the tunnel manager
   */
  async init() {
    logger.debug('Initialising CloudFlare Tunnel Manager');
    
    try {
      // Get zone ID from the CloudFlare provider
      this.zoneId = this.cloudflareProvider.zoneId;
      
      if (!this.zoneId) {
        throw new Error('Zone ID not available from CloudFlare provider');
      }
      
      // Resolve tunnel ID from name if needed
      await this.resolveTunnelId();
      
      // Fetch initial hostname cache
      await this.refreshHostnameCache();
      
      logger.success('CloudFlare Tunnel Manager initialised successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialise CloudFlare Tunnel Manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Resolve tunnel ID from name if name is provided
   */
  async resolveTunnelId() {
    // If tunnel ID is directly provided, use it
    if (this.tunnelId) {
      logger.debug(`Using configured tunnel ID: ${this.tunnelId}`);
      return this.tunnelId;
    }
    
    // Otherwise, look up by name
    if (this.tunnelName) {
      logger.debug(`Looking up tunnel ID for name: ${this.tunnelName}`);
      
      try {
        // List all tunnels and find the one with matching name
        const response = await this.client.get(`/accounts/${this.accountId}/cfd_tunnel`);
        const tunnels = response.data.result || [];
        
        const matchingTunnel = tunnels.find(tunnel => 
          tunnel.name.toLowerCase() === this.tunnelName.toLowerCase()
        );
        
        if (matchingTunnel) {
          this.tunnelId = matchingTunnel.id;
          logger.info(`Resolved tunnel ID: ${this.tunnelId} for name: ${this.tunnelName}`);
          return this.tunnelId;
        } else {
          throw new Error(`Tunnel with name '${this.tunnelName}' not found`);
        }
      } catch (error) {
        logger.error(`Failed to resolve tunnel ID from name: ${error.message}`);
        throw error;
      }
    }
    
    throw new Error('Neither tunnel ID nor tunnel name provided');
  }
  
  /**
   * Refresh the tunnel hostname cache
   */
  async refreshHostnameCache() {
    logger.debug('Refreshing CloudFlare Tunnel hostname cache');
    
    try {
      if (!this.tunnelId) {
        await this.resolveTunnelId();
      }
      
      // Fetch tunnel configuration which contains the ingress rules (hostnames)
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`
      );
      
      const config = response.data.result.config || {};
      const ingress = config.ingress || [];
      const oldHostnameCount = this.hostnameCache.hostnames.length;
      
      // Extract hostnames from ingress rules
      const hostnames = [];
      
      // Process each ingress rule
      for (const rule of ingress) {
        // Skip catch-all rule (usually the last rule)
        if (rule.hostname === '*' || !rule.hostname) continue;
        
        hostnames.push({
          hostname: rule.hostname,
          service: rule.service || '',
          path: rule.path || '',
          tunnelId: this.tunnelId,
          originRequest: rule.originRequest || {}
        });
      }
      
      this.hostnameCache = {
        hostnames: hostnames,
        lastUpdated: Date.now()
      };
      
      logger.debug(`Cached ${this.hostnameCache.hostnames.length} tunnel hostnames (was ${oldHostnameCount})`);
      
      return hostnames;
    } catch (error) {
      logger.error(`Failed to refresh tunnel hostname cache: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get hostnames from cache, refreshing if necessary
   */
  async getHostnamesFromCache(forceRefresh = false) {
    const cacheAge = Date.now() - this.hostnameCache.lastUpdated;
    const cacheRefreshInterval = this.config.cacheRefreshInterval;
    
    // Check if cache is stale or if force refresh is requested
    if (forceRefresh || cacheAge > cacheRefreshInterval || this.hostnameCache.hostnames.length === 0) {
      await this.refreshHostnameCache();
    }
    
    return this.hostnameCache.hostnames;
  }
  
  /**
   * Get the current tunnel configuration
   */
  async getTunnelConfig() {
    try {
      const response = await this.client.get(
        `/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`
      );
      
      return response.data.result.config || {};
    } catch (error) {
      logger.error(`Failed to get tunnel configuration: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update the tunnel configuration
   */
  async updateTunnelConfig(config) {
    try {
      const response = await this.client.put(
        `/accounts/${this.accountId}/cfd_tunnel/${this.tunnelId}/configurations`,
        { config }
      );
      
      return response.data.result || {};
    } catch (error) {
      logger.error(`Failed to update tunnel configuration: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find a hostname in the ingress rules
   */
  findHostnameInIngress(ingress, hostname) {
    return ingress.findIndex(rule => rule.hostname === hostname);
  }
  
  /**
   * Create a new public hostname for the tunnel
   */
  async createHostname(hostname, service, path = '', originRequest = {}) {
    logger.debug(`Creating CloudFlare Tunnel hostname: ${hostname} -> ${service}`);
    
    try {
      // Get current config
      const config = await this.getTunnelConfig();
      let ingress = config.ingress || [];
      
      // Check if hostname already exists
      const existingIndex = this.findHostnameInIngress(ingress, hostname);
      
      if (existingIndex !== -1) {
        logger.info(`Tunnel hostname ${hostname} already exists, updating it`);
        
        // Update existing hostname
        ingress[existingIndex] = {
          hostname: hostname,
          service: service,
          path: path,
          originRequest: originRequest
        };
      } else {
        // Find the default/catch-all rule which should be preserved at the end
        const catchAllIndex = ingress.findIndex(rule => rule.hostname === '*' || !rule.hostname);
        
        if (catchAllIndex === -1) {
          // No catch-all rule found, add the new rule to the end
          // and add a default catch-all rule
          ingress.push({
            hostname: hostname,
            service: service,
            path: path,
            originRequest: originRequest
          });
          
          // Add a default catch-all rule
          ingress.push({
            service: "http_status:404"
          });
        } else {
          // Insert the new rule before the catch-all rule
          ingress.splice(catchAllIndex, 0, {
            hostname: hostname,
            service: service,
            path: path,
            originRequest: originRequest
          });
        }
      }
      
      // Update config with the new ingress rules
      config.ingress = ingress;
      
      // Update the tunnel configuration
      await this.updateTunnelConfig(config);
      
      // Refresh the cache
      await this.refreshHostnameCache();
      
      logger.success(`Created CloudFlare Tunnel public hostname: ${hostname} -> ${service}`);
      return hostname;
    } catch (error) {
      logger.error(`Failed to create CloudFlare Tunnel hostname: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update an existing public hostname
   */
  async updateHostname(hostname, service, path = '', originRequest = {}) {
    logger.debug(`Updating CloudFlare Tunnel hostname: ${hostname} -> ${service}`);
    
    try {
      // Get current config
      const config = await this.getTunnelConfig();
      let ingress = config.ingress || [];
      
      // Check if hostname exists
      const existingIndex = this.findHostnameInIngress(ingress, hostname);
      
      if (existingIndex === -1) {
        logger.info(`Tunnel hostname ${hostname} not found, creating it`);
        return await this.createHostname(hostname, service, path, originRequest);
      }
      
      // Update existing hostname
      ingress[existingIndex] = {
        hostname: hostname,
        service: service,
        path: path,
        originRequest: originRequest
      };
      
      // Update config with the modified ingress rules
      config.ingress = ingress;
      
      // Update the tunnel configuration
      await this.updateTunnelConfig(config);
      
      // Refresh the cache
      await this.refreshHostnameCache();
      
      logger.success(`Updated CloudFlare Tunnel public hostname: ${hostname} -> ${service}`);
      return hostname;
    } catch (error) {
      logger.error(`Failed to update CloudFlare Tunnel hostname: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a public hostname
   */
  async deleteHostname(hostname) {
    logger.debug(`Deleting CloudFlare Tunnel hostname: ${hostname}`);
    
    try {
      // Get current config
      const config = await this.getTunnelConfig();
      let ingress = config.ingress || [];
      
      // Check if hostname exists
      const existingIndex = this.findHostnameInIngress(ingress, hostname);
      
      if (existingIndex === -1) {
        logger.warn(`Tunnel hostname ${hostname} not found, nothing to delete`);
        return false;
      }
      
      // Remove the hostname rule
      ingress.splice(existingIndex, 1);
      
      // Update config with the modified ingress rules
      config.ingress = ingress;
      
      // Update the tunnel configuration
      await this.updateTunnelConfig(config);
      
      // Refresh the cache
      await this.refreshHostnameCache();
      
      logger.success(`Deleted CloudFlare Tunnel public hostname: ${hostname}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete CloudFlare Tunnel hostname: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Process a list of hostnames for the tunnel
   * Compares against existing hostnames and applies changes
   */
  async processHostnames(hostnames, containerLabels) {
    logger.debug(`Processing ${hostnames.length} hostnames for CloudFlare Tunnel`);
    
    try {
      // Build tunnel hostname configurations from labels
      const hostnameConfigs = [];
      
      for (const hostname of hostnames) {
        // Skip hostnames that don't match our zone
        if (!hostname.endsWith(this.zone) && !hostname.endsWith(`.${this.zone}`)) {
          logger.debug(`Skipping hostname ${hostname} - not in zone ${this.zone}`);
          continue;
        }
        
        // Find container labels for this hostname
        const labels = containerLabels[hostname] || {};
        
        // Get tunnel service from labels
        const service = this.getTunnelServiceFromLabels(labels, hostname);
        
        // Get tunnel path from labels (optional)
        const path = this.getTunnelPathFromLabels(labels);
        
        // Build origin request options (optional)
        const originRequest = this.getTunnelOriginRequestFromLabels(labels);
        
        hostnameConfigs.push({
          hostname,
          service,
          path,
          originRequest
        });
      }
      
      // Process the hostname configurations in batch
      const results = await this.batchEnsureHostnames(hostnameConfigs);
      
      return results;
    } catch (error) {
      logger.error(`Error processing hostnames for CloudFlare Tunnel: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Batch ensure hostnames - create, update, or delete hostnames in bulk
   */
  async batchEnsureHostnames(hostnameConfigs) {
    if (!hostnameConfigs || hostnameConfigs.length === 0) {
      logger.trace('CloudFlareTunnelManager.batchEnsureHostnames: No hostname configs provided, skipping');
      return [];
    }
    
    logger.debug(`Batch processing ${hostnameConfigs.length} CloudFlare Tunnel hostnames`);
    
    try {
      // Get current config
      const config = await this.getTunnelConfig();
      let ingress = config.ingress || [];
      
      // Process each hostname configuration
      const results = [];
      const pendingChanges = {
        create: [],
        update: [],
        unchanged: []
      };
      
      // First pass: examine all hostnames and sort into categories
      for (const hostnameConfig of hostnameConfigs) {
        try {
          const { hostname, service, path = '', originRequest = {} } = hostnameConfig;
          
          // Find existing hostname rule
          const existingIndex = this.findHostnameInIngress(ingress, hostname);
          
          if (existingIndex !== -1) {
            // Hostname rule exists, check if it needs updating
            const existingRule = ingress[existingIndex];
            
            const needsUpdate = 
              existingRule.service !== service ||
              existingRule.path !== path ||
              JSON.stringify(existingRule.originRequest || {}) !== JSON.stringify(originRequest);
            
            if (needsUpdate) {
              pendingChanges.update.push({
                hostname,
                service,
                path,
                originRequest,
                existingIndex
              });
            } else {
              pendingChanges.unchanged.push({
                hostname,
                existingIndex
              });
            }
          } else {
            // Need to create a new hostname rule
            pendingChanges.create.push({
              hostname,
              service,
              path,
              originRequest
            });
          }
        } catch (error) {
          logger.error(`Error processing hostname ${hostnameConfig.hostname}: ${error.message}`);
        }
      }
      
      // If we have changes, update the ingress rules
      if (pendingChanges.create.length > 0 || pendingChanges.update.length > 0) {
        // Find the catch-all rule which should be preserved at the end
        const catchAllIndex = ingress.findIndex(rule => rule.hostname === '*' || !rule.hostname);
        
        // Apply updates first
        for (const { hostname, service, path, originRequest, existingIndex } of pendingChanges.update) {
          ingress[existingIndex] = {
            hostname,
            service,
            path,
            originRequest
          };
          
          results.push({ hostname, service, operation: 'updated' });
          logger.info(`📝 Updating CloudFlare Tunnel hostname: ${hostname} -> ${service}`);
        }
        
        // Determine where to insert new rules
        let insertionIndex;
        if (catchAllIndex !== -1) {
          // Insert before the catch-all rule
          insertionIndex = catchAllIndex;
        } else {
          // If no catch-all rule, add at the end
          insertionIndex = ingress.length;
        }
        
        // Apply creates
        for (const { hostname, service, path, originRequest } of pendingChanges.create) {
          // Insert the new rule at the determined position
          ingress.splice(insertionIndex, 0, {
            hostname,
            service,
            path,
            originRequest
          });
          
          // Update insertion index for next rule
          insertionIndex++;
          
          results.push({ hostname, service, operation: 'created' });
          logger.info(`✨ Creating CloudFlare Tunnel hostname: ${hostname} -> ${service}`);
        }
        
        // If we don't have a catch-all rule, add one
        if (catchAllIndex === -1) {
          ingress.push({
            service: "http_status:404"
          });
        }
        
        // Update config with the modified ingress rules
        config.ingress = ingress;
        
        // Update the tunnel configuration
        await this.updateTunnelConfig(config);
        
        // Refresh the cache
        await this.refreshHostnameCache();
        
        // Log success
        if (results.length > 0) {
          logger.success(`Processed ${results.length} CloudFlare Tunnel hostnames`);
        }
      } else {
        logger.debug('No CloudFlare Tunnel hostname changes needed');
      }
      
      // Add unchanged hostnames to results
      for (const { hostname } of pendingChanges.unchanged) {
        results.push({ hostname, operation: 'unchanged' });
      }
      
      return results;
    } catch (error) {
      logger.error(`Failed to batch process CloudFlare Tunnel hostnames: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Extract tunnel service from container labels
   */
  getTunnelServiceFromLabels(labels, hostname) {
    const genericPrefix = this.config.genericLabelPrefix;
    const providerPrefix = this.config.dnsLabelPrefix;
    
    // Check for provider-specific tunnel service label first
    if (labels[`${providerPrefix}tunnel.service`]) {
      return labels[`${providerPrefix}tunnel.service`];
    }
    
    // Then check for generic tunnel service label
    if (labels[`${genericPrefix}tunnel.service`]) {
      return labels[`${genericPrefix}tunnel.service`];
    }
    
    // Extract service from container details (containerName:port format)
    const containerName = labels.containerName || 'unknown';
    const traefikLabelPrefix = this.config.traefikLabelPrefix;
    
    // Try to get port from Traefik labels
    let port = '80'; // Default port
    
    // Try different methods to find the port
    const serviceName = labels[`${traefikLabelPrefix}http.routers.${labels.routerName}.service`];
    if (serviceName) {
      // Try to find the port from the service configuration
      const servicePortLabel = `${traefikLabelPrefix}http.services.${serviceName}.loadbalancer.server.port`;
      if (labels[servicePortLabel]) {
        port = labels[servicePortLabel];
      }
    }
    
    // Return service in 'hostname:port' format
    return `${containerName}:${port}`;
  }
  
  /**
   * Extract tunnel path from container labels
   */
  getTunnelPathFromLabels(labels) {
    const genericPrefix = this.config.genericLabelPrefix;
    const providerPrefix = this.config.dnsLabelPrefix;
    
    // Check for provider-specific tunnel path label first
    if (labels[`${providerPrefix}tunnel.path`]) {
      return labels[`${providerPrefix}tunnel.path`];
    }
    
    // Then check for generic tunnel path label
    if (labels[`${genericPrefix}tunnel.path`]) {
      return labels[`${genericPrefix}tunnel.path`];
    }
    
    return '';
  }
  
  /**
   * Extract tunnel origin request options from container labels
   */
  getTunnelOriginRequestFromLabels(labels) {
    const genericPrefix = this.config.genericLabelPrefix;
    const providerPrefix = this.config.dnsLabelPrefix;
    const originRequest = {};
    
    // Process origin request headers
    const headersLabelSpecific = labels[`${providerPrefix}tunnel.headers`];
    const headersLabelGeneric = labels[`${genericPrefix}tunnel.headers`];
    
    if (headersLabelSpecific || headersLabelGeneric) {
      const headersStr = headersLabelSpecific || headersLabelGeneric;
      try {
        const headers = JSON.parse(headersStr);
        originRequest.headers = headers;
      } catch (error) {
        logger.warn(`Invalid tunnel headers JSON: ${error.message}`);
      }
    }
    
    // Process other origin request options (can be expanded as needed)
    // For example: TLS settings, connect_timeout, etc.
    
    return originRequest;
  }
  
  /**
   * Check if a hostname is managed by this tunnel
   */
  isHostnameManaged(hostname) {
    return this.hostnameCache.hostnames.some(h => h.hostname === hostname);
  }
}

module.exports = CloudFlareTunnelManager;