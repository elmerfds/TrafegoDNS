// src/services/OperationModeSwitcher.js
/**
 * Operation Mode Switcher
 * Handles switching between Traefik and Direct operation modes
 */
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class OperationModeSwitcher {
  /**
   * Create a new OperationModeSwitcher
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} eventBus - EventBus instance
   * @param {Object} dnsManager - EnhancedDNSManager instance
   */
  constructor(config, eventBus, dnsManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsManager = dnsManager;
    
    // Current monitors
    this.traefikMonitor = null;
    this.directDNSManager = null;
    this.dockerMonitor = null;
    
    // Current active monitor
    this.activeMonitor = null;
    
    // Subscribe to configuration changes
    this.unsubscribe = config.onConfigChange(this.handleConfigChange.bind(this));
  }
  
  /**
   * Initialize the mode switcher
   * @param {Object} dockerMonitor - DockerMonitor instance
   */
  async init(dockerMonitor) {
    try {
      logger.debug('Initializing OperationModeSwitcher...');
      
      // Store Docker monitor reference
      this.dockerMonitor = dockerMonitor;
      
      // Initialize monitors based on current mode
      await this.initializeMonitors();
      
      logger.success('OperationModeSwitcher initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize OperationModeSwitcher: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize monitors based on current operation mode
   */
  async initializeMonitors() {
    // Import monitors
    const TraefikMonitor = require('./TraefikMonitor');
    const DirectDNSManager = require('./DirectDNSManager');
    
    // Initialize both monitors
    if (!this.traefikMonitor) {
      this.traefikMonitor = new TraefikMonitor(this.config, this.eventBus);
    }
    
    if (!this.directDNSManager) {
      this.directDNSManager = new DirectDNSManager(this.config, this.eventBus, this.dnsManager);
    }
    
    // Connect Docker monitor for container name resolution
    if (this.dockerMonitor) {
      this.traefikMonitor.dockerMonitor = this.dockerMonitor;
      this.directDNSManager.dockerMonitor = this.dockerMonitor;
    }
    
    // Initialize both monitors
    await this.traefikMonitor.init();
    await this.directDNSManager.init();
    
    // Determine which monitor to activate based on mode
    await this.activateMonitorForMode(this.config.operationMode);
  }
  
  /**
   * Activate the appropriate monitor for the specified mode
   * @param {string} mode - Operation mode (traefik or direct)
   */
  async activateMonitorForMode(mode) {
    try {
      logger.info(`Activating monitor for mode: ${mode.toUpperCase()}`);
      
      // Stop any active monitor
      if (this.activeMonitor) {
        this.activeMonitor.stopPolling();
      }
      
      // Set the active monitor based on mode
      if (mode.toLowerCase() === 'direct') {
        this.activeMonitor = this.directDNSManager;
        
        // Set global variables for web UI access
        global.directDnsManager = this.directDNSManager;
        global.traefikMonitor = null;
        
        logger.info('🚀 Activated DIRECT operation mode');
      } else {
        this.activeMonitor = this.traefikMonitor;
        
        // Set global variables for web UI access
        global.traefikMonitor = this.traefikMonitor;
        global.directDnsManager = null;
        
        logger.info('🚀 Activated TRAEFIK operation mode');
      }
      
      // Start the active monitor
      await this.activeMonitor.startPolling();
      
      return true;
    } catch (error) {
      logger.error(`Error activating monitor for mode ${mode}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Switch operation mode
   * @param {string} newMode - New operation mode (traefik or direct)
   */
  async switchMode(newMode) {
    try {
      // Validate mode
      if (newMode.toLowerCase() !== 'traefik' && newMode.toLowerCase() !== 'direct') {
        throw new Error(`Invalid operation mode: ${newMode}. Must be 'traefik' or 'direct'`);
      }
      
      // Skip if mode is already active
      if (newMode.toLowerCase() === this.config.operationMode.toLowerCase()) {
        logger.info(`Operation mode ${newMode.toUpperCase()} is already active`);
        return true;
      }
      
      // Update configuration
      await this.config.updateConfig('operationMode', newMode.toLowerCase(), true);
      
      // Activate the monitor for the new mode
      await this.activateMonitorForMode(newMode);
      
      // Publish event
      this.eventBus.publish(EventTypes.OPERATION_MODE_CHANGED, {
        oldMode: newMode.toLowerCase() === 'direct' ? 'traefik' : 'direct',
        newMode: newMode.toLowerCase()
      });
      
      return true;
    } catch (error) {
      logger.error(`Failed to switch operation mode to ${newMode}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Handle configuration changes
   * @param {string} key - Changed config key
   * @param {any} oldValue - Old value
   * @param {any} newValue - New value
   */
  async handleConfigChange(key, oldValue, newValue) {
    // If operation mode changed, switch monitors
    if (key === 'operationMode' && oldValue !== newValue) {
      logger.info(`Operation mode changed from ${oldValue} to ${newValue} via configuration update`);
      
      try {
        await this.activateMonitorForMode(newValue);
        
        // Publish event (if not already published by switchMode)
        this.eventBus.publish(EventTypes.OPERATION_MODE_CHANGED, {
          oldMode: oldValue,
          newMode: newValue
        });
      } catch (error) {
        logger.error(`Error handling operation mode change: ${error.message}`);
      }
    }
  }
  
  /**
   * Clean up resources and stop monitors
   */
  async shutdown() {
    try {
      logger.debug('Shutting down OperationModeSwitcher...');
      
      // Unsubscribe from configuration changes
      if (this.unsubscribe) {
        this.unsubscribe();
      }
      
      // Stop active monitor
      if (this.activeMonitor) {
        this.activeMonitor.stopPolling();
      }
      
      // Clean up references
      this.activeMonitor = null;
      global.directDnsManager = null;
      global.traefikMonitor = null;
      
      logger.debug('OperationModeSwitcher shut down successfully');
    } catch (error) {
      logger.error(`Error shutting down OperationModeSwitcher: ${error.message}`);
    }
  }
}

module.exports = OperationModeSwitcher;