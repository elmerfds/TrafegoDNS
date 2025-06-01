/**
 * Configuration management for Traefik DNS Manager 
 */
const axios = require('axios');
const logger = require('../utils/logger');
const EnvironmentLoader = require('./EnvironmentLoader');

// Semaphore for IP update process
let ipUpdateInProgress = false;

class ConfigManager {
  constructor() {
    // Initialize IP cache first to avoid reference errors
    this.ipCache = {
      ipv4: process.env.PUBLIC_IP || null,
      ipv6: process.env.PUBLIC_IPV6 || null,
      lastCheck: 0
    };
    
    // Store original environment values
    this._envConfig = {};
    
    // Initialize with environment variables first
    this._loadFromEnvironment();
    
    // Flag to track if we've loaded from database
    this._dbLoaded = false;
  }
  
  /**
   * Load configuration from environment variables
   * This serves as the default/fallback configuration
   */
  _loadFromEnvironment() {
    // Operation mode - traefik or direct
    this.operationMode = EnvironmentLoader.getString('OPERATION_MODE', 'traefik');
    this._envConfig.operationMode = this.operationMode;

    // Managed Hostname management
    this.managedHostnames = EnvironmentLoader.getString('MANAGED_HOSTNAMES', '');
    this._envConfig.managedHostnames = this.managedHostnames;
    
    // Preserved Hostnames (protected from cleanup)
    this.preservedHostnames = EnvironmentLoader.getString('PRESERVED_HOSTNAMES', '');
    this._envConfig.preservedHostnames = this.preservedHostnames;

    // DNS Provider configuration
    this.dnsProvider = EnvironmentLoader.getString('DNS_PROVIDER', 'cloudflare');
    this._envConfig.dnsProvider = this.dnsProvider;
    
    // Provider-specific settings
    // Cloudflare settings
    this.cloudflareToken = EnvironmentLoader.getSecret('CLOUDFLARE_TOKEN');
    this.cloudflareZone = EnvironmentLoader.getString('CLOUDFLARE_ZONE');
    
    // Route53 settings
    this.route53AccessKey = EnvironmentLoader.getSecret('ROUTE53_ACCESS_KEY');
    this.route53SecretKey = EnvironmentLoader.getSecret('ROUTE53_SECRET_KEY');
    this.route53Zone = EnvironmentLoader.getString('ROUTE53_ZONE');
    this.route53ZoneId = EnvironmentLoader.getString('ROUTE53_ZONE_ID');
    this.route53Region = EnvironmentLoader.getString('ROUTE53_REGION', 'eu-west-2');
    
    // Digital Ocean settings
    this.digitalOceanToken = EnvironmentLoader.getSecret('DO_TOKEN');
    this.digitalOceanDomain = EnvironmentLoader.getString('DO_DOMAIN');
    
    // Store environment config for all settings
    this._storeEnvConfig();
    
    // Validate required settings based on provider
    this.validateProviderConfig();
    
    // Load all configuration from environment before database override
    this._loadRemainingEnvironmentConfig();
  }
  
  /**
   * Load remaining configuration from environment variables
   */
  _loadRemainingEnvironmentConfig() {
    // Traefik API settings
    this.traefikApiUrl = EnvironmentLoader.getString('TRAEFIK_API_URL', 'http://traefik:8080/api');
    this.traefikApiUsername = EnvironmentLoader.getString('TRAEFIK_API_USERNAME');
    this.traefikApiPassword = EnvironmentLoader.getSecret('TRAEFIK_API_PASSWORD');
    
    // Label prefixes
    this.genericLabelPrefix = EnvironmentLoader.getString('DNS_LABEL_PREFIX', 'dns.');
    // If the generic label prefix already contains the provider name, don't duplicate it
    if (this.genericLabelPrefix.includes(this.dnsProvider)) {
      this.dnsLabelPrefix = this.genericLabelPrefix;
    } else {
      this.dnsLabelPrefix = `${this.genericLabelPrefix}${this.dnsProvider}.`;
    }
    this.traefikLabelPrefix = EnvironmentLoader.getString('TRAEFIK_LABEL_PREFIX', 'traefik.');
    
    // Global DNS defaults
    this.defaultRecordType = EnvironmentLoader.getString('DNS_DEFAULT_TYPE', 'CNAME');
    this.defaultType = this.defaultRecordType; // alias for consistency
    // Don't call getProviderDomain() here as it's not ready yet - set it later
    this.defaultContent = EnvironmentLoader.getString('DNS_DEFAULT_CONTENT', '');
    this.defaultProxied = EnvironmentLoader.getBool('DNS_DEFAULT_PROXIED', true);
    
    // Set default TTL based on the provider
    switch (this.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        this.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 1); // Cloudflare minimum is 1 (Auto)
        break;
      case 'digitalocean':
        this.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 30); // DigitalOcean minimum is 30
        break;
      case 'route53':
        this.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 60); // Route53 minimum is 60
        break;
      default:
        this.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', 1); // Default fallback
    }
    
    this.defaultManage = EnvironmentLoader.getBool('DNS_DEFAULT_MANAGE', true);
    
    // Record type specific defaults - we'll set A content after IP discovery
    this.recordDefaults = {
      A: {
        content: '',  // Will be set after IP discovery
        proxied: process.env.DNS_DEFAULT_A_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_A_PROXIED !== 'false' : 
                 this.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_A_TTL', this.defaultTTL)
      },
      AAAA: {
        content: '',  // Will be set after IP discovery
        proxied: process.env.DNS_DEFAULT_AAAA_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_AAAA_PROXIED !== 'false' : 
                 this.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_AAAA_TTL', this.defaultTTL)
      },
      CNAME: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_CNAME_CONTENT', this.defaultContent || ''),
        proxied: process.env.DNS_DEFAULT_CNAME_PROXIED !== undefined ? 
                 process.env.DNS_DEFAULT_CNAME_PROXIED !== 'false' : 
                 this.defaultProxied,
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_CNAME_TTL', this.defaultTTL)
      },
      MX: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_MX_CONTENT', ''),
        priority: EnvironmentLoader.getInt('DNS_DEFAULT_MX_PRIORITY', 10),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_MX_TTL', this.defaultTTL)
      },
      TXT: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_TXT_CONTENT', ''),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_TXT_TTL', this.defaultTTL)
      },
      SRV: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_SRV_CONTENT', ''),
        priority: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_PRIORITY', 1),
        weight: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_WEIGHT', 1),
        port: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_PORT', 80),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_SRV_TTL', this.defaultTTL)
      },
      CAA: {
        content: EnvironmentLoader.getString('DNS_DEFAULT_CAA_CONTENT', ''),
        flags: EnvironmentLoader.getInt('DNS_DEFAULT_CAA_FLAGS', 0),
        tag: EnvironmentLoader.getString('DNS_DEFAULT_CAA_TAG', 'issue'),
        ttl: EnvironmentLoader.getInt('DNS_DEFAULT_CAA_TTL', this.defaultTTL)
      }
    };
    
    // Application behavior
    this.dockerSocket = EnvironmentLoader.getString('DOCKER_SOCKET', '/var/run/docker.sock');
    this.pollInterval = EnvironmentLoader.getInt('POLL_INTERVAL', 60000);
    this.watchDockerEvents = EnvironmentLoader.getBool('WATCH_DOCKER_EVENTS', true);
    this.cleanupOrphaned = EnvironmentLoader.getBool('CLEANUP_ORPHANED', false);
    this.cleanupGracePeriod = EnvironmentLoader.getInt('CLEANUP_GRACE_PERIOD', 15); // Default to 60 minutes
    
    // Cache refresh interval in milliseconds (default: 1 hour)
    this.dnsCacheRefreshInterval = EnvironmentLoader.getInt('DNS_CACHE_REFRESH_INTERVAL', 3600000);
    // Keep backwards compatibility
    this.cacheRefreshInterval = this.dnsCacheRefreshInterval;

    // API request timeout in milliseconds (default: 1 minute)
    this.apiTimeout = EnvironmentLoader.getInt('API_TIMEOUT', 60000);    
    
    // IP refresh interval in milliseconds (default: 1 hour)
    this.ipRefreshInterval = EnvironmentLoader.getInt('IP_REFRESH_INTERVAL', 3600000);
    
    // Now that provider config is validated, set the default content if not provided
    if (!this.defaultContent && !process.env.DNS_DEFAULT_CONTENT) {
      this.defaultContent = this.getProviderDomain();
    }
    
    // Update CNAME default content as well
    if (!this.recordDefaults.CNAME.content) {
      this.recordDefaults.CNAME.content = this.defaultContent;
    }
    
    // Schedule immediate IP update and then periodic refresh
    this.updatePublicIPs().then(() => {
      // Update A record defaults after IP discovery
      this.recordDefaults.A.content = process.env.DNS_DEFAULT_A_CONTENT || this.ipCache.ipv4 || '';
      this.recordDefaults.AAAA.content = process.env.DNS_DEFAULT_AAAA_CONTENT || this.ipCache.ipv6 || '';
      logger.debug(`Updated A record defaults with IP: ${this.recordDefaults.A.content}`);
    });

    // Set up periodic IP refresh
    if (this.ipRefreshInterval > 0) {
      setInterval(() => this.updatePublicIPs(), this.ipRefreshInterval);
    }
  }
  
  /**
   * Store all configuration values in _envConfig for database persistence
   */
  _storeEnvConfig() {
    // Application settings
    this._envConfig.pollInterval = this.pollInterval;
    this._envConfig.watchDockerEvents = this.watchDockerEvents;
    this._envConfig.cleanupOrphaned = this.cleanupOrphaned;
    this._envConfig.cleanupGracePeriod = this.cleanupGracePeriod;
    this._envConfig.managedHostnames = this.managedHostnames;
    this._envConfig.preservedHostnames = this.preservedHostnames;
    
    // DNS settings
    this._envConfig.dnsLabelPrefix = this.dnsLabelPrefix;
    this._envConfig.dnsDefaultType = this.defaultRecordType;
    this._envConfig.dnsDefaultContent = this.defaultContent;
    this._envConfig.dnsDefaultProxied = this.defaultProxied;
    this._envConfig.dnsDefaultTTL = this.defaultTTL;
    this._envConfig.dnsDefaultManage = this.defaultManage;
    
    // Provider-specific settings (non-sensitive only)
    this._envConfig.cloudflareZone = this.cloudflareZone;
    this._envConfig.route53Zone = this.route53Zone;
    this._envConfig.route53ZoneId = this.route53ZoneId;
    this._envConfig.route53Region = this.route53Region;
    this._envConfig.digitalOceanDomain = this.digitalOceanDomain;
    
    // Traefik settings
    this._envConfig.traefikApiUrl = this.traefikApiUrl;
    this._envConfig.traefikApiUsername = this.traefikApiUsername;
    
    // Docker settings
    this._envConfig.dockerSocket = this.dockerSocket;
    
    // Cache settings
    this._envConfig.dnsCacheRefreshInterval = this.dnsCacheRefreshInterval;
    this._envConfig.ipRefreshInterval = this.ipRefreshInterval;
    
    // Network settings
    this._envConfig.apiTimeout = this.apiTimeout;
    
    // Label settings
    this._envConfig.genericLabelPrefix = this.genericLabelPrefix;
    this._envConfig.traefikLabelPrefix = this.traefikLabelPrefix;
  }
  
  /**
   * Load configuration from database, using environment as fallback
   */
  async loadFromDatabase() {
    try {
      const database = require('../database');
      
      // Check if database is initialized
      if (!database.isInitialized() || !database.repositories?.setting) {
        logger.debug('Database not ready, using environment configuration only');
        return;
      }
      
      // Get all settings from database
      const dbSettings = await database.repositories.setting.getAll();
      
      // If no settings in database, save current environment config
      if (Object.keys(dbSettings).length === 0) {
        logger.info('No settings found in database, saving environment configuration');
        await this.saveToDatabase();
        return;
      }
      
      // Apply database settings over environment defaults
      this._applySettings(dbSettings);
      
      // Load secrets from database (if any)
      await this.loadSecrets();
      
      this._dbLoaded = true;
      
      logger.info('Configuration loaded from database successfully');
    } catch (error) {
      logger.error(`Failed to load configuration from database: ${error.message}`);
      // Continue with environment configuration
    }
  }
  
  /**
   * Save current configuration to database
   */
  async saveToDatabase() {
    try {
      const database = require('../database');
      
      // Check if database is initialized
      if (!database.isInitialized() || !database.repositories?.setting) {
        logger.warn('Database not ready, cannot save configuration');
        return { success: false, error: 'Database not initialized' };
      }
      
      // Prepare settings to save (exclude sensitive data)
      const settingsToSave = {
        // Application settings
        operationMode: this.operationMode,
        pollInterval: this.pollInterval,
        watchDockerEvents: this.watchDockerEvents,
        cleanupOrphaned: this.cleanupOrphaned,
        cleanupGracePeriod: this.cleanupGracePeriod,
        
        // DNS settings
        dnsProvider: this.dnsProvider,
        dnsLabelPrefix: this.dnsLabelPrefix,
        dnsDefaultType: this.defaultRecordType,
        dnsDefaultContent: this.defaultContent,
        dnsDefaultProxied: this.defaultProxied,
        dnsDefaultTTL: this.defaultTTL,
        dnsDefaultManage: this.defaultManage,
        
        // Provider domains (non-sensitive)
        cloudflareZone: this.cloudflareZone,
        route53Zone: this.route53Zone,
        route53ZoneId: this.route53ZoneId,
        route53Region: this.route53Region,
        digitalOceanDomain: this.digitalOceanDomain,
        
        // Traefik settings (without password)
        traefikApiUrl: this.traefikApiUrl,
        traefikApiUsername: this.traefikApiUsername,
        
        // Docker settings
        dockerSocket: this.dockerSocket,
        
        // Cache settings
        dnsCacheRefreshInterval: this.dnsCacheRefreshInterval,
        ipRefreshInterval: this.ipRefreshInterval,
        
        // Network settings
        apiTimeout: this.apiTimeout,
        
        // Label settings
        genericLabelPrefix: this.genericLabelPrefix,
        traefikLabelPrefix: this.traefikLabelPrefix,
        
        // Managed hostnames
        managedHostnames: this.managedHostnames,
        preservedHostnames: this.preservedHostnames,
        
        // Record type defaults
        recordDefaults: this.recordDefaults
      };
      
      // Save all settings
      await database.repositories.setting.setMany(settingsToSave);
      
      logger.info('Configuration saved to database successfully');
      return { success: true };
    } catch (error) {
      logger.error(`Failed to save configuration to database: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Apply settings from database over current configuration
   */
  _applySettings(settings) {
    // Only apply settings that exist in database
    if (settings.operationMode !== undefined) this.operationMode = settings.operationMode;
    if (settings.pollInterval !== undefined) this.pollInterval = settings.pollInterval;
    if (settings.watchDockerEvents !== undefined) this.watchDockerEvents = settings.watchDockerEvents;
    if (settings.cleanupOrphaned !== undefined) this.cleanupOrphaned = settings.cleanupOrphaned;
    if (settings.cleanupGracePeriod !== undefined) this.cleanupGracePeriod = settings.cleanupGracePeriod;
    
    // DNS settings
    if (settings.dnsProvider !== undefined) this.dnsProvider = settings.dnsProvider;
    if (settings.dnsLabelPrefix !== undefined) {
      // If the saved dnsLabelPrefix already contains the provider name, use it as-is
      if (settings.dnsLabelPrefix.includes(this.dnsProvider)) {
        this.dnsLabelPrefix = settings.dnsLabelPrefix;
        // Extract the generic prefix (remove provider part)
        this.genericLabelPrefix = settings.dnsLabelPrefix.replace(`${this.dnsProvider}.`, '');
      } else {
        this.genericLabelPrefix = settings.dnsLabelPrefix;
        this.dnsLabelPrefix = `${this.genericLabelPrefix}${this.dnsProvider}.`;
      }
    }
    if (settings.dnsDefaultType !== undefined) {
      this.defaultRecordType = settings.dnsDefaultType;
      this.defaultType = this.defaultRecordType; // alias for consistency
    }
    if (settings.dnsDefaultContent !== undefined) this.defaultContent = settings.dnsDefaultContent;
    if (settings.dnsDefaultProxied !== undefined) this.defaultProxied = settings.dnsDefaultProxied;
    if (settings.dnsDefaultTTL !== undefined) this.defaultTTL = settings.dnsDefaultTTL;
    if (settings.dnsDefaultManage !== undefined) this.defaultManage = settings.dnsDefaultManage;
    
    // Provider domains
    if (settings.cloudflareZone !== undefined) this.cloudflareZone = settings.cloudflareZone;
    if (settings.route53Zone !== undefined) this.route53Zone = settings.route53Zone;
    if (settings.route53ZoneId !== undefined) this.route53ZoneId = settings.route53ZoneId;
    if (settings.route53Region !== undefined) this.route53Region = settings.route53Region;
    if (settings.digitalOceanDomain !== undefined) this.digitalOceanDomain = settings.digitalOceanDomain;
    
    // Traefik settings
    if (settings.traefikApiUrl !== undefined) this.traefikApiUrl = settings.traefikApiUrl;
    if (settings.traefikApiUsername !== undefined) this.traefikApiUsername = settings.traefikApiUsername;
    
    // Other settings
    if (settings.dockerSocket !== undefined) this.dockerSocket = settings.dockerSocket;
    if (settings.dnsCacheRefreshInterval !== undefined) {
      this.dnsCacheRefreshInterval = settings.dnsCacheRefreshInterval;
      this.cacheRefreshInterval = this.dnsCacheRefreshInterval; // backwards compatibility
    }
    if (settings.ipRefreshInterval !== undefined) this.ipRefreshInterval = settings.ipRefreshInterval;
    if (settings.apiTimeout !== undefined) this.apiTimeout = settings.apiTimeout;
    if (settings.genericLabelPrefix !== undefined) this.genericLabelPrefix = settings.genericLabelPrefix;
    if (settings.traefikLabelPrefix !== undefined) this.traefikLabelPrefix = settings.traefikLabelPrefix;
    if (settings.managedHostnames !== undefined) this.managedHostnames = settings.managedHostnames;
    if (settings.preservedHostnames !== undefined) this.preservedHostnames = settings.preservedHostnames;
    
    // Apply record defaults if present
    if (settings.recordDefaults !== undefined && typeof settings.recordDefaults === 'object') {
      this.recordDefaults = { ...this.recordDefaults, ...settings.recordDefaults };
    }
  }
  
  /**
   * Update configuration and persist to database
   */
  async updateConfig(updates) {
    try {
      // Store previous config for comparison
      const previousConfig = {
        operationMode: this.operationMode,
        pollInterval: this.pollInterval,
        watchDockerEvents: this.watchDockerEvents,
        cleanupOrphaned: this.cleanupOrphaned,
        cleanupGracePeriod: this.cleanupGracePeriod
      };
      
      // Apply updates
      this._applySettings(updates);
      
      // Save to database
      const saveResult = await this.saveToDatabase();
      
      if (!saveResult.success) {
        // Revert changes if save failed
        this._applySettings(previousConfig);
        return { 
          success: false, 
          error: saveResult.error || 'Failed to save configuration' 
        };
      }
      
      // Determine if restart is required
      const requiresRestart = (
        updates.operationMode !== undefined && updates.operationMode !== previousConfig.operationMode ||
        updates.dockerSocket !== undefined ||
        updates.traefikApiUrl !== undefined ||
        updates.dnsProvider !== undefined
      );
      
      return {
        success: true,
        previousConfig,
        requiresRestart
      };
    } catch (error) {
      logger.error(`Failed to update configuration: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get all configuration as a plain object (for API responses)
   */
  toJSON() {
    return {
      operationMode: this.operationMode,
      pollInterval: this.pollInterval,
      watchDockerEvents: this.watchDockerEvents,
      cleanupOrphaned: this.cleanupOrphaned,
      cleanupGracePeriod: this.cleanupGracePeriod,
      dnsProvider: this.dnsProvider,
      dnsLabelPrefix: this.dnsLabelPrefix,
      dnsDefaultType: this.defaultRecordType,
      dnsDefaultContent: this.defaultContent,
      dnsDefaultProxied: this.defaultProxied,
      dnsDefaultTTL: this.defaultTTL,
      dnsDefaultManage: this.defaultManage,
      domain: this.getProviderDomain(),
      publicIP: this.getPublicIPSync(),
      publicIPv6: this.getPublicIPv6Sync(),
      ipRefreshInterval: this.ipRefreshInterval,
      traefikApiUrl: this.traefikApiUrl,
      dockerSocket: this.dockerSocket,
      dnsCacheRefreshInterval: this.cacheRefreshInterval,
      apiTimeout: this.apiTimeout,
      managedHostnames: this.managedHostnames,
      recordDefaults: this.recordDefaults,
      dbLoaded: this._dbLoaded
    };
  }
  
  /**
   * Validate that required config is present for the selected provider
   */
  validateProviderConfig() {
    switch (this.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        if (!this.cloudflareToken) {
          throw new Error('CLOUDFLARE_TOKEN environment variable is required for Cloudflare provider');
        }
        if (!this.cloudflareZone) {
          throw new Error('CLOUDFLARE_ZONE environment variable is required for Cloudflare provider');
        }
        break;
        
      case 'route53':
        if (!this.route53AccessKey) {
          throw new Error('ROUTE53_ACCESS_KEY environment variable is required for Route53 provider');
        }
        if (!this.route53SecretKey) {
          throw new Error('ROUTE53_SECRET_KEY environment variable is required for Route53 provider');
        }
        
        // Allow either zone name or zone ID (prefer zone name for consistency with other providers)
        if (!this.route53Zone && !this.route53ZoneId) {
          throw new Error('Either ROUTE53_ZONE or ROUTE53_ZONE_ID environment variable is required for Route53 provider');
        }
        break;
        
      case 'digitalocean':
        if (!this.digitalOceanToken) {
          throw new Error('DO_TOKEN environment variable is required for DigitalOcean provider');
        }
        if (!this.digitalOceanDomain) {
          throw new Error('DO_DOMAIN environment variable is required for DigitalOcean provider');
        }
        break;
        
      default:
        throw new Error(`Unsupported DNS provider: ${this.dnsProvider}`);
    }
  }
  
  /**
   * Get the main domain for the current provider
   */
  getProviderDomain() {
    switch (this.dnsProvider.toLowerCase()) {
      case 'cloudflare':
        return this.cloudflareZone;
      case 'route53':
        return this.route53Zone;
      case 'digitalocean':
        return this.digitalOceanDomain;
      default:
        return '';
    }
  }
  
  /**
   * Get defaults for a specific record type
   */
  getDefaultsForType(type) {
    return this.recordDefaults[type] || {
      content: this.defaultContent,
      proxied: this.defaultProxied,
      ttl: this.defaultTTL
    };
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
   * Save secrets to database (encrypted)
   * @param {Object} secrets - Object containing secret values
   * @param {string} userId - ID of user making the change (for audit log)
   * @returns {Promise<Object>} - Success/error result
   */
  async saveSecrets(secrets, userId = null) {
    try {
      const database = require('../database');
      
      if (!database.isInitialized() || !database.repositories?.setting) {
        return { success: false, error: 'Database not initialized' };
      }
      
      // Encrypt secrets before storage
      const encryptedSecrets = {};
      const crypto = require('crypto');
      
      // Simple encryption key derived from environment
      const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'trafegodns-default-key').digest();
      
      for (const [secretName, secretValue] of Object.entries(secrets)) {
        if (secretValue && secretValue.trim() !== '') {
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipherGCM('aes-256-gcm', key);
          cipher.setAAD(Buffer.from(secretName));
          
          let encrypted = cipher.update(secretValue, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          
          const authTag = cipher.getAuthTag();
          
          encryptedSecrets[`secret_${secretName}`] = JSON.stringify({
            data: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
          });
        }
      }
      
      // Save encrypted secrets to database
      await database.repositories.setting.setMany(encryptedSecrets);
      
      // Update in-memory values
      if (secrets.cloudflareToken) this.cloudflareToken = secrets.cloudflareToken;
      if (secrets.route53AccessKey) this.route53AccessKey = secrets.route53AccessKey;
      if (secrets.route53SecretKey) this.route53SecretKey = secrets.route53SecretKey;
      if (secrets.digitalOceanToken) this.digitalOceanToken = secrets.digitalOceanToken;
      if (secrets.traefikApiPassword) this.traefikApiPassword = secrets.traefikApiPassword;
      
      // Log audit entry
      if (database.repositories.activityLog && userId) {
        try {
          await database.repositories.activityLog.logActivity({
            type: 'updated',
            recordType: 'secrets',
            hostname: 'system',
            details: `Updated secrets: ${Object.keys(secrets).join(', ')}`,
            source: 'config',
            metadata: {
              userId: userId,
              secretsUpdated: Object.keys(secrets),
              timestamp: new Date().toISOString()
            }
          });
        } catch (auditError) {
          logger.warn(`Failed to log secret update audit: ${auditError.message}`);
        }
      }
      
      logger.info(`Successfully saved ${Object.keys(secrets).length} secrets to database`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to save secrets: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Load secrets from database (decrypted)
   * @returns {Promise<Object>} - Decrypted secrets
   */
  async loadSecrets() {
    try {
      const database = require('../database');
      
      if (!database.isInitialized() || !database.repositories?.setting) {
        return {};
      }
      
      // Get all secret settings from database
      const allSettings = await database.repositories.setting.getAll();
      const secretSettings = {};
      
      for (const [key, value] of Object.entries(allSettings)) {
        if (key.startsWith('secret_')) {
          secretSettings[key] = value;
        }
      }
      
      if (Object.keys(secretSettings).length === 0) {
        return {};
      }
      
      // Decrypt secrets
      const decryptedSecrets = {};
      const crypto = require('crypto');
      const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'trafegodns-default-key').digest();
      
      for (const [secretKey, encryptedValue] of Object.entries(secretSettings)) {
        try {
          const secretName = secretKey.replace('secret_', '');
          const encryptedData = JSON.parse(encryptedValue);
          
          const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
          decipher.setAAD(Buffer.from(secretName));
          decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
          
          let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          decryptedSecrets[secretName] = decrypted;
        } catch (decryptError) {
          logger.warn(`Failed to decrypt secret ${secretKey}: ${decryptError.message}`);
        }
      }
      
      // Update in-memory values if they exist in database
      if (decryptedSecrets.cloudflareToken) this.cloudflareToken = decryptedSecrets.cloudflareToken;
      if (decryptedSecrets.route53AccessKey) this.route53AccessKey = decryptedSecrets.route53AccessKey;
      if (decryptedSecrets.route53SecretKey) this.route53SecretKey = decryptedSecrets.route53SecretKey;
      if (decryptedSecrets.digitalOceanToken) this.digitalOceanToken = decryptedSecrets.digitalOceanToken;
      if (decryptedSecrets.traefikApiPassword) this.traefikApiPassword = decryptedSecrets.traefikApiPassword;
      
      return decryptedSecrets;
    } catch (error) {
      logger.error(`Failed to load secrets: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Save encrypted secrets to database
   * @param {Object} secrets - Object containing secret values
   * @param {string} userId - User ID for audit purposes
   * @returns {Object} - Result object with success status
   */
  async saveSecrets(secrets, userId = null) {
    try {
      const database = require('../database');
      
      if (!database.isInitialized() || !database.repositories?.setting) {
        return {
          success: false,
          error: 'Database not initialized'
        };
      }
      
      const crypto = require('crypto');
      
      // Generate encryption key from environment or default
      const encryptionKey = process.env.ENCRYPTION_KEY || 'trafegodns-default-key';
      const key = crypto.createHash('sha256').update(encryptionKey).digest();
      
      // Encrypt and save each secret
      const updatedSecrets = [];
      
      for (const [secretName, secretValue] of Object.entries(secrets)) {
        if (!secretValue || secretValue.trim() === '') {
          continue;
        }
        
        try {
          // Encrypt the secret value
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
          cipher.setAAD(Buffer.from(secretName, 'utf8'));
          
          let encrypted = cipher.update(secretValue.trim(), 'utf8', 'hex');
          encrypted += cipher.final('hex');
          
          const authTag = cipher.getAuthTag();
          
          // Combine iv, authTag, and encrypted data
          const encryptedData = {
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            data: encrypted
          };
          
          // Save to database with secret_ prefix
          const dbKey = `secret_${secretName}`;
          await database.repositories.setting.set(dbKey, JSON.stringify(encryptedData));
          
          updatedSecrets.push(secretName);
          
          logger.info(`Secret ${secretName} saved successfully`);
        } catch (encryptError) {
          logger.error(`Failed to encrypt secret ${secretName}: ${encryptError.message}`);
          return {
            success: false,
            error: `Failed to encrypt secret ${secretName}`
          };
        }
      }
      
      // Log audit trail
      if (database.repositories?.activityLog && userId) {
        try {
          await database.repositories.activityLog.logActivity({
            type: 'tracked',
            recordType: 'secrets',
            hostname: 'system',
            details: `Admin updated secrets: ${updatedSecrets.join(', ')}`,
            source: 'config',
            metadata: {
              userId: userId,
              action: 'update_secrets',
              secretsUpdated: updatedSecrets,
              timestamp: new Date().toISOString()
            }
          });
        } catch (auditError) {
          logger.warn(`Failed to log secret update audit: ${auditError.message}`);
        }
      }
      
      return {
        success: true,
        updatedSecrets: updatedSecrets
      };
    } catch (error) {
      logger.error(`Failed to save secrets: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Load and decrypt secrets from database
   * @returns {Object} - Object containing decrypted secret values
   */
  async loadSecrets() {
    try {
      const database = require('../database');
      
      if (!database.isInitialized() || !database.repositories?.setting) {
        logger.warn('Database not initialized, returning empty secrets');
        return {};
      }
      
      const crypto = require('crypto');
      const allSettings = await database.repositories.setting.getAll();
      const secrets = {};
      
      // Generate decryption key from environment or default
      const encryptionKey = process.env.ENCRYPTION_KEY || 'trafegodns-default-key';
      const key = crypto.createHash('sha256').update(encryptionKey).digest();
      
      // Find and decrypt all secret entries
      for (const [dbKey, encryptedValue] of Object.entries(allSettings)) {
        if (!dbKey.startsWith('secret_') || !encryptedValue) {
          continue;
        }
        
        const secretName = dbKey.replace('secret_', '');
        
        try {
          const encryptedData = JSON.parse(encryptedValue);
          
          if (!encryptedData.iv || !encryptedData.authTag || !encryptedData.data) {
            logger.warn(`Invalid encrypted data format for secret ${secretName}`);
            continue;
          }
          
          // Decrypt the secret value
          const iv = Buffer.from(encryptedData.iv, 'hex');
          const decipher = crypto.createDecipherGCM('aes-256-gcm', key, iv);
          decipher.setAAD(Buffer.from(secretName, 'utf8'));
          decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
          
          let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          secrets[secretName] = decrypted;
          
        } catch (decryptError) {
          logger.error(`Failed to decrypt secret ${secretName}: ${decryptError.message}`);
          // Continue with other secrets even if one fails
        }
      }
      
      return secrets;
    } catch (error) {
      logger.error(`Failed to load secrets: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Check which secrets are available (without revealing values)
   * @returns {Object} - Object indicating which secrets are set
   */
  async getSecretStatus() {
    try {
      const database = require('../database');
      
      if (!database.isInitialized() || !database.repositories?.setting) {
        // Fallback to environment variables
        return {
          hasCloudflareToken: !!this.cloudflareToken,
          hasRoute53AccessKey: !!this.route53AccessKey,
          hasRoute53SecretKey: !!this.route53SecretKey,
          hasDigitalOceanToken: !!this.digitalOceanToken,
          hasTraefikApiPassword: !!this.traefikApiPassword
        };
      }
      
      const allSettings = await database.repositories.setting.getAll();
      
      return {
        hasCloudflareToken: !!allSettings.secret_cloudflareToken || !!this.cloudflareToken,
        hasRoute53AccessKey: !!allSettings.secret_route53AccessKey || !!this.route53AccessKey,
        hasRoute53SecretKey: !!allSettings.secret_route53SecretKey || !!this.route53SecretKey,
        hasDigitalOceanToken: !!allSettings.secret_digitalOceanToken || !!this.digitalOceanToken,
        hasTraefikApiPassword: !!allSettings.secret_traefikApiPassword || !!this.traefikApiPassword
      };
    } catch (error) {
      logger.error(`Failed to get secret status: ${error.message}`);
      return {
        hasCloudflareToken: false,
        hasRoute53AccessKey: false,
        hasRoute53SecretKey: false,
        hasDigitalOceanToken: false,
        hasTraefikApiPassword: false
      };
    }
  }
}

module.exports = ConfigManager;