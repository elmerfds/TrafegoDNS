/**
 * src/providers/cloudflare/tunnel.js
 * CloudFlare Tunnel API client and hostname management
 */
const axios = require('axios');
const logger = require('../../utils/logger');

class CloudFlareTunnelManager {
  constructor(config, cloudflareProvider) {
    this.config = config;
    this.cloudflareProvider = cloudflareProvider;
    this.tunnelId = config.cfTunnelId;
    this.tunnelName = config.cfTunnelName;
    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'Authorization': `Bearer ${config.cloudflareToken}`,
        'Content-Type': 'application/json'
      },
      timeout: config.apiTimeout  // Use the configurable timeout
    });
    
    // Cache for tunnel hostnames
    this.hostnameCache = {
      hostnames: [],
      lastUpdated: 0
    };
  }
  
  /**
   * Resolve tunnel ID from name if necessary
   */
  async resolveTunnelId() {
    // If we already have an ID, no need to resolve
    if (this.tunnelId) {
      logger.debug(`Using provided tunnel ID: ${this.tunnelId}`);
      return this.tunnelId;
    }
    
    // If we have a name but no ID, look up the ID
    if (this.tunnelName) {
      logger.info(`Looking up tunnel ID for name: "${this.tunnelName}"`);
      
      try {
        // Get all tunnels for the account
        const response = await this.client.get(`/accounts/${this.config.cloudflareAccountId}/cfd_tunnel`);
        const tunnels = response.data.result || [];
        
        // Find tunnel by name
        const matchingTunnel = tunnels.find(tunnel => 
          tunnel.name.toLowerCase() === this.tunnelName.toLowerCase()
        );
        
        if (matchingTunnel) {
          this.tunnelId = matchingTunnel.id;
          logger.success(`Resolved tunnel name "${this.tunnelName}" to ID: ${this.tunnelId}`);
          return this.tunnelId;
        } else {
          throw new Error(`No tunnel found with name "${this.tunnelName}"`);
        }
      } catch (error) {
        logger.error(`Failed to resolve tunnel ID from name: ${error.message}`);
        throw error;
      }
    }
    
    throw new Error('No tunnel ID or name provided');
  }
  
  /**
   * initialise the tunnel manager
   */
  async init() {
    logger.debug('initialising CloudFlare Tunnel Manager...');
    
    try {
      // Resolve tunnel ID from name if necessary
      await this.resolveTunnelId();
      
      // Verify tunnel exists and is active
      const tunnel = await this.getTunnel(this.tunnelId);
      
      if (!tunnel) {
        throw new Error(`CloudFlare Tunnel with ID ${this.tunnelId} not found`);
      }
      
      if (tunnel.status !== 'active') {
        logger.warn(`CloudFlare Tunnel ${this.tunnelId} is not active (status: ${tunnel.status})`);
      }
      
      logger.success(`Successfully connected to CloudFlare Tunnel: ${tunnel.name} (${this.tunnelId})`);
      
      // initialise hostname cache
      await this.refreshHostnameCache();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialise CloudFlare Tunnel Manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get tunnel information
   */
  async getTunnel(tunnelId) {
    try {
      const response = await this.client.get(`/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${tunnelId}`);
      return response.data.result;
    } catch (error) {
      logger.error(`Failed to get CloudFlare Tunnel information: ${error.message}`);
      
      if (error.response && error.response.status === 404) {
        logger.error(`CloudFlare Tunnel with ID ${tunnelId} not found. Please check your configuration.`);
      }
      
      throw error;
    }
  }
  
  /**
   * Refresh the hostname cache
   */
  async refreshHostnameCache() {
    try {
      logger.debug('Refreshing CloudFlare Tunnel hostname cache...');
      
      // Ensure we have a tunnel ID
      await this.resolveTunnelId();
      
      const response = await this.client.get(`/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${this.tunnelId}/configurations`);
      const config = response.data.result;
      
      // Extract hostnames from config
      let hostnames = [];
      
      if (config && config.config && config.config.ingress) {
        // Process ingress rules to extract hostnames
        for (const rule of config.config.ingress) {
          if (rule.hostname && rule.hostname !== '*') {
            hostnames.push({
              hostname: rule.hostname,
              service: rule.service,
              path: rule.path || '/',
              created: new Date()
            });
          }
        }
      }
      
      const oldCount = this.hostnameCache.hostnames.length;
      
      this.hostnameCache = {
        hostnames,
        lastUpdated: Date.now()
      };
      
      logger.debug(`CloudFlare Tunnel hostname cache updated (${oldCount} -> ${hostnames.length} hostnames)`);
      
      return this.hostnameCache.hostnames;
    } catch (error) {
      logger.error(`Failed to refresh CloudFlare Tunnel hostname cache: ${error.message}`);
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
   * Find a hostname in the cache
   */
  findHostnameInCache(hostname) {
    return this.hostnameCache.hostnames.find(
      h => h.hostname === hostname
    );
  }
  
  /**
   * Process hostnames to ensure they exist in the tunnel configuration
   */
  async processHostnames(hostnames, containerLabels) {
    logger.debug(`Processing ${hostnames.length} hostnames for CloudFlare Tunnel...`);
    
    try {
      // Ensure we have a tunnel ID
      await this.resolveTunnelId();
      
      // Get current tunnel configuration
      const response = await this.client.get(`/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${this.tunnelId}/configurations`);
      const config = response.data.result;
      
      if (!config || !config.config || !config.config.ingress) {
        throw new Error('Invalid tunnel configuration format');
      }
      
      // Current ingress rules
      const currentIngress = config.config.ingress;
      
      // Track which hostnames need to be added
      const newHostnames = [];
      const existingHostnames = [];
      
      // Process each hostname
      for (const hostname of hostnames) {
        // Check if hostname already exists in configuration
        const existingRule = currentIngress.find(rule => rule.hostname === hostname);
        
        if (existingRule) {
          existingHostnames.push(hostname);
          logger.debug(`Hostname ${hostname} already exists in tunnel configuration`);
        } else {
          newHostnames.push(hostname);
          logger.info(`Adding hostname ${hostname} to tunnel configuration`);
          
          // Get any tunnel-specific configuration from container labels
          const tunnelService = this.getTunnelServiceFromLabels(hostname, containerLabels);
          
          // Create new ingress rule
          currentIngress.splice(currentIngress.length - 1, 0, {
            hostname: hostname,
            service: tunnelService,
            path: '/'
          });
        }
      }
      
      // If new hostnames were added, update the configuration
      if (newHostnames.length > 0) {
        const updatedConfig = {
          config: {
            ingress: currentIngress
          }
        };
        
        // Update tunnel configuration
        await this.client.put(
          `/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${this.tunnelId}/configurations`,
          updatedConfig
        );
        
        logger.success(`Added ${newHostnames.length} new hostnames to CloudFlare Tunnel configuration`);
        
        // Refresh the hostname cache
        await this.refreshHostnameCache();
      }
      
      return {
        added: newHostnames,
        existing: existingHostnames
      };
    } catch (error) {
      logger.error(`Failed to process hostnames for CloudFlare Tunnel: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clean up orphaned tunnel hostnames
   */
  async cleanupOrphanedHostnames(activeHostnames) {
    logger.debug('Checking for orphaned CloudFlare Tunnel hostnames...');
    
    try {
      // Ensure we have a tunnel ID
      await this.resolveTunnelId();
      
      // Get current tunnel configuration
      const response = await this.client.get(`/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${this.tunnelId}/configurations`);
      const config = response.data.result;
      
      if (!config || !config.config || !config.config.ingress) {
        throw new Error('Invalid tunnel configuration format');
      }
      
      // Current ingress rules
      const currentIngress = config.config.ingress;
      
      // Normalize active hostnames for comparison
      const normalizedActiveHostnames = new Set(activeHostnames.map(host => host.toLowerCase()));
      
      // Track orphaned hostnames
      const orphanedHostnames = [];
      
      // Find orphaned hostnames
      for (const rule of currentIngress) {
        // Skip the catch-all rule and active hostnames
        if (!rule.hostname || rule.hostname === '*' || normalizedActiveHostnames.has(rule.hostname.toLowerCase())) {
          continue;
        }
        
        // Check if hostname should be preserved
        if (this.cloudflareProvider.recordTracker.shouldPreserveHostname(rule.hostname)) {
          logger.info(`Preserving tunnel hostname ${rule.hostname} (in preserved list)`);
          continue;
        }
        
        logger.info(`Found orphaned tunnel hostname: ${rule.hostname}`);
        orphanedHostnames.push(rule.hostname);
      }
      
      // If orphaned hostnames were found, update the configuration
      if (orphanedHostnames.length > 0) {
        // Create new ingress rules without orphaned hostnames
        const updatedIngress = currentIngress.filter(rule => {
          if (!rule.hostname || rule.hostname === '*') {
            return true; // Keep the rule if it has no hostname or is the catch-all rule
          }
          
          return !orphanedHostnames.includes(rule.hostname);
        });
        
        const updatedConfig = {
          config: {
            ingress: updatedIngress
          }
        };
        
        // Update tunnel configuration
        await this.client.put(
          `/accounts/${this.config.cloudflareAccountId}/cfd_tunnel/${this.tunnelId}/configurations`,
          updatedConfig
        );
        
        logger.success(`Removed ${orphanedHostnames.length} orphaned hostnames from CloudFlare Tunnel configuration`);
        
        // Refresh the hostname cache
        await this.refreshHostnameCache();
      } else {
        logger.debug('No orphaned CloudFlare Tunnel hostnames found');
      }
      
      return orphanedHostnames;
    } catch (error) {
      logger.error(`Failed to clean up orphaned CloudFlare Tunnel hostnames: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get tunnel service from container labels
   */
  getTunnelServiceFromLabels(hostname, containerLabels) {
    const labels = containerLabels[hostname] || {};
    const genericPrefix = this.config.genericLabelPrefix;
    const tunnelPrefix = `${genericPrefix}cf.tunnel.`;
    
    // Default service (HTTP)
    let tunnelService = 'http://localhost:80';
    
    // Check for service configuration in labels
    if (labels[`${tunnelPrefix}service`]) {
      tunnelService = labels[`${tunnelPrefix}service`];
    } else if (labels[`${tunnelPrefix}service.protocol`]) {
      // Build service from components
      const protocol = labels[`${tunnelPrefix}service.protocol`] || 'http';
      const host = labels[`${tunnelPrefix}service.host`] || 'localhost';
      const port = labels[`${tunnelPrefix}service.port`] || '80';
      
      tunnelService = `${protocol}://${host}:${port}`;
    }
    
    return tunnelService;
  }
  
  /**
   * Check if hostname should be managed by tunnel
   */
  shouldUseTunnel(hostname, labels) {
    // If tunnel is not enabled, never use it
    if (!this.config.cfTunnelEnabled) {
      return false;
    }
    
    // If tunnel hostname suffix is specified, check if hostname matches
    if (this.config.cfTunnelHostnameSuffix) {
      return hostname.endsWith(this.config.cfTunnelHostnameSuffix);
    }
    
    // Otherwise, check for explicit label
    const genericPrefix = this.config.genericLabelPrefix;
    return labels[`${genericPrefix}cf.tunnel.enabled`] === 'true';
  }
}

module.exports = CloudFlareTunnelManager;