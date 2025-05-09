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
  listContainers 
} = require('./client');

const { 
  createContainerTracker, 
  getContainerName, 
  updateFromContainerList 
} = require('./containerTracker');

const { 
  createLabelCache, 
  getLabelsForContainer, 
  updateLabelCacheFromContainers
} = require('./labelCache');

const { 
  setupEventListeners 
} = require('./eventProcessor');

class DockerMonitor {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    
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
        this.eventBus
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
      
      // Update ID to name mapping
      updateFromContainerList(this.containerTracker, containers);
      
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
}

module.exports = DockerMonitor;