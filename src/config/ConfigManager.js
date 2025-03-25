/**
 * Configuration management for TráfegoDNS 
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

    // Operation mode
    this.operationMode = EnvironmentLoader.getString('OPERATION_MODE', 'traefik');
    this.managedHostnames = EnvironmentLoader.getString('MANAGED_HOSTNAMES', '');    
    this.dnsProvider = EnvironmentLoader.getString('DNS_PROVIDER', 'cloudflare');

    // Provider configurations
    this.loadProviderConfigs();
    
    // Validate required settings
    this.validateProviderConfig();

    // API settings
    this.loadAPIConfigs();
    
    // DNS Defaults
    this.setupDNSDefaults();
    
    // Schedule immediate IP update and then periodic refresh
    this.updatePublicIPs()
      .then(() => this.updateRecordDefaults())
      .catch(err => logger.error(`Error during initial IP update: ${err.message}`));

    // Periodic IP refresh
    if (this.ipRefreshInterval > 0) {
      setInterval(() => this.updatePublicIPs(), this.ipRefreshInterval);
    }
  }
  
  /**
   * Loads environment-based provider configurations
   */
  loadProviderConfigs() {
    this.cloudflareToken = EnvironmentLoader.getString('CLOUDFLARE_TOKEN');
    this.cloudflareZone = EnvironmentLoader.getString('CLOUDFLARE_ZONE');
    
    this.route53AccessKey = EnvironmentLoader.getString('ROUTE53_ACCESS_KEY');
    this.route53SecretKey = EnvironmentLoader.getString('ROUTE53_SECRET_KEY');
    this.route53Zone = EnvironmentLoader.getString('ROUTE53_ZONE');
    this.route53ZoneId = EnvironmentLoader.getString('ROUTE53_ZONE_ID');
    this.route53Region = EnvironmentLoader.getString('ROUTE53_REGION', 'eu-west-2');
    
    this.digitalOceanToken = EnvironmentLoader.getString('DO_TOKEN');
    this.digitalOceanDomain = EnvironmentLoader.getString('DO_DOMAIN');
  }

  /**
   * Loads API-related configurations
   */
  loadAPIConfigs() {
    this.traefikApiUrl = EnvironmentLoader.getString('TRAEFIK_API_URL', 'http://traefik:8080/api');
    this.traefikApiUsername = EnvironmentLoader.getString('TRAEFIK_API_USERNAME');
    this.traefikApiPassword = EnvironmentLoader.getString('TRAEFIK_API_PASSWORD');
    this.apiTimeout = EnvironmentLoader.getInt('API_TIMEOUT', 60000);  
    this.ipRefreshInterval = EnvironmentLoader.getInt('IP_REFRESH_INTERVAL', 3600000);
  }

  /**
   * Validate that required config is present for the selected provider
   */
  validateProviderConfig() {
    const provider = this.dnsProvider.toLowerCase();
    const requiredVars = {
      cloudflare: ['CLOUDFLARE_TOKEN', 'CLOUDFLARE_ZONE'],
      route53: ['ROUTE53_ACCESS_KEY', 'ROUTE53_SECRET_KEY'],
      digitalocean: ['DO_TOKEN', 'DO_DOMAIN']
    };

    if (!requiredVars[provider]) {
      throw new Error(`Unsupported DNS provider: ${this.dnsProvider}`);
    }

    requiredVars[provider].forEach(varName => {
      if (!process.env[varName]) {
        throw new Error(`${varName} environment variable is required for ${provider} provider`);
      }
    });
  }

  /**
   * Setup DNS-related defaults
   */
  setupDNSDefaults() {
    this.defaultRecordType = EnvironmentLoader.getString('DNS_DEFAULT_TYPE', 'CNAME');
    this.defaultContent = EnvironmentLoader.getString('DNS_DEFAULT_CONTENT', this.getProviderDomain());
    this.defaultProxied = EnvironmentLoader.getBool('DNS_DEFAULT_PROXIED', true);
    this.defaultTTL = EnvironmentLoader.getInt('DNS_DEFAULT_TTL', { cloudflare: 1, digitalocean: 30, route53: 60 }[this.dnsProvider.toLowerCase()] || 1);
    
    this.recordDefaults = {
      A: { content: '', proxied: this.defaultProxied, ttl: this.defaultTTL },
      AAAA: { content: '', proxied: this.defaultProxied, ttl: this.defaultTTL },
      CNAME: { content: this.defaultContent, proxied: this.defaultProxied, ttl: this.defaultTTL }
    };
  }

  /**
   * Update record defaults after fetching public IPs
   */
  updateRecordDefaults() {
    this.recordDefaults.A.content = this.ipCache.ipv4 || '';
    this.recordDefaults.AAAA.content = this.ipCache.ipv6 || '';
    logger.debug(`Updated A record defaults with IP: ${this.recordDefaults.A.content}`);
  }

  /**
   * Fetches public IP addresses asynchronously
   */
  async updatePublicIPs() {
    if (ipUpdateInProgress) return;
    ipUpdateInProgress = true;

    try {
      const [ipv4, ipv6] = await Promise.all([
        this.fetchIP('https://api.ipify.org'),
        this.fetchIP('https://api6.ipify.org', true)
      ]);

      this.ipCache = { ipv4, ipv6, lastCheck: Date.now() };
      this.updateRecordDefaults();

      logger.info(`Public IPs updated: IPv4=${ipv4}, IPv6=${ipv6}`);
    } catch (error) {
      logger.error(`Failed to update public IPs: ${error.message}`);
    } finally {
      ipUpdateInProgress = false;
    }
  }

  /**
   * Fetch IP address from external services
   * @param {string} url - API endpoint for fetching IP
   * @param {boolean} isIPv6 - Whether to fetch IPv6
   */
  async fetchIP(url, isIPv6 = false) {
    try {
      const { data } = await axios.get(url, { timeout: 5000 });
      return data;
    } catch (error) {
      logger.warn(`Failed to fetch public ${isIPv6 ? 'IPv6' : 'IPv4'}: ${error.message}`);
      return null;
    }
  }
}

module.exports = ConfigManager;