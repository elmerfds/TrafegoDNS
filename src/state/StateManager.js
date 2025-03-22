/**
 * src/state/StateManager.js
 * Central state management for TráfegoDNS
 * Provides a single source of truth for all application state
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const { debounce } = require('../utils/helpers');

class StateManager {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    
    // Define state storage file paths
    this.configDir = path.join('/config', 'data');
    this.stateFile = path.join(this.configDir, 'appstate.json');
    
    // Ensure config directory exists
    this.ensureConfigDir();
    
    // Initialize state with defaults
    this.state = {
      version: 1,
      records: {
        tracked: [],
        preserved: [],
        managed: []
      },
      stats: {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        lastPoll: null
      },
      providers: {
        current: config.dnsProvider,
        available: [],
        configs: {}
      },
      mode: {
        current: config.operationMode,
        available: ['traefik', 'direct']
      },
      settings: {
        cleanupOrphaned: config.cleanupOrphaned,
        logLevel: logger.levelNames[logger.level],
        pollInterval: config.pollInterval,
        watchDockerEvents: config.watchDockerEvents
      },
      status: {
        isRunning: true,
        lastError: null,
        ipv4: null,
        ipv6: null,
        startedAt: new Date().toISOString()
      }
    };
    
    // Load state from file
    this.loadState();
    
    // Set up debounced save to prevent excessive disk writes
    this.debouncedSave = debounce(() => this.saveState(), 2000);
    
    // Set up event subscriptions for state updates
    this.setupEventSubscriptions();
    
    logger.info('State Manager initialised');
  }
  
  /**
   * Ensure config directory exists
   */
  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      try {
        fs.mkdirSync(this.configDir, { recursive: true });
        logger.debug(`Created directory: ${this.configDir}`);
      } catch (error) {
        logger.error(`Failed to create config directory: ${error.message}`);
      }
    }
  }
  
  /**
   * Load state from file
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const loadedState = JSON.parse(data);
        
        // Merge the loaded state with the default state
        this.state = this.mergeState(this.state, loadedState);
        
        logger.debug(`Loaded application state from ${this.stateFile}`);
      } else {
        // Initialize with default state
        logger.debug('No state file found, using default state');
        this.saveState();
      }
    } catch (error) {
      logger.error(`Error loading application state: ${error.message}`);
    }
  }
  
  /**
   * Save state to file
   */
  saveState() {
    try {
      // Update timestamps
      this.state.updatedAt = new Date().toISOString();
      
      // Write to file
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
      logger.debug(`Saved application state to ${this.stateFile}`);
    } catch (error) {
      logger.error(`Error saving application state: ${error.message}`);
    }
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to DNS record events
    this.eventBus.subscribe(EventTypes.DNS_RECORD_CREATED, (data) => {
      this.state.stats.created += data.count || 1;
      this.state.stats.lastPoll = new Date().toISOString();
      this.debouncedSave();
    });
    
    this.eventBus.subscribe(EventTypes.DNS_RECORD_UPDATED, (data) => {
      this.state.stats.updated += data.count || 1;
      this.state.stats.lastPoll = new Date().toISOString();
      this.debouncedSave();
    });
    
    this.eventBus.subscribe(EventTypes.DNS_RECORD_DELETED, (data) => {
      this.state.stats.deleted += 1;
      this.debouncedSave();
    });
    
    // Subscribe to error events
    this.eventBus.subscribe(EventTypes.ERROR_OCCURRED, (data) => {
      this.state.stats.errors += 1;
      this.state.status.lastError = {
        message: data.error,
        source: data.source,
        timestamp: new Date().toISOString()
      };
      this.debouncedSave();
    });
    
    // Subscribe to IP updates
    this.eventBus.subscribe(EventTypes.IP_UPDATED, (data) => {
      this.state.status.ipv4 = data.ipv4;
      this.state.status.ipv6 = data.ipv6;
      this.debouncedSave();
    });
    
    // Subscribe to DNS records updates
    this.eventBus.subscribe(EventTypes.DNS_RECORDS_UPDATED, (data) => {
      // We'll update the complete tracked records list when it changes
      // This happens in the updateTrackedRecords method called by DNSManager
      this.state.stats.lastPoll = new Date().toISOString();
      this.debouncedSave();
    });
  }
  
  /**
   * Merge loaded state with default state
   * This ensures backward compatibility when adding new state properties
   */
  mergeState(defaultState, loadedState) {
    // Start with a shallow copy of the default state
    const mergedState = { ...defaultState };
    
    // Iterate through top-level keys in the default state
    for (const key of Object.keys(defaultState)) {
      // If the key exists in the loaded state, merge or overwrite
      if (key in loadedState) {
        if (
          typeof defaultState[key] === 'object' && 
          defaultState[key] !== null &&
          !Array.isArray(defaultState[key]) &&
          typeof loadedState[key] === 'object' &&
          loadedState[key] !== null &&
          !Array.isArray(loadedState[key])
        ) {
          // Recursively merge objects
          mergedState[key] = this.mergeState(defaultState[key], loadedState[key]);
        } else {
          // For arrays and primitive values, use the loaded state value
          mergedState[key] = loadedState[key];
        }
      }
    }
    
    return mergedState;
  }
  
  /**
   * Get the entire application state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Update a portion of the application state
   * @param {string} path - Dot-notation path to the state property to update
   * @param {*} value - New value
   */
  updateState(path, value) {
    const parts = path.split('.');
    let current = this.state;
    
    // Navigate to the nested property
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Update the property value
    current[parts[parts.length - 1]] = value;
    
    // Save the state
    this.debouncedSave();
    
    // Return the updated state
    return { ...this.state };
  }
  
  /**
   * Update tracked DNS records
   * @param {Array} records - Array of tracked DNS records
   */
  updateTrackedRecords(records) {
    this.state.records.tracked = records;
    this.debouncedSave();
  }
  
  /**
   * Update preserved hostnames
   * @param {Array} hostnames - Array of preserved hostnames
   */
  updatePreservedHostnames(hostnames) {
    this.state.records.preserved = hostnames;
    this.debouncedSave();
  }
  
  /**
   * Update managed hostnames
   * @param {Array} hostnames - Array of managed hostname configurations
   */
  updateManagedHostnames(hostnames) {
    this.state.records.managed = hostnames;
    this.debouncedSave();
  }
  
  /**
   * Update available providers
   * @param {Array} providers - Array of available provider names
   */
  updateAvailableProviders(providers) {
    this.state.providers.available = providers;
    this.debouncedSave();
  }
  
  /**
   * Update provider configuration
   * @param {string} provider - Provider name
   * @param {Object} config - Provider configuration
   */
  updateProviderConfig(provider, config) {
    this.state.providers.configs[provider] = config;
    this.debouncedSave();
  }
  
  /**
   * Switch to a different DNS provider
   * @param {string} provider - Provider name
   */
  switchProvider(provider) {
    if (!this.state.providers.available.includes(provider)) {
      throw new Error(`Provider '${provider}' is not available`);
    }
    
    this.state.providers.current = provider;
    this.debouncedSave();
    
    // Also update the config object
    this.config.dnsProvider = provider;
    
    // Publish event
    this.eventBus.publish('provider:switched', { provider });
    
    return this.state.providers;
  }
  
  /**
   * Switch operation mode
   * @param {string} mode - Mode name ('traefik' or 'direct')
   */
  switchMode(mode) {
    if (!this.state.mode.available.includes(mode)) {
      throw new Error(`Mode '${mode}' is not available`);
    }
    
    this.state.mode.current = mode;
    this.debouncedSave();
    
    // Also update the config object
    this.config.operationMode = mode;
    
    // Publish event
    this.eventBus.publish('mode:switched', { mode });
    
    return this.state.mode;
  }
  
  /**
   * Update application settings
   * @param {Object} settings - Settings object
   */
  updateSettings(settings) {
    // Merge with existing settings
    this.state.settings = {
      ...this.state.settings,
      ...settings
    };
    
    // Update config as well
    if (settings.cleanupOrphaned !== undefined) {
      this.config.cleanupOrphaned = settings.cleanupOrphaned;
    }
    
    if (settings.pollInterval !== undefined) {
      this.config.pollInterval = settings.pollInterval;
    }
    
    if (settings.watchDockerEvents !== undefined) {
      this.config.watchDockerEvents = settings.watchDockerEvents;
    }
    
    if (settings.logLevel !== undefined && settings.logLevel !== logger.levelNames[logger.level]) {
      logger.setLevel(settings.logLevel);
    }
    
    this.debouncedSave();
    
    // Publish event
    this.eventBus.publish('settings:updated', { settings: this.state.settings });
    
    return this.state.settings;
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.state.stats = {
      created: 0,
      updated: 0,
      deleted: 0, 
      errors: 0,
      lastPoll: this.state.stats.lastPoll
    };
    
    this.debouncedSave();
    return this.state.stats;
  }
}

module.exports = StateManager;