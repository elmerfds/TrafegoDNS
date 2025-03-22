/**
 * src/providers/factory.js
 * Enhanced DNS Provider Factory with hot-swapping capability
 */
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class DNSProviderFactory {
  constructor(config, eventBus, stateManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    
    // Cache of provider instances
    this.providerInstances = new Map();
    
    // Setup event subscriptions for provider switching
    if (eventBus) {
      this.setupEventSubscriptions();
    }
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    this.eventBus.subscribe('provider:switched', async (data) => {
      const { provider } = data;
      logger.info(`Provider switch event received: ${provider}`);
      
      try {
        // Create and initialize the new provider
        const newProvider = await this.createAndInitProvider(provider);
        
        // Update the current provider in state
        if (this.stateManager) {
          this.stateManager.updateState('providers.current', provider);
        }
        
        // Notify about provider change
        this.eventBus.publish('provider:changed', { 
          provider,
          instance: newProvider
        });
        
        logger.success(`Successfully switched to ${provider} provider`);
      } catch (error) {
        logger.error(`Failed to switch to ${provider} provider: ${error.message}`);
        
        // Publish error event
        this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
          source: 'DNSProviderFactory.setupEventSubscriptions',
          error: `Failed to switch provider: ${error.message}`
        });
      }
    });
  }
  
  /**
   * Create an instance of the configured DNS provider
   * @param {string} providerType - The type of provider to create
   * @returns {DNSProvider} - An instance of the requested DNS provider
   */
  async createProvider(providerType = null) {
    const type = providerType || this.config.dnsProvider || 'cloudflare';
    
    try {
      logger.debug(`Creating DNS provider: ${type}`);
      
      // Check if we already have an instance of this provider
      if (this.providerInstances.has(type)) {
        logger.debug(`Returning cached provider instance: ${type}`);
        return this.providerInstances.get(type);
      }
      
      // Try to load the provider module
      let ProviderClass;
      
      try {
        // First try to load from provider folder (new structure)
        const providerDirPath = path.join(__dirname, type);
        
        if (fs.existsSync(providerDirPath) && fs.statSync(providerDirPath).isDirectory()) {
          // Provider directory exists, load the main provider module
          ProviderClass = require(`./${type}`);
        } else {
          // Try to load as a single file (legacy/simple providers)
          const providerPath = path.join(__dirname, `${type}.js`);
          
          if (fs.existsSync(providerPath)) {
            ProviderClass = require(`./${type}.js`);
          } else {
            throw new Error(`Provider module not found: ${type}`);
          }
        }
      } catch (error) {
        throw new Error(`Failed to load provider module: ${error.message}`);
      }
      
      // Check if the provider exports a class (function constructor)
      if (typeof ProviderClass !== 'function') {
        // If it's an object with a default export (ES modules), use that
        if (ProviderClass.default && typeof ProviderClass.default === 'function') {
          ProviderClass = ProviderClass.default;
        } else {
          throw new Error(`Provider module does not export a class constructor: ${type}`);
        }
      }
      
      // Create instance
      const provider = new ProviderClass(this.config);
      
      // Cache the provider instance
      this.providerInstances.set(type, provider);
      
      return provider;
    } catch (error) {
      logger.error(`Failed to create DNS provider '${type}': ${error.message}`);
      throw new Error(`DNS provider '${type}' not found or failed to initialize: ${error.message}`);
    }
  }
  
  /**
   * Create and initialize a provider
   * @param {string} providerType - The type of provider to create
   * @returns {DNSProvider} - An initialized provider instance
   */
  async createAndInitProvider(providerType) {
    const provider = await this.createProvider(providerType);
    
    try {
      await provider.init();
      return provider;
    } catch (error) {
      logger.error(`Failed to initialize provider ${providerType}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a list of available DNS providers
   * @returns {Array<string>} - Array of available provider names
   */
  getAvailableProviders() {
    const providersDir = path.join(__dirname);
    
    try {
      // Read the providers directory
      const items = fs.readdirSync(providersDir);
      const providers = [];
      
      // Check both directories and .js files
      for (const item of items) {
        const itemPath = path.join(providersDir, item);
        
        if (fs.statSync(itemPath).isDirectory()) {
          // Check if this directory contains a provider.js or index.js file
          if (
            fs.existsSync(path.join(itemPath, 'provider.js')) || 
            fs.existsSync(path.join(itemPath, 'index.js'))
          ) {
            providers.push(item);
          }
        } else if (
          item.endsWith('.js') && 
          item !== 'base.js' && 
          item !== 'factory.js' &&
          item !== 'index.js'
        ) {
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
   * Clear the provider cache to force recreation of provider instances
   */
  clearProviderCache() {
    this.providerInstances.clear();
    logger.debug('Provider instance cache cleared');
  }
  
  /**
   * Switch to a different provider
   * @param {string} providerType - Provider type to switch to
   * @returns {Promise<DNSProvider>} - The new provider instance
   */
  async switchProvider(providerType) {
    logger.info(`Switching to ${providerType} provider`);
    
    // Check if provider type is available
    const availableProviders = this.getAvailableProviders();
    if (!availableProviders.includes(providerType)) {
      throw new Error(`Provider '${providerType}' is not available`);
    }
    
    // Create and initialize the new provider
    const newProvider = await this.createAndInitProvider(providerType);
    
    // Update the config
    this.config.dnsProvider = providerType;
    
    // Update the state if state manager is available
    if (this.stateManager) {
      this.stateManager.updateState('providers.current', providerType);
    }
    
    // Publish event if event bus is available
    if (this.eventBus) {
      this.eventBus.publish('provider:changed', {
        provider: providerType,
        instance: newProvider
      });
    }
    
    return newProvider;
  }
}

// Export a static factory method for backward compatibility
DNSProviderFactory.createProvider = function(config) {
  const factory = new DNSProviderFactory(config);
  return factory.createProvider();
};

DNSProviderFactory.getAvailableProviders = function() {
  const factory = new DNSProviderFactory();
  return factory.getAvailableProviders();
};

module.exports = DNSProviderFactory;