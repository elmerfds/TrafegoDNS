/**
 * EnhancedConfigManager.js
 * Enhanced configuration management for TráfegoDNS
 * Supports runtime configuration changes and file-based persistence
 */
const axios = require('axios');
const path = require('path');
const logger = require('../utils/logger');
const EnvironmentLoader = require('./EnvironmentLoader');

// Semaphore for IP update process
let ipUpdateInProgress = false;

class EnhancedConfigManager {
  constructor(dataStore) {
    this.dataStore = dataStore;
    
    // Initialize IP cache first to avoid reference errors
    this.ipCache = {
      ipv4: process.env.PUBLIC_IP || null,
      ipv6: process.env.PUBLIC_IPV6 || null,
      lastCheck: 0
    };
    
    // Default configuration values
    this.defaults = this.getDefaults();
    
    // Runtime configuration (will be loaded from dataStore in init)
    this.runtimeConfig = {};
    
    // Track initialization
    this.initialized = false;
    
    // Event handlers for config changes
    this.changeHandlers = [];
  }
  
  /**
   * Initialize the configuration manager
   */
  async init() {
    try {
      logger.debug('Initializing EnhancedConfigManager...');
      
      // First make sure dataStore is initialized
      if (!this.dataStore.initialized) {
        await this.dataStore.init();
      }
      
      // Load configuration from dataStore
      await this.loadConfig();
      
      // Schedule immediate IP update and then periodic refresh
      await this.updatePublicIPs();
      
      // Set up periodic IP refresh
      if (this.ipRefreshInterval > 0) {
        setInterval(() => this.updatePublicIPs(), this.ipRefreshInterval);
      }
      
      this.initialized = true;
      logger.success('EnhancedConfigManager initialized successfully');
      
      // Log configuration
      await this.displaySettings();
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize EnhancedConfigManager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get default configuration values
   */
  getDefaults() {
    return {
      // Operation mode - traefik or direct
      operationMode: EnvironmentLoader.getString('OPERATION_MODE', 'traefik'),

      // DNS Provider configuration
      dnsProvider: EnvironmentLoader.getString('DNS_PROVIDER', 'cloudflare'),
      
      // Cloudflare settings
      cloudflareToken: EnvironmentLoader.getString('CLOUDFLARE_TOKEN'),
      cloudflareZone: EnvironmentLoader.getString('CLOUDFLARE_ZONE'),
      
      // Route53 settings
      route53AccessKey: EnvironmentLoader.getString('ROUTE53_ACCESS_KEY'),
      route53SecretKey: EnvironmentLoader.getString('ROUTE53_SECRET_KEY'),
      route53Zone: EnvironmentLoader.getString('ROUTE53_ZONE'),
      route53ZoneId: EnvironmentLoader.getString('ROUTE53_ZONE_ID'),
      route53Region: EnvironmentLoader.getString('ROUTE53_REGION', 'eu-west-2'),
      
      // Digital Ocean settings
      digitalOceanToken: EnvironmentLoader.getString('DO_TOKEN'),
      digitalOceanDomain: EnvironmentLoader.getString('DO_DOMAIN'),
      
      // Traefik API settings
      traefikApiUrl: EnvironmentLoader.getString('TRAEFIK_API_URL', 'http://traefik:8080/api'),
      traefikApiUsername: EnvironmentLoader.getString('TRAEFIK_API_USERNAME'),
      traefikApiPassword: EnvironmentLoader.getString('TRAEFIK_API_PASSWORD'),
      
      // Label prefixes
      genericLabelPrefix: EnvironmentLoader.getString('DNS_LABEL_PREFIX', 'dns.'),
      traefikLabelPrefix: EnvironmentLoader.getString('TRAEFIK_LABEL_PREFIX', 'traefik.'),
      
      // Global DNS defaults
      defaultRecordType: EnvironmentLoader.getString('DNS_DEFAULT_TYPE', 'CNAME'),
      defaultContent: EnvironmentLoader.getString('DNS_DEFAULT_CONTENT'),
      defaultProxied: EnvironmentLoader.getBool('DNS_DEFAULT_PROXIED', true),
      defaultTTL: null, // Will be set based on provider
      defaultManage: EnvironmentLoader.getBool('DNS_DEFAULT_MANAGE', true),
      
      // Application behavior
      dockerSocket: EnvironmentLoader.getString('DOCKER_SOCKET', '/var/run/docker.sock'),
      pollInterval: EnvironmentLoader.getInt('POLL_INTERVAL', 60000),
      watchDockerEvents: EnvironmentLoader.getBool('WATCH_DOCKER_EVENTS', true),
      cleanupOrphaned: EnvironmentLoader.getBool('CLEANUP_ORPHANED', false),
      
      // Cache refresh interval in milliseconds (default: 1 hour)
      cacheRefreshInterval: EnvironmentLoader.getInt('DNS_CACHE_REFRESH_INTERVAL', 3600000),

      // API request timeout in milliseconds (default: 1 minute)
      apiTimeout: EnvironmentLoader.getInt('API_TIMEOUT', 60000),    
      
      // IP refresh interval in milliseconds (default: 1 hour)
      ipRefreshInterval: EnvironmentLoader.getInt('IP_REFRESH_INTERVAL', 3600000),
      
      // Record defaults for each type
      recordDefaults: {}
    };
  }
  
  /**
   * Load configuration from dataStore
   */
  async loadConfig() {
    try {
      // Get app config from dataStore
      const appConfig = await this.dataStore.getAppConfig();
      
      // Merge with defaults
      this.runtimeConfig = {
        ...this.defaults,
        ...appConfig
      };
      
      // Set dnsLabelPrefix based on current provider
      this.runtimeConfig.dnsLabelPrefix = `${this.runtimeConfig.genericLabelPrefix}${this.runtimeConfig.dnsProvider}.`;
      
      // Set default TTL based on provider
      this.setDefaultTTLs();
      
      // Set default content if not already set
      if (!this.runtimeConfig.defaultContent) {
        this.runtimeConfig.defaultContent = this.getProviderDomain();
      }
      
      // Initialize record defaults
      this.initRecordDefaults();
      
      logger.debug('Loaded configuration from dataStore');
    } catch (error) {
      logger.error(`Error loading configuration: ${error.message}`);
      
      // Use defaults if loading fails
      this.runtimeConfig = { ...this.defaults };
      
      // Set dnsLabelPrefix based on current provider
      this.runtimeConfig.dnsLabelPrefix = `${this.runtimeConfig.genericLabelPrefix}${this.runtimeConfig.dnsProvider}.`;
      
      // Set default TTL based on provider
      this.setDefaultTTLs();
      
      // Initialize record defaults
      this.initRecordDefaults();
    }
  }
  
  /**
   * Set default TTLs based on provider
   */
  setDefaultTTLs() {
    switch (this.runtimeConfig.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        this.runtimeConfig.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 1); // Cloudflare minimum is 1 (Auto)
        break;
      case 'digitalocean':
        this.runtimeConfig.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 30); // DigitalOcean minimum is 30
        break;
      case 'route53':
        this.runtimeConfig.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 60); // Route53 minimum is 60
        break;
      default:
        this.runtimeConfig.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 1); // Default fallback
    }
  }
  
  /**
   * Initialize record defaults
   */
  initRecordDefaults() {
    this.runtimeConfig.recordDefaults = {
      A: {
        content: '',  // Will be set after IP discovery
        proxied: process.env.DNS_DEFAULT_A_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_A_PROXIED !== 'false' : 
                 this.runtimeConfig.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_A_TTL', this.runtimeConfig.defaultTTL)
      },
      AAAA: {
        content: '',  // Will be set after IP discovery
        proxied: process.env.DNS_DEFAULT_AAAA_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_AAAA_PROXIED !== 'false' : 
                 this.runtimeConfig.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_AAAA_TTL', this.runtimeConfig.defaultTTL)
      },
      CNAME: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_CNAME_CONTENT', this.runtimeConfig.defaultContent || ''),
        proxied: process.env.DNS_DEFAULT_CNAME_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_CNAME_PROXIED !== 'false' : 
                 this.runtimeConfig.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_CNAME_TTL', this.runtimeConfig.defaultTTL)
      },
      MX: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_MX_CONTENT', ''),
        priority: EnvironmentLoader.getInt('DNS_DEFAULT_MX_PRIORITY', 10),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_MX_TTL', this.runtimeConfig.defaultTTL)
      },
      TXT: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_TXT_CONTENT', ''),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_TXT_TTL', this.runtimeConfig.defaultTTL)
      },
      SRV: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_SRV_CONTENT', ''),
        priority: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_PRIORITY', 1),
        weight: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_WEIGHT', 1),
        port: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_PORT', 80),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_TTL', this.runtimeConfig.defaultTTL)
      },
      CAA: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_CAA_CONTENT', ''),
        flags: EnvironmentLoader.getInt('DNS_DEFAULT_CAA_FLAGS', 0),
        tag: EnvironmentLoader.getString('DNS_DEFAULT_CAA_TAG', 'issue'),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_CAA_TTL', this.runtimeConfig.defaultTTL)
      }
    };
    
    // Update IP-based contents after IPs are discovered
    this.updateRecordDefaultsWithIPs();
  }
  
  /**
   * Update record defaults with discovered IPs
   */
  updateRecordDefaultsWithIPs() {
    // Update A record defaults with IPv4
    this.runtimeConfig.recordDefaults.A.content = 
      process.env.DNS_DEFAULT_A_CONTENT || 
      this.ipCache.ipv4 || 
      '';
    
    // Update AAAA record defaults with IPv6
    this.runtimeConfig.recordDefaults.AAAA.content = 
      process.env.DNS_DEFAULT_AAAA_CONTENT || 
      this.ipCache.ipv6 || 
      '';
    
    logger.debug(`Updated record defaults with IP: ${this.runtimeConfig.recordDefaults.A.content}`);
  }
  
  /**
   * Save configuration to dataStore
   * Only saves runtime-modifiable settings, not secrets
   */
  async saveConfig() {
    try {
      // Extract save-safe config (don't include secrets)
      const saveConfig = {
        operationMode: this.runtimeConfig.operationMode,
        dnsProvider: this.runtimeConfig.dnsProvider,
        // Skip sensitive credentials
        
        // Label prefixes 
        genericLabelPrefix: this.runtimeConfig.genericLabelPrefix,
        traefikLabelPrefix: this.runtimeConfig.traefikLabelPrefix,
        
        // Traefik settings (without credentials)
        traefikApiUrl: this.runtimeConfig.traefikApiUrl,
        
        // DNS defaults
        defaultRecordType: this.runtimeConfig.defaultRecordType,
        defaultContent: this.runtimeConfig.defaultContent,
        defaultProxied: this.runtimeConfig.defaultProxied,
        defaultTTL: this.runtimeConfig.defaultTTL,
        defaultManage: this.runtimeConfig.defaultManage,
        
        // Application behavior
        pollInterval: this.runtimeConfig.pollInterval,
        watchDockerEvents: this.runtimeConfig.watchDockerEvents,
        cleanupOrphaned: this.runtimeConfig.cleanupOrphaned,
        cacheRefreshInterval: this.runtimeConfig.cacheRefreshInterval,
        apiTimeout: this.runtimeConfig.apiTimeout,
        ipRefreshInterval: this.runtimeConfig.ipRefreshInterval,
        
        // Logging configuration
        logging: {
          maxSize: 5 * 1024 * 1024, // 5MB default
          maxFiles: 10,
          retentionDays: 30,
          flushInterval: 5000
        }
      };
      
      // Save to dataStore
      await this.dataStore.setAppConfig(saveConfig);
      
      logger.debug('Saved configuration to dataStore');
      return true;
    } catch (error) {
      logger.error(`Error saving configuration: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a configuration value
   * @param {string} key - Configuration key
   * @param {any} value - New value
   * @param {boolean} persist - Whether to persist the change
   */
  async updateConfig(key, value, persist = true) {
    const oldValue = this.runtimeConfig[key];
    
    // Update runtime config
    this.runtimeConfig[key] = value;
    
    // Special handling for certain settings
    if (key === 'dnsProvider') {
      // Update dnsLabelPrefix
      this.runtimeConfig.dnsLabelPrefix = `${this.runtimeConfig.genericLabelPrefix}${value}.`;
      
      // Update default TTL
      this.setDefaultTTLs();
    }
    
    // Persist if requested
    if (persist) {
      await this.saveConfig();
    }
    
    // Notify change handlers
    this.notifyChangeHandlers(key, oldValue, value);
    
    return true;
  }
  
  /**
   * Register a change handler
   * @param {Function} handler - Change handler function
   * @returns {Function} - Function to unregister handler
   */
  onConfigChange(handler) {
    this.changeHandlers.push(handler);
    
    // Return unregister function
    return () => {
      this.changeHandlers = this.changeHandlers.filter(h => h !== handler);
    };
  }
  
  /**
   * Notify change handlers
   * @param {string} key - Changed key
   * @param {any} oldValue - Old value
   * @param {any} newValue - New value
   */
  notifyChangeHandlers(key, oldValue, newValue) {
    for (const handler of this.changeHandlers) {
      try {
        handler(key, oldValue, newValue);
      } catch (error) {
        logger.error(`Error in config change handler: ${error.message}`);
      }
    }
  }
  
  /**
   * Get config property (with property accessor)
   */
  get operationMode() {
    return this.runtimeConfig.operationMode;
  }
  
  get dnsProvider() {
    return this.runtimeConfig.dnsProvider;
  }
  
  get cloudflareToken() {
    return this.runtimeConfig.cloudflareToken;
  }
  
  get cloudflareZone() {
    return this.runtimeConfig.cloudflareZone;
  }
  
  get route53AccessKey() {
    return this.runtimeConfig.route53AccessKey;
  }
  
  get route53SecretKey() {
    return this.runtimeConfig.route53SecretKey;
  }
  
  get route53Zone() {
    return this.runtimeConfig.route53Zone;
  }
  
  get route53ZoneId() {
    return this.runtimeConfig.route53ZoneId;
  }
  
  get route53Region() {
    return this.runtimeConfig.route53Region;
  }
  
  get digitalOceanToken() {
    return this.runtimeConfig.digitalOceanToken;
  }
  
  get digitalOceanDomain() {
    return this.runtimeConfig.digitalOceanDomain;
  }
  
  get traefikApiUrl() {
    return this.runtimeConfig.traefikApiUrl;
  }
  
  get traefikApiUsername() {
    return this.runtimeConfig.traefikApiUsername;
  }
  
  get traefikApiPassword() {
    return this.runtimeConfig.traefikApiPassword;
  }
  
  get genericLabelPrefix() {
    return this.runtimeConfig.genericLabelPrefix;
  }
  
  get dnsLabelPrefix() {
    return this.runtimeConfig.dnsLabelPrefix;
  }
  
  get traefikLabelPrefix() {
    return this.runtimeConfig.traefikLabelPrefix;
  }
  
  get defaultRecordType() {
    return this.runtimeConfig.defaultRecordType;
  }
  
  get defaultContent() {
    return this.runtimeConfig.defaultContent;
  }
  
  get defaultProxied() {
    return this.runtimeConfig.defaultProxied;
  }
  
  get defaultTTL() {
    return this.runtimeConfig.defaultTTL;
  }
  
  get defaultManage() {
    return this.runtimeConfig.defaultManage;
  }
  
  get dockerSocket() {
    return this.runtimeConfig.dockerSocket;
  }
  
  get pollInterval() {
    return this.runtimeConfig.pollInterval;
  }
  
  get watchDockerEvents() {
    return this.runtimeConfig.watchDockerEvents;
  }
  
  get cleanupOrphaned() {
    return this.runtimeConfig.cleanupOrphaned;
  }
  
  get cacheRefreshInterval() {
    return this.runtimeConfig.cacheRefreshInterval;
  }
  
  get apiTimeout() {
    return this.runtimeConfig.apiTimeout;
  }
  
  get ipRefreshInterval() {
    return this.runtimeConfig.ipRefreshInterval;
  }
  
  /**
   * Get record defaults for a specific type
   * @param {string} type - Record type
   * @returns {Object} - Record defaults
   */
  getDefaultsForType(type) {
    return this.runtimeConfig.recordDefaults[type] || {
      content: this.defaultContent,
      proxied: this.defaultProxied,
      ttl: this.defaultTTL
    };
  }
  
  /**
   * Get the main domain for the current provider
   */
  getProviderDomain() {
    switch (this.runtimeConfig.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        return this.runtimeConfig.cloudflareZone;
      case 'route53':
        return this.runtimeConfig.route53Zone;
      case 'digitalocean':
        return this.runtimeConfig.digitalOceanDomain;
      default:
        return '';
    }
  }
  
  /**
   * Validate required configuration for the selected provider
   */
  validateProviderConfig() {
    switch (this.runtimeConfig.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        if (!this.runtimeConfig.cloudflareToken) {
          throw new Error('CLOUDFLARE_TOKEN environment variable is required for Cloudflare provider');
        }
        if (!this.runtimeConfig.cloudflareZone) {
          throw new Error('CLOUDFLARE_ZONE environment variable is required for Cloudflare provider');
        }
        break;
        
      case 'route53':
        if (!this.runtimeConfig.route53AccessKey) {
          throw new Error('ROUTE53_ACCESS_KEY environment variable is required for Route53 provider');
        }
        if (!this.runtimeConfig.route53SecretKey) {
          throw new Error('ROUTE53_SECRET_KEY environment variable is required for Route53 provider');
        }
        
        // Allow either zone name or zone ID (prefer zone name for consistency with other providers)
        if (!this.runtimeConfig.route53Zone && !this.runtimeConfig.route53ZoneId) {
          throw new Error('Either ROUTE53_ZONE or ROUTE53_ZONE_ID environment variable is required for Route53 provider');
        }
        break;
        
      case 'digitalocean':
        if (!this.runtimeConfig.digitalOceanToken) {
          throw new Error('DO_TOKEN environment variable is required for DigitalOcean provider');
        }
        if (!this.runtimeConfig.digitalOceanDomain) {
          throw new Error('DO_DOMAIN environment variable is required for DigitalOcean provider');
        }
        break;
        
      default:
        throw new Error(`Unsupported DNS provider: ${this.runtimeConfig.dnsProvider}`);
    }
  }
  
  /**
   * Get public IPv4 address synchronously (from cache)
   * If cache is empty, will return null and trigger async update
   */
  getPublicIPSync() {
    if (!this.ipCache.ipv4) {
      // If we don't have a cached IP, trigger an async update
      // This won't block the current execution, but will update for next time
      this.updatePublicIPs();
    }
    return this.ipCache?.ipv4 || null;
  }
  
  /**
   * Get public IPv6 address synchronously (from cache)
   */
  getPublicIPv6Sync() {
    if (!this.ipCache.ipv6) {
      this.updatePublicIPs();
    }
    return this.ipCache?.ipv6 || null;
  }
  
  /**
   * Get public IP address asynchronously
   * Returns a promise that resolves to the public IP
   */
  async getPublicIP() {
    // Check if cache is fresh (less than 1 hour old)
    const cacheAge = Date.now() - this.ipCache.lastCheck;
    if (this.ipCache.ipv4 && cacheAge < this.ipRefreshInterval) {
      return this.ipCache.ipv4;
    }
    
    // Cache is stale or empty, update it
    await this.updatePublicIPs();
    return this.ipCache.ipv4;
  }
  
  /**
   * Update the public IP cache by calling external IP services
   * Uses a semaphore to prevent concurrent updates
   */
  async updatePublicIPs() {
    // If an update is already in progress, wait for it to complete
    if (ipUpdateInProgress) {
      logger.debug('IP update already in progress, waiting...');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!ipUpdateInProgress) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
      return this.ipCache;
    }
    
    ipUpdateInProgress = true;
    
    try {
      // Remember old IPs to detect changes
      const oldIpv4 = this.ipCache.ipv4;
      const oldIpv6 = this.ipCache.ipv6;
      
      // Use environment variables if provided, otherwise fetch from IP service
      let ipv4 = process.env.PUBLIC_IP;
      let ipv6 = process.env.PUBLIC_IPV6;
      
      // If IP not set via environment, fetch from service
      if (!ipv4) {
        try {
          // First try ipify.org
          const response = await axios.get('https://api.ipify.org', { timeout: 5000 });
          ipv4 = response.data;
        } catch (error) {
          // Fallback to ifconfig.me if ipify fails
          try {
            const response = await axios.get('https://ifconfig.me/ip', { timeout: 5000 });
            ipv4 = response.data;
          } catch (fallbackError) {
            logger.error(`Failed to fetch public IPv4 address: ${fallbackError.message}`);
          }
        }
      }
      
      // Try to get IPv6 if not set in environment
      if (!ipv6) {
        try {
          const response = await axios.get('https://api6.ipify.org', { timeout: 5000 });
          ipv6 = response.data;
        } catch (error) {
          // IPv6 fetch failure is not critical, just log it
          logger.debug('Failed to fetch public IPv6 address (this is normal if you don\'t have IPv6)');
        }
      }
      
      // Update cache
      this.ipCache = {
        ipv4: ipv4,
        ipv6: ipv6,
        lastCheck: Date.now()
      };
      
      // Update record defaults with new IPs
      this.updateRecordDefaultsWithIPs();
      
      // Only log once if IP has changed
      if (ipv4 && ipv4 !== oldIpv4) {
        // Log directly to console to ensure just one message
        console.log(`${new Date().toISOString()} [INFO] Public IPv4: ${ipv4}`);
      }
      
      if (ipv6 && ipv6 !== oldIpv6) {
        logger.debug(`Public IPv6: ${ipv6}`);
      }
      
      return this.ipCache;
    } catch (error) {
      logger.error(`Error updating public IPs: ${error.message}`);
      return this.ipCache;
    } finally {
      ipUpdateInProgress = false;
    }
  }
  
  /**
   * Ensure the configuration manager is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }
  
  /**
   * Display configured settings in a structured format
   */
  async displaySettings() {
    try {
      // Get version from package.json
      const packageJson = require('../../package.json');
      const version = packageJson.version || '1.0.0';
      
      console.log(''); // Empty line for better readability
      logger.info(`🚀 TráfegoDNS v${version}`);
      
      // Display operation mode
      const operationMode = this.runtimeConfig.operationMode || 'traefik';
      logger.info(`🔄 Operation Mode: ${operationMode.toUpperCase()}`);
      console.log(''); // Empty line for spacing
      
      // DNS Provider Section
      logger.info('🌐 DNS PROVIDER');
      logger.info(`  🟢 Provider: ${this.runtimeConfig.dnsProvider}`);
      // Mask any sensitive tokens for security
      const maskedToken = this.cloudflareToken ? 'Configured' : 'Not configured';
      logger.info(`  🔑 Auth: ${maskedToken}`);
      logger.info(`  🌐 Zone: ${this.getProviderDomain()}`);
      console.log(''); // Empty line for spacing
      
      // Connectivity Section
      logger.info('🔄 CONNECTIVITY');
      if (operationMode.toLowerCase() === 'traefik') {
        logger.info(`  🟢 Traefik API: ${this.runtimeConfig.traefikApiUrl}`);
        const authStatus = this.runtimeConfig.traefikApiUsername ? 'Enabled' : 'Disabled';
        logger.info(`  🔐 Basic Auth: ${authStatus}`);
      } else {
        logger.info(`  🟢 Docker Labels: Direct access mode (no Traefik)`);
      }
      logger.info(`  🐳 Docker Socket: ${this.runtimeConfig.dockerSocket}`);
      console.log(''); // Empty line for spacing
      
      // Network Section
      logger.info('📍 NETWORK');
      const ipv4 = this.getPublicIPSync() || 'Auto-detecting...';
      logger.info(`  🌐 IPv4: ${ipv4}`);
      const ipv6 = this.getPublicIPv6Sync() || 'Not detected';
      logger.info(`  🌐 IPv6: ${ipv6}`);
      const ipRefreshMin = (this.runtimeConfig.ipRefreshInterval / 60000).toFixed(0);
      logger.info(`  🔄 IP Refresh: Every ${ipRefreshMin} minutes`);
      console.log(''); // Empty line for spacing
      
      // DNS Defaults Section
      logger.info('⚓ DNS DEFAULTS');
      logger.info(`  📄 Record Type: ${this.runtimeConfig.defaultRecordType}`);
      logger.info(`  🔗 Content: ${this.runtimeConfig.defaultContent}`);
      logger.info(`  🛡️ Proxied: ${this.runtimeConfig.defaultProxied ? 'Yes' : 'No'}`);
      logger.info(`  ⏱️ TTL: ${this.runtimeConfig.defaultTTL} ${this.runtimeConfig.defaultTTL === 1 ? '(Auto)' : ''}`);
      console.log(''); // Empty line for spacing
      
      // Settings Section
      logger.info('⚙️ SETTINGS');
      logger.info(`  📊 Log Level: ${logger.levelNames[logger.level]}`);
      logger.info(`  🐳 Docker Events: ${this.runtimeConfig.watchDockerEvents ? 'Yes' : 'No'}`);
      logger.info(`  🧹 Cleanup Orphaned: ${this.runtimeConfig.cleanupOrphaned ? 'Yes' : 'No'}`);
      
      // Add preserved hostnames if available
      if (this.dataStore) {
        const preservedHostnames = await this.dataStore.getPreservedHostnames();
        if (preservedHostnames.length > 0) {
          logger.info(`  🛡️ Preserved Hostnames: ${preservedHostnames.join(', ')}`);
        } else {
          logger.info(`  🛡️ Preserved Hostnames: None`);
        }
        
        // Add managed hostnames if available
        const managedHostnames = await this.dataStore.getManagedHostnames();
        if (managedHostnames.length > 0) {
          const managedList = managedHostnames.map(h => h.hostname).join(', ');
          logger.info(`  📋 Managed Hostnames: ${managedList}`);
        } else {
          logger.info(`  📋 Managed Hostnames: None`);
        }
      }
      
      console.log(''); // Empty line for spacing
      
      // Performance Section
      logger.info('⚡ PERFORMANCE');
      const cacheRefreshMin = (this.runtimeConfig.cacheRefreshInterval / 60000).toFixed(0);
      logger.info(`  💾 Cache TTL: ${cacheRefreshMin} minutes`);
      const pollIntervalSec = (this.runtimeConfig.pollInterval / 1000).toFixed(0);
      logger.info(`  🕒 Poll Interval: ${pollIntervalSec} seconds`);
      console.log(''); // Empty line for spacing
    } catch (error) {
      logger.error(`Error displaying settings: ${error.message}`);
      // Continue even if we can't display settings properly
    }
  }
  
  /**
   * Get full configuration (for API)
   * Sanitized for sensitive data
   */
  getFullConfig() {
    // Create a copy of runtime config
    const config = { ...this.runtimeConfig };
    
    // Sanitize sensitive fields
    if (config.cloudflareToken) config.cloudflareToken = '********';
    if (config.route53AccessKey) config.route53AccessKey = '********';
    if (config.route53SecretKey) config.route53SecretKey = '********';
    if (config.digitalOceanToken) config.digitalOceanToken = '********';
    if (config.traefikApiPassword) config.traefikApiPassword = '********';
    
    return config;
  }
  
  /**
   * Update multiple configuration values at once
   * @param {Object} configUpdates - Configuration updates
   * @param {boolean} persist - Whether to persist changes
   */
  async updateMultipleConfig(configUpdates, persist = true) {
    // Keep track of all changed keys for notifications
    const changes = {};
    
    // Update each key
    for (const [key, value] of Object.entries(configUpdates)) {
      // Skip undefined or internal properties
      if (value === undefined || key.startsWith('_')) continue;
      
      // Skip properties that don't exist in runtime config
      if (!(key in this.runtimeConfig)) continue;
      
      changes[key] = {
        oldValue: this.runtimeConfig[key],
        newValue: value
      };
      
      // Update runtime config
      this.runtimeConfig[key] = value;
    }
    
    // Special handling after all updates
    if ('dnsProvider' in changes) {
      // Update dnsLabelPrefix
      this.runtimeConfig.dnsLabelPrefix = `${this.runtimeConfig.genericLabelPrefix}${this.runtimeConfig.dnsProvider}.`;
      
      // Update default TTL
      this.setDefaultTTLs();
    }
    
    // Persist if requested
    if (persist) {
      await this.saveConfig();
    }
    
    // Notify change handlers
    for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
      this.notifyChangeHandlers(key, oldValue, newValue);
    }
    
    return true;
  }
  
  /**
   * Validate and update provider
   * Checks if the new provider can be configured correctly
   * @param {string} provider - New DNS provider
   * @param {Object} credentials - Provider credentials
   */
  async validateAndSwitchProvider(provider, credentials) {
    // Create a temporary config with the new provider
    const tempConfig = {
      ...this.runtimeConfig,
      dnsProvider: provider
    };
    
    // Add credentials based on provider
    switch (provider.toLowerCase()) {
      case 'cloudflare':
        tempConfig.cloudflareToken = credentials.token;
        tempConfig.cloudflareZone = credentials.zone;
        break;
      case 'route53':
        tempConfig.route53AccessKey = credentials.accessKey;
        tempConfig.route53SecretKey = credentials.secretKey;
        tempConfig.route53Zone = credentials.zone;
        tempConfig.route53ZoneId = credentials.zoneId;
        break;
      case 'digitalocean':
        tempConfig.digitalOceanToken = credentials.token;
        tempConfig.digitalOceanDomain = credentials.domain;
        break;
      default:
        throw new Error(`Unsupported DNS provider: ${provider}`);
    }
    
    // Create provider factory and try to initialize
    const ProvidersFactory = require('../providers/factory');
    const oldProvider = this.runtimeConfig.dnsProvider;
    
    try {
      // Temporarily update runtime config to test provider
      this.runtimeConfig = tempConfig;
      
      // Try to create and initialize the provider
      const testProvider = ProvidersFactory.createProvider(this);
      await testProvider.init();
      
      // If we get here, provider is valid
      
      // Update permanent credentials in runtime config
      switch (provider.toLowerCase()) {
        case 'cloudflare':
          this.runtimeConfig.cloudflareToken = credentials.token;
          this.runtimeConfig.cloudflareZone = credentials.zone;
          break;
        case 'route53':
          this.runtimeConfig.route53AccessKey = credentials.accessKey;
          this.runtimeConfig.route53SecretKey = credentials.secretKey;
          this.runtimeConfig.route53Zone = credentials.zone;
          this.runtimeConfig.route53ZoneId = credentials.zoneId;
          break;
        case 'digitalocean':
          this.runtimeConfig.digitalOceanToken = credentials.token;
          this.runtimeConfig.digitalOceanDomain = credentials.domain;
          break;
      }
      
      // Update dnsLabelPrefix
      this.runtimeConfig.dnsLabelPrefix = `${this.runtimeConfig.genericLabelPrefix}${provider}.`;
      
      // Update default TTL
      this.setDefaultTTLs();
      
      // Initialize record defaults
      this.initRecordDefaults();
      
      // Persist changes that don't include secrets
      await this.saveConfig();
      
      // Notify change handlers
      this.notifyChangeHandlers('dnsProvider', oldProvider, provider);
      
      return true;
    } catch (error) {
      // Restore original config on error
      this.runtimeConfig = { ...this.runtimeConfig, dnsProvider: oldProvider };
      throw new Error(`Failed to switch to provider ${provider}: ${error.message}`);
    }
  }
}