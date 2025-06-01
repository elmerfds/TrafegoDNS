/**
 * Docker Monitor Service
 * Responsible for monitoring Docker container events
 * Modular implementation that orchestrates specialized sub-modules
 */
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');

// Import sub-modules
const {
  createClient,
  testConnection,
  getEvents,
  listContainers,
  getContainerDetails,
  getAllContainerLabels
} = require('./client');

const { 
  createContainerTracker, 
  getContainerName, 
  updateFromContainerList 
} = require('./containerTracker');

const {
  createLabelCache,
  getLabelsForContainer,
  getAllLabels,
  updateLabelCacheFromContainers
} = require('./labelCache');

const { 
  setupEventListeners 
} = require('./eventProcessor');

class DockerMonitor {
  constructor(config, eventBus, pauseManager = null) {
    this.config = config;
    this.eventBus = eventBus;
    this.pauseManager = pauseManager;
    
    // Initialize Docker client
    this.docker = createClient(config.dockerSocket);
    
    // Track last event time to prevent duplicate polling
    this.lastEventTime = 0;
    
    // Create container tracker
    this.containerTracker = createContainerTracker();
    
    // Global cache for container labels
    this.containerLabelsCache = createLabelCache();
    
    // Event stream reference
    this.events = null;
  }
  
  /**
   * Start watching Docker events
   */
  async startWatching() {
    try {
      // First, update container labels cache
      await this.updateContainerLabelsCache();
      
      logger.debug('Starting Docker event monitoring...');
      
      // Get the event stream
      this.events = await getEvents(this.docker);
      
      // Set up event listeners
      setupEventListeners(
        this.events, 
        this.docker, 
        this.containerTracker, 
        this.containerLabelsCache, 
        this.eventBus,
        this.pauseManager
      );
      
      logger.success('Docker event monitoring started successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to start Docker monitoring: ${error.message}`);
      
      // Publish error event
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DockerMonitor.startWatching',
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Stop watching Docker events
   */
  stopWatching() {
    if (this.events) {
      logger.debug('Stopping Docker event monitoring...');
      
      try {
        // Destroy the event stream
        this.events.destroy();
        this.events = null;
        
        logger.info('Docker event monitoring stopped');
        return true;
      } catch (error) {
        logger.error(`Error stopping Docker event monitoring: ${error.message}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Test Docker connection
   */
  async testConnection() {
    return await testConnection(this.docker);
  }
  
  /**
   * Update container labels cache
   */
  async updateContainerLabelsCache() {
    try {
      logger.debug('Updating container labels cache...');
      
      // Get running containers
      const containers = await listContainers(this.docker);
      
      // Update ID to name mapping (clear existing and only add running containers)
      updateFromContainerList(this.containerTracker, containers, true);
      
      // Update container labels
      await updateLabelCacheFromContainers(
        this.containerLabelsCache, 
        this.docker, 
        containers
      );
      
      return true;
    } catch (error) {
      logger.error(`Failed to update container labels cache: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get container name by ID
   */
  getContainerName(id) {
    return getContainerName(this.containerTracker, id);
  }
  
  /**
   * Get container labels
   */
  getContainerLabels(id) {
    return getLabelsForContainer(this.containerLabelsCache, id);
  }
  
  /**
   * Get container labels cache
   */
  getContainerLabelsCache() {
    return this.containerLabelsCache;
  }

  /**
   * Check if the Docker monitor is connected
   * @returns {boolean} - Connection status
   */
  isConnected() {
    return this.events !== null;
  }

  /**
   * Get containers with optional filtering
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - List of containers
   */
  async getContainers(options = {}) {
    try {
      return await listContainers(this.docker, options);
    } catch (error) {
      logger.error(`Failed to get containers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get container details by ID or name
   * @param {string} idOrName - Container ID or name
   * @returns {Promise<Object>} - Container details
   */
  async getContainerDetails(idOrName) {
    try {
      return await getContainerDetails(this.docker, idOrName);
    } catch (error) {
      logger.error(`Failed to get container details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all container labels
   * @returns {Promise<Object>} - Map of container IDs to their labels
   */
  async getAllLabels() {
    try {
      return await getAllContainerLabels(this.docker);
    } catch (error) {
      logger.error(`Failed to get all container labels: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all unique labels from the cache
   * @returns {Object} - All unique labels
   */
  async getAllUniqueLabels() {
    return getAllLabels(this.containerLabelsCache);
  }

  /**
   * Get hostnames associated with a container
   * @param {string} idOrName - Container ID or name
   * @returns {Promise<Array<string>>} - List of hostnames
   */
  async getContainerHostnames(idOrName) {
    try {
      // First get container details to get the ID
      let containerId = idOrName;

      try {
        // If it's a name, get the container ID
        if (idOrName.length < 32) {
          const details = await this.getContainerDetails(idOrName);
          containerId = details.Id;
        }
      } catch (error) {
        if (error.statusCode === 404) {
          return null;
        }
        throw error;
      }

      // Get the container labels
      const labels = await this.getContainerLabels(containerId);

      if (!labels) {
        return [];
      }

      // Extract hostnames from labels
      const hostnames = [];

      // Check Traefik labels
      Object.keys(labels).forEach(key => {
        // Traefik v2 format
        if (key.startsWith('traefik.http.routers.') && key.endsWith('.rule')) {
          const rule = labels[key];
          if (rule && rule.includes('Host')) {
            // Extract hostname from Host(`example.com`) or Host(`example.com`,`www.example.com`)
            const matches = rule.match(/Host\(`([^`]+)`(?:,`([^`]+)`)*\)/);
            if (matches) {
              // Add all matched hostnames
              for (let i = 1; i < matches.length; i++) {
                if (matches[i]) hostnames.push(matches[i]);
              }
            }
          }
        }

        // Traefik v1 format
        if (key === 'traefik.frontend.rule' && labels[key]) {
          const rule = labels[key];
          if (rule.startsWith('Host:')) {
            // Extract hostnames from Host:example.com,www.example.com
            const hosts = rule.substring(5).split(',').map(h => h.trim());
            hostnames.push(...hosts);
          }
        }
      });

      // Check for TrafegoDNS specific labels
      Object.keys(labels).forEach(key => {
        if (key.startsWith('trafegodns.hostname')) {
          hostnames.push(labels[key]);
        }
      });

      // Deduplicate hostnames
      return [...new Set(hostnames)];
    } catch (error) {
      logger.error(`Failed to get container hostnames: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DockerMonitor;