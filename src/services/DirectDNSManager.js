/**
 * Direct DNS Manager Service
 * Extracts hostnames directly from Docker container labels
 * without relying on Traefik
 */
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const { getLabelValue } = require('../utils/dns');

class DirectDNSManager {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.dockerMonitor = null;
    this.isPolling = false;
    this.pollTimer = null;
    this.previousStats = {
      hostnameCount: 0
    };
    
    // Last container labels from Docker service
    this.lastDockerLabels = {};
    
    // Subscribe to Docker label updates - same approach as TraefikMonitor
    this.setupEventSubscriptions();
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to Docker label updates
    this.eventBus.subscribe(EventTypes.DOCKER_LABELS_UPDATED, (data) => {
      const { containerLabelsCache, containerIdToName, hasChanges } = data;
      
      // Update our cache of Docker labels
      this.lastDockerLabels = containerLabelsCache || {};
      
      // If labels changed, trigger a poll immediately
      if (hasChanges) {
        logger.debug('Container labels changed, triggering DNS refresh');
        this.pollContainers();
      } else {
        logger.debug('Updated Docker container labels cache in DirectDNSManager');
      }
    });

    // Subscribe to container destroyed events to trigger immediate poll
    this.eventBus.subscribe(EventTypes.CONTAINER_DESTROYED, async (data) => {
      logger.info(`Container destroyed event received in DirectDNSManager: ${data?.name || 'unknown'}`);
      
      // Trigger immediate poll
      logger.info('Triggering immediate container poll after container destruction');
      this.pollContainers().catch(error => {
        logger.error(`Failed to poll containers after container destruction: ${error.message}`);
      });
    });

    // Subscribe to container stopped events to trigger immediate poll
    this.eventBus.subscribe(EventTypes.CONTAINER_STOPPED, async (data) => {
      logger.info(`Container stopped event received in DirectDNSManager: ${data?.name || 'unknown'}`);
      
      // Trigger immediate poll
      logger.info('Triggering immediate container poll after container stop');
      this.pollContainers().catch(error => {
        logger.error(`Failed to poll containers after container stop: ${error.message}`);
      });
    });
  }

  /**
   * Initialize the Direct DNS Manager
   */
  async init() {
    logger.debug('Initialising DirectDNSManager...');
    return true;
  }

  /**
   * Start the polling process
   */
  async startPolling() {
    // Perform initial poll
    await this.pollContainers();
    
    // Set up interval for regular polling
    this.pollTimer = setInterval(() => this.pollContainers(), this.config.pollInterval);
    
    logger.debug(`Container polling started with interval of ${this.config.pollInterval}ms`);
    return true;
  }

  /**
   * Stop the polling process
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      logger.debug('Container polling stopped');
    }
  }

  /**
   * Poll containers for DNS labels
   */
  async pollContainers() {
    // Skip if already polling to prevent parallel execution
    if (this.isPolling) {
      logger.debug('Skipping poll - another poll cycle is already in progress');
      return;
    }
    
    // Set polling lock
    this.isPolling = true;
    
    try {
      // Publish poll started event - use same event names as TraefikMonitor
      // for compatibility with the rest of the system
      this.eventBus.publish(EventTypes.TRAEFIK_POLL_STARTED);
      
      logger.debug('Polling Docker containers for DNS labels...');
      
      // Extract hostnames from container labels
      const { hostnames, containerLabels } = this.extractHostnamesFromLabels(this.lastDockerLabels);
      
      // Only log hostname count if it changed from previous poll
      const hasChanged = this.previousStats.hostnameCount !== hostnames.length;
      
      if (hasChanged) {
        logger.info(`Processing ${hostnames.length} hostnames for DNS management`);
      } else {
        // Log at debug level instead of info when nothing has changed
        logger.debug(`Processing ${hostnames.length} hostnames for DNS management`);
      }
      
      // Update the previous count for next comparison
      this.previousStats.hostnameCount = hostnames.length;
      
      // Publish same event TraefikMonitor would - this ensures DNSManager
      // processes things exactly the same way
      this.eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
        hostnames,
        containerLabels
      });
      
      // Publish poll completed event
      this.eventBus.publish(EventTypes.TRAEFIK_POLL_COMPLETED, {
        hostnameCount: hostnames.length
      });
    } catch (error) {
      logger.error(`Error polling containers: ${error.message}`);
      
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DirectDNSManager.pollContainers',
        error: error.message
      });
    } finally {
      // Always release the polling lock
      this.isPolling = false;
    }
  }
  
  /**
   * Extract hostnames from container labels
   */
  extractHostnamesFromLabels(containerLabelsCache) {
    const hostnames = [];
    const containerLabels = {};
    
    // Get label prefix from existing config
    const dnsLabelPrefix = this.config.genericLabelPrefix;
    
    // Process each container
    for (const [containerId, labels] of Object.entries(containerLabelsCache)) {
      // Get container name if available through DockerMonitor
      const containerName = this.dockerMonitor && this.dockerMonitor.getContainerName
        ? this.dockerMonitor.getContainerName(containerId) 
        : containerId;
      
      // Check if container has DNS hostname labels
      if (labels[`${dnsLabelPrefix}hostname`]) {
        // Split comma-separated hostnames
        const containerHostnames = labels[`${dnsLabelPrefix}hostname`]
          .split(',')
          .map(h => h.trim())
          .filter(h => h.length > 0);
        
        // Process each hostname
        for (const hostname of containerHostnames) {
          if (!hostnames.includes(hostname)) {
            hostnames.push(hostname);
          }
          
          // Associate container labels with this hostname
          containerLabels[hostname] = {
            ...labels,
            containerId: containerId,
            containerName: containerName
          };
          
          logger.debug(`Found hostname ${hostname} in container ${containerName}`);
        }
      }
      
      // Also check for dns.domain label combined with dns.subdomain
      if (labels[`${dnsLabelPrefix}domain`]) {
        const domain = labels[`${dnsLabelPrefix}domain`];
        
        // Check for subdomains
        if (labels[`${dnsLabelPrefix}subdomain`]) {
          const subdomains = labels[`${dnsLabelPrefix}subdomain`]
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          // Create full hostnames from domain and subdomains
          for (const subdomain of subdomains) {
            const hostname = `${subdomain}.${domain}`;
            
            if (!hostnames.includes(hostname)) {
              hostnames.push(hostname);
            }
            
            // Associate container labels with this hostname
            containerLabels[hostname] = {
              ...labels,
              containerId: containerId,
              containerName: containerName
            };
            
            logger.debug(`Created hostname ${hostname} from domain=${domain} and subdomain=${subdomain}`);
          }
        }
        
        // Check if the apex domain itself should be used
        if (labels[`${dnsLabelPrefix}use_apex`] === 'true') {
          if (!hostnames.includes(domain)) {
            hostnames.push(domain);
          }
          
          // Associate container labels with this hostname
          containerLabels[domain] = {
            ...labels,
            containerId: containerId,
            containerName: containerName
          };
          
          logger.debug(`Using apex domain ${domain} for container ${containerName}`);
        }
      }
      
      // Allow a specific host format using dns.host.X labels
      Object.entries(labels).forEach(([key, value]) => {
        if (key.startsWith(`${dnsLabelPrefix}host.`) && value) {
          const hostname = value.trim();
          if (hostname && !hostnames.includes(hostname)) {
            hostnames.push(hostname);
            
            // Associate container labels with this hostname
            containerLabels[hostname] = {
              ...labels,
              containerId: containerId,
              containerName: containerName
            };
            
            logger.debug(`Found hostname ${hostname} from ${key} in container ${containerName}`);
          }
        }
      });
    }
    
    return { hostnames, containerLabels };
  }
}

module.exports = DirectDNSManager;