/**
 * EnhancedProviderFactory.js
 * Enhanced DNS Provider Factory with hot-swapping capabilities
 */
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class EnhancedProviderFactory {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    
    // Active provider instance
    this.activeProvider = null;
    this.activeProviderType = null;
    
    // Provider module cache
    this.providerModules = {};
    
    // Subscribe to configuration changes
    if (config.onConfigChange) {
      this.unsubscribe = config.onConfigChange(this.handleConfigChange.bind(this));
    }
  }
  
  /**
   * Get the current active provider
   * @returns {DNSProvider} - Active DNS provider instance
   */
  getProvider() {
    return this.activeProvider;
  }
  
  /**
   * Get the current active provider type
   * @returns {string} - Active DNS provider type
   */
  getProviderType() {
    return this.activeProviderType;
  }
  
  /**
   * Initialize the factory and create the default provider
   */
  async init() {
    try {
      logger.debug('Initializing EnhancedProviderFactory...');
      
      // Create the initial provider
      await this.createProvider(this.config.dnsProvider);
      
      logger.success('EnhancedProviderFactory initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize EnhancedProviderFactory: ${error.message}`);
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
    // If DNS provider changed, switch providers
    if (key === 'dnsProvider' && oldValue !== newValue) {
      logger.info(`DNS provider changed from ${oldValue} to ${newValue}, switching...`);
      
      try {
        await this.switchProvider(newValue);
        logger.success(`Successfully switched to ${newValue} provider`);
        
        // Publish event for other components to react
        this.eventBus.publish(EventTypes.DNS_PROVIDER_CHANGED, {
          oldProvider: oldValue,
          newProvider: newValue
        });
      } catch (error) {
        logger.error(`Failed to switch to provider ${newValue}: ${error.message}`);
        
        // Publish error event
        this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
          source: 'EnhancedProviderFactory.handleConfigChange',
          error: error.message
        });
      }
    }
  }
  
  /**
   * Switch to a different DNS provider
   * @param {string} providerType - Provider type to switch to
   */
  async switchProvider(providerType) {
    // Don't switch if it's the same provider
    if (providerType === this.activeProviderType) {
      logger.debug(`Already using ${providerType} provider, no switch needed`);
      return this.activeProvider;
    }
    
    logger.info(`Switching DNS provider to ${providerType}...`);
    
    // Shutdown existing provider gracefully if it exists
    if (this.activeProvider) {
      try {
        // If provider has a shutdown method, call it
        if (typeof this.activeProvider.shutdown === 'function') {
          await this.activeProvider.shutdown();
        }
        
        logger.debug(`Successfully shut down ${this.activeProviderType} provider`);
      } catch (error) {
        logger.warn(`Error shutting down ${this.activeProviderType} provider: ${error.message}`);
        // Continue despite errors
      }
    }
    
    // Create the new provider
    const newProvider = await this.createProvider(providerType);
    
    return newProvider;
  }
  
  /**
   * Create a provider instance
   * @param {string} providerType - Provider type to create
   * @returns {DNSProvider} - Created provider instance
   */
  async createProvider(providerType) {
    try {
      logger.debug(`Creating DNS provider: ${providerType}`);
      
      // Load the provider module if not already cached
      let ProviderClass = this.providerModules[providerType];
      
      if (!ProviderClass) {
        ProviderClass = await this.loadProviderModule(providerType);
        this.providerModules[providerType] = ProviderClass;
      }
      
      // Create provider instance
      const provider = new ProviderClass(this.config);
      
      // Initialize the provider
      await provider.init();
      
      // Update active provider
      this.activeProvider = provider;
      this.activeProviderType = providerType;
      
      logger.success(`Created and initialized ${providerType} provider`);
      
      return provider;
    } catch (error) {
      logger.error(`Failed to create DNS provider '${providerType}': ${error.message}`);
      throw new Error(`DNS provider '${providerType}' failed to initialize: ${error.message}`);
    }
  }
  
  /**
   * Load a provider module
   * @param {string} providerType - Provider type to load
   * @returns {Function} - Provider class constructor
   */
  async loadProviderModule(providerType) {
    try {
      // Try to load the provider module
      let ProviderClass;
      
      try {
        // First try to load from provider folder (new structure)
        const providerDirPath = path.join(__dirname, providerType);
        
        // Check if directory exists (async)
        try {
          await fs.access(providerDirPath);
          // Provider directory exists, load the main provider module
          ProviderClass = require(`./${providerType}`);
        } catch (dirError) {
          // Try to load as a single file (legacy/simple providers)
          const providerPath = path.join(__dirname, `${providerType}.js`);
          
          try {
            await fs.access(providerPath);
            ProviderClass = require(`./${providerType}.js`);
          } catch (fileError) {
            throw new Error(`Provider module not found: ${providerType}`);
          }
        }
      } catch (loadError) {
        throw new Error(`Failed to load provider module: ${loadError.message}`);
      }
      
      // Check if the provider exports a class (function constructor)
      if (typeof ProviderClass !== 'function') {
        // If it's an object with a default export (ES modules), use that
        if (ProviderClass.default && typeof ProviderClass.default === 'function') {
          ProviderClass = ProviderClass.default;
        } else {
          throw new Error(`Provider module does not export a class constructor: ${providerType}`);
        }
      }
      
      return ProviderClass;
    } catch (error) {
      logger.error(`Failed to load provider module '${providerType}': ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a list of available DNS providers
   * @returns {Promise<Array<string>>} - Array of available provider names
   */
  async getAvailableProviders() {
    try {
      const providersDir = path.join(__dirname);
      
      // Read the providers directory
      const items = await fs.readdir(providersDir);
      const providers = [];
      
      // Check both directories and .js files
      for (const item of items) {
        const itemPath = path.join(providersDir, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          // Check if this directory contains a provider.js or index.js file
          try {
            await Promise.any([
              fs.access(path.join(itemPath, 'provider.js')),
              fs.access(path.join(itemPath, 'index.js'))
            ]);
            
            // If either file exists, add to providers list
            providers.push(item);
          } catch (error) {
            // Skip if none of the files exist
          }
        } else if (item.endsWith('.js') && 
                  !['base.js', 'factory.js', 'index.js', 'EnhancedProviderFactory.js'].includes(item)) {
          // It's a .js file that could be a provider
          providers.push(item.replace('.js', ''));
        }
      }
      
      return providers;
    } catch (error) {
      logger.error(`Failed to list available providers: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Clean up resources on shutdown
   */
  async shutdown() {
    // Unsubscribe from config changes
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Shutdown active provider
    if (this.activeProvider && typeof this.activeProvider.shutdown === 'function') {
      try {
        await this.activeProvider.shutdown();
      } catch (error) {
        logger.error(`Error shutting down ${this.activeProviderType} provider: ${error.message}`);
      }
    }
    
    logger.debug('EnhancedProviderFactory shut down');
  }
}

module.exports = EnhancedProviderFactory;