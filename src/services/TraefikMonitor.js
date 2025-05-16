/**
 * Traefik Monitor Service
 * Responsible for monitoring Traefik routers and updating DNS records
 */
const axios = require('axios');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const { extractHostnamesFromRule } = require('../utils/traefik');
const { getLabelValue } = require('../utils/dns');

class TraefikMonitor {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    
    // Initialize HTTP client
    this.client = axios.create({
      baseURL: config.traefikApiUrl,
      timeout: config.apiTimeout  // Use the configurable timeout
    });
    
    // Add basic auth if configured
    if (config.traefikApiUsername && config.traefikApiPassword) {
      this.client.defaults.auth = {
        username: config.traefikApiUsername,
        password: config.traefikApiPassword
      };
    }
    
    // Track previous poll statistics to reduce logging noise
    this.previousStats = {
      hostnameCount: 0
    };
    
    // Lock to prevent parallel polling
    this.isPolling = false;
    
    // Poll timer reference
    this.pollTimer = null;
    
    // Cache for the last seen container labels from Docker service
    this.lastDockerLabels = {};
    
    // Reference to DockerMonitor (will be set from app.js)
    this.dockerMonitor = null;
    
    // Last container ID to name mapping
    this.lastContainerIdToName = new Map();
    
    // Subscribe to Docker label updates
    this.setupEventSubscriptions();
  }
  
  /**
   * Initialize the Traefik Monitor
   */
  async init() {
    try {
      logger.debug('Testing connection to Traefik API...');
      
      // Test connection
      const connected = await this.testConnection();
      
      if (!connected) {
        throw new Error('Failed to connect to Traefik API');
      }
      
      logger.success('Successfully connected to Traefik API');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Traefik Monitor: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to Docker label updates
    this.eventBus.subscribe(EventTypes.DOCKER_LABELS_UPDATED, (data) => {
      const { containerLabelsCache, containerIdToName } = data;
      
      // Update our cache of Docker labels
      this.lastDockerLabels = containerLabelsCache || {};
      this.lastContainerIdToName = containerIdToName || new Map();
      logger.debug('Updated Docker container labels cache in TraefikMonitor');
    });
  }
  
  /**
   * Start the polling process
   */
  async startPolling() {
    // Perform initial poll
    await this.pollTraefikAPI();
    
    // Set up interval for regular polling
    this.pollTimer = setInterval(() => this.pollTraefikAPI(), this.config.pollInterval);
    
    logger.debug(`Traefik polling started with interval of ${this.config.pollInterval}ms`);
    return true;
  }
  
  /**
   * Stop the polling process
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.debug('Traefik polling stopped');
    }
  }
  
  /**
   * Test the connection to the Traefik API
   */
  async testConnection() {
    try {
      // Try to access the overview endpoint
      await this.client.get('/overview');
      return true;
    } catch (error) {
      logger.error(`Failed to connect to Traefik API: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Poll the Traefik API for routers
   */
  async pollTraefikAPI() {
    // Skip if already polling to prevent parallel execution
    if (this.isPolling) {
      logger.debug('Skipping poll - another poll cycle is already in progress');
      return;
    }
    
    // Set polling lock
    this.isPolling = true;
    
    try {
      // Publish poll started event
      this.eventBus.publish(EventTypes.TRAEFIK_POLL_STARTED);
      
      logger.debug('Polling Traefik API for routers...');
      
      // Get all routers from Traefik
      const routers = await this.getRouters();
      
      // Defensive check - ensure routers is an object
      if (!routers || typeof routers !== 'object') {
        logger.warn('Invalid router data returned from Traefik API');
        // Emit empty update to avoid undefined errors downstream
        this.eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
          hostnames: [],
          containerLabels: {}
        });
        return;
      }
      
      logger.debug(`Found ${Object.keys(routers).length} routers in Traefik`);
      
      // Collect hostname data
      const { hostnames = [], containerLabels = {} } = this.processRouters(routers);
      
      // Ensure hostnames is an array to prevent 'length' property errors
      const hostnamesArray = Array.isArray(hostnames) ? hostnames : [];
      
      // Only log hostname count if it changed from previous poll
      const hostnameCount = hostnamesArray.length;
      const hasChanged = this.previousStats.hostnameCount !== hostnameCount;

      if (hasChanged) {
        logger.info(`Found ${hostnameCount} hostnames from Traefik routers`);
      } else {
        // Log at debug level instead of info when nothing has changed
        logger.debug(`Found ${hostnameCount} hostnames from Traefik routers`);
      }
      
      // Update the previous count for next comparison
      this.previousStats.hostnameCount = hostnameCount;
      
      // Merge router labels with Docker container labels
      const mergedLabels = this.mergeContainerLabels(containerLabels, this.lastDockerLabels || {});
      
      // Publish router update event - ALWAYS use hostnamesArray to prevent undefined issues
      this.eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
        hostnames: hostnamesArray,
        containerLabels: mergedLabels || {}
      });
      
      // Publish poll completed event
      this.eventBus.publish(EventTypes.TRAEFIK_POLL_COMPLETED, {
        routerCount: Object.keys(routers).length,
        hostnameCount: hostnameCount
      });
    } catch (error) {
      logger.error(`Error polling Traefik API: ${error.message}`);
      
      // On error, still emit an event with empty arrays to avoid undefined errors
      this.eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
        hostnames: [],
        containerLabels: {}
      });
      
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'TraefikMonitor.pollTraefikAPI',
        error: error.message
      });
    } finally {
      // Always release the polling lock
      this.isPolling = false;
    }
  }
  
  /**
   * Get all HTTP routers from Traefik
   */
  async getRouters() {
    try {
      const response = await this.client.get('/http/routers');
      
      // Validate response data
      if (!response || !response.data || typeof response.data !== 'object') {
        logger.warn('Invalid response from Traefik API: empty or non-object data');
        return {}; // Return empty object to avoid undefined errors
      }
      
      return response.data;
    } catch (error) {
      // Check for specific error types for better error messages
      if (error.code === 'ECONNREFUSED') {
        logger.error(`Connection refused to Traefik API at ${this.config.traefikApiUrl}. Is Traefik running?`);
        return {}; // Return empty object instead of throwing
      }
      
      if (error.response && error.response.status === 401) {
        logger.error('Authentication failed for Traefik API. Check your username and password.');
        return {}; // Return empty object instead of throwing
      }
      
      logger.error(`Failed to get Traefik routers: ${error.message}`);
      return {}; // Return empty object to avoid halting the application
    }
  }
  
  /**
   * Process routers to extract hostnames and container labels
   * @param {Object} routers - Router objects from Traefik API
   * @returns {Object} - Object containing hostnames array and containerLabels object
   */
  processRouters(routers) {
    // Initialize with empty arrays to prevent undefined errors
    const hostnames = [];
    const containerLabels = {};
    
    // Handle null or undefined routers object
    if (!routers || typeof routers !== 'object') {
      logger.warn('No valid routers data returned from Traefik API');
      return { hostnames, containerLabels };
    }
    
    try {
      // Use Object.entries to avoid errors if routers isn't iterable
      for (const [_, router] of Object.entries(routers)) {
        // Skip undefined or invalid routers
        if (!router || !router.name) {
          continue;
        }
        
        const routerName = router.name;
        if (router.rule && typeof router.rule === 'string' && router.rule.includes('Host')) {
          try {
            // Extract all hostnames from the rule
            const routerHostnames = extractHostnamesFromRule(router.rule);
            
            if (!routerHostnames || !Array.isArray(routerHostnames)) {
              logger.debug(`No valid hostnames extracted from rule for router "${routerName}"`);
              continue;
            }
            
            for (const hostname of routerHostnames) {
              // Skip invalid or empty hostnames
              if (!hostname) {
                continue;
              }
              
              hostnames.push(hostname);
              
              // Store router service information with hostname for later lookup
              containerLabels[hostname] = {
                [`${this.config.traefikLabelPrefix}http.routers.${routerName}.service`]: router.service || '',
                routerName: routerName
              };
              
              logger.trace(`Processed router "${routerName}" for hostname "${hostname}" with service "${router.service || 'unknown'}"`);
            }
          } catch (extractError) {
            logger.warn(`Error extracting hostnames from rule for router "${routerName}": ${extractError.message}`);
            continue;
          }
        }
      }
    } catch (processingError) {
      logger.error(`Error processing routers: ${processingError.message}`);
      // Return empty arrays if processing fails
      return { hostnames: [], containerLabels: {} };
    }
    
    // As a final safeguard, verify hostnames is a valid array
    if (!Array.isArray(hostnames)) {
      logger.warn('processRouters produced invalid hostnames (not an array), returning empty array');
      return { hostnames: [], containerLabels: containerLabels || {} };
    }
    
    return { hostnames, containerLabels };
  }
  
  /**
   * Merge router-derived labels with actual container labels
   * This is crucial for getting the correct DNS labels from containers
   * @param {Object} routerContainerLabels - Container labels from routers
   * @param {Object} dockerLabelsCache - Container labels from Docker
   * @returns {Object} - Merged labels
   */
  mergeContainerLabels(routerContainerLabels, dockerLabelsCache) {
    logger.debug('Merging router information with Docker container labels');
    
    // Defensive programming - ensure we have valid objects
    if (!routerContainerLabels) {
      logger.warn('No router container labels provided for merging, using empty object');
      routerContainerLabels = {};
    }
    
    if (!dockerLabelsCache) {
      logger.warn('No Docker labels cache provided for merging, using empty object');
      dockerLabelsCache = {};
    }
    
    // Clone to avoid modifying the original - with extra safety for undefined input
    const mergedLabels = { ...(routerContainerLabels || {}) };
    const genericPrefix = this.config.genericLabelPrefix || 'dns.';
    const providerPrefix = this.config.dnsLabelPrefix || 'dns.provider.';
    
    // For tracking changes in logging
    const firstPoll = !this.lastMergedLabels;
    const labelChanges = {};
    
    // Get the container ID to name mapping from DockerMonitor
    let containerIdToName = new Map();
    if (this.dockerMonitor && this.dockerMonitor.containerIdToName) {
      containerIdToName = this.dockerMonitor.containerIdToName;
    } else if (this.lastContainerIdToName) {
      containerIdToName = this.lastContainerIdToName;
    }
    
    // For each hostname
    for (const [hostname, routerLabels] of Object.entries(routerContainerLabels)) {
      const routerName = routerLabels.routerName;
      const routerNameDocker = routerName.replace(/@docker$/, "");
      const serviceName = routerLabels[`${this.config.traefikLabelPrefix}http.routers.${routerName}.service`];
      
      logger.debug(`Looking for container labels for hostname=${hostname}, router=${routerName}, service=${serviceName}`);
      
      // Look for matching containers in the Docker labels cache
      let matchFound = false;
      
      // First try by service name directly
      for (const [containerId, containerLabels] of Object.entries(dockerLabelsCache)) {
        // Various ways a container might be related to this router/service
        if (
          containerId.includes(serviceName) || 
          containerLabels[`${this.config.traefikLabelPrefix}http.routers.${routerName}.service`] === serviceName ||
          containerLabels[`${this.config.traefikLabelPrefix}http.routers.${routerNameDocker}.service`] === serviceName ||
          containerLabels[`${this.config.traefikLabelPrefix}http.services.${serviceName}.loadbalancer.server.port`]
        ) {
          // Get container name if available
          const containerName = containerIdToName.get(containerId) || containerId;
          logger.debug(`Found matching container ${containerName} for hostname ${hostname}`);
          
          // Extract DNS-specific labels
          const dnsLabels = {};
          // First collect provider-specific labels
          for (const [key, value] of Object.entries(containerLabels)) {
            if (key.startsWith(providerPrefix)) {
              dnsLabels[key] = value;
            }
          }
          // Then collect generic DNS labels that don't conflict with provider-specific ones
          for (const [key, value] of Object.entries(containerLabels)) {
            if (key.startsWith(genericPrefix) && !key.startsWith(providerPrefix)) {
              dnsLabels[key] = value;
            }
          }
          
          // Check if this is first poll or if the proxied setting has changed
          const proxiedLabel = getLabelValue(containerLabels, genericPrefix, providerPrefix, 'proxied', null);
          const previousLabels = this.lastMergedLabels?.[hostname];
          const previousProxied = previousLabels?.[`${providerPrefix}proxied`] || previousLabels?.[`${genericPrefix}proxied`];
          
          // Only log at INFO level if this is the first poll or the proxied value has changed
          if (firstPoll || previousProxied !== proxiedLabel) {
            if (proxiedLabel === 'false') {
              logger.info(`🔍 Found proxied=false for ${hostname} from container ${containerName}`);
              // Track the change for summary
              labelChanges[hostname] = 'unproxied';
            } else if (proxiedLabel === 'true' && previousProxied === 'false') {
              logger.info(`🔍 Found proxied=true for ${hostname} from container ${containerName}`);
              // Track the change for summary
              labelChanges[hostname] = 'proxied';
            }
          } else {
            // Use debug level for repeated information
            if (proxiedLabel === 'false') {
              logger.debug(`Found proxied=false for ${hostname} from container ${containerName}`);
            }
          }
          
          // Merge the container's DNS labels into our hostname labels
          mergedLabels[hostname] = {
            ...mergedLabels[hostname],
            ...dnsLabels
          };
          
          if (Object.keys(dnsLabels).length > 0) {
            logger.debug(`Applied DNS configuration for ${hostname}: ${JSON.stringify(dnsLabels)}`);
          }
          
          matchFound = true;
          break;
        }
      }
      
      if (!matchFound) {
        logger.debug(`No container match found for hostname ${hostname}`);
      }
    }
    
    // Log a summary of changes if any occurred
    const changeCount = Object.keys(labelChanges).length;
    if (changeCount > 0) {
      const changeList = Object.entries(labelChanges)
        .map(([hostname, change]) => `${hostname} (${change})`)
        .join(', ');
      logger.info(`DNS label changes detected for ${changeCount} hostnames: ${changeList}`);
    }
    
    // Store the current labels for next comparison
    this.lastMergedLabels = JSON.parse(JSON.stringify(mergedLabels));
    
    return mergedLabels;
  }
  
  /**
   * Get all HTTP services from Traefik
   */
  async getServices() {
    try {
      const response = await this.client.get('/http/services');
      logger.debug(`Retrieved ${Object.keys(response.data).length} services from Traefik API`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get Traefik services: ${error.message}`);
      throw error;
    }
  }
}

module.exports = TraefikMonitor;