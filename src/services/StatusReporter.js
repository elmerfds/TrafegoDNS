/**
 * Status Reporter Service
 * Responsible for displaying application status and configuration
 */
const path = require('path');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');

class StatusReporter {
  constructor(config, eventBus, recordTracker) {
    this.config = config;
    this.eventBus = eventBus;
    this.recordTracker = recordTracker;
    
    // Subscribe to status events
    this.setupEventSubscriptions();
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to status update events
    this.eventBus.subscribe(EventTypes.STATUS_UPDATE, (data) => {
      this.logStatus(data);
    });
    
    // Subscribe to error events
    this.eventBus.subscribe(EventTypes.ERROR_OCCURRED, (data) => {
      this.logError(data);
    });
    
    // Subscribe to DNS events for statistics
    this.eventBus.subscribe(EventTypes.DNS_RECORDS_UPDATED, (data) => {
      // Log statistics will be handled by the DNS manager
    });
  }
  
  /**
   * Log application status
   */
  logStatus(data) {
    const { message, type = 'info' } = data;
    
    switch (type) {
      case 'success':
        logger.success(message);
        break;
      case 'warning':
        logger.warn(message);
        break;
      case 'debug':
        logger.debug(message);
        break;
      case 'trace':
        logger.trace(message);
        break;
      case 'info':
      default:
        logger.info(message);
        break;
    }
  }
  
  /**
   * Log application error
   */
  logError(data) {
    const { source, error } = data;
    logger.error(`Error in ${source}: ${error}`);
  }
  
  /**
   * Display configured settings in a visually appealing format
   */
  async displaySettings() {
    try {
      // Get version from package.json
      const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
      const packageJson = require(packageJsonPath);
      const version = packageJson.version || '1.0.0';
      
      console.log(''); // Empty line for better readability
      logger.info(`🚀 TráfegoDNS v${version}`);
      
      // Display operation mode
      const operationMode = this.config.operationMode || 'traefik';
      logger.info(`🔄 Operation Mode: ${operationMode.toUpperCase()}`);
      console.log(''); // Empty line for spacing
      
      // DNS Provider Section
      logger.info('🌐 DNS PROVIDER');
      logger.info(`  🟢 Provider: ${this.config.dnsProvider}`);
      // Mask any sensitive tokens for security
      const maskedToken = this.config.cloudflareToken ? 'Configured' : 'Not configured';
      logger.info(`  🔑 Auth: ${maskedToken}`);
      logger.info(`  🌐 Zone: ${this.config.getProviderDomain()}`);
      console.log(''); // Empty line for spacing
      
      // Connectivity Section
      logger.info('🔄 CONNECTIVITY');
      if (operationMode.toLowerCase() === 'traefik') {
        logger.info(`  🟢 Traefik API: Connected at ${this.config.traefikApiUrl}`);
        const authStatus = this.config.traefikApiUsername ? 'Enabled' : 'Disabled';
        logger.info(`  🔐 Basic Auth: ${authStatus}`);
      } else {
        logger.info(`  🟢 Docker Labels: Direct access mode (no Traefik)`);
      }
      logger.info(`  🐳 Docker Socket: Accessible`);
      console.log(''); // Empty line for spacing
      
      // Network Section
      logger.info('📍 NETWORK');
      const ipv4 = this.config.getPublicIPSync() || 'Auto-detecting...';
      logger.info(`  🌐 IPv4: ${ipv4}`);
      const ipv6 = this.config.getPublicIPv6Sync() || 'Not detected';
      logger.info(`  🌐 IPv6: ${ipv6}`);
      const ipRefreshMin = (this.config.ipRefreshInterval / 60000).toFixed(0);
      logger.info(`  🔄 IP Refresh: Every ${ipRefreshMin} minutes`);
      console.log(''); // Empty line for spacing
      
      // DNS Defaults Section
      logger.info('⚓ DNS DEFAULTS');
      logger.info(`  📄 Record Type: ${this.config.defaultRecordType}`);
      logger.info(`  🔗 Content: ${this.config.defaultContent}`);
      logger.info(`  🛡️ Proxied: ${this.config.defaultProxied ? 'Yes' : 'No'}`);
      logger.info(`  ⏱️ TTL: ${this.config.defaultTTL} ${this.config.defaultTTL === 1 ? '(Auto)' : ''}`);
      console.log(''); // Empty line for spacing
      
      // Settings Section
      logger.info('⚙️ SETTINGS');
      logger.info(`  📊 Log Level: ${logger.levelNames[logger.level]}`);
      logger.info(`  🐳 Docker Events: ${this.config.watchDockerEvents ? 'Yes' : 'No'}`);
      logger.info(`  🧹 Cleanup Orphaned: ${this.config.cleanupOrphaned ? 'Yes' : 'No'}`);
      if (this.config.cleanupOrphaned) {
        logger.info(`  🕒 Cleanup Grace Period: ${this.config.cleanupGracePeriod} minutes`);
      }
      
      // Add preserved hostnames if available
      if (this.recordTracker && this.recordTracker.preservedHostnames) {
        if (this.recordTracker.preservedHostnames.length > 0) {
          logger.info(`  🛡️ Preserved Hostnames: ${this.recordTracker.preservedHostnames.join(', ')}`);
        } else {
          logger.info(`  🛡️ Preserved Hostnames: None`);
        }
      }

      // Add managed hostnames if available
      if (this.recordTracker && this.recordTracker.managedHostnames) {
        if (this.recordTracker.managedHostnames.length > 0) {
          const managedList = this.recordTracker.managedHostnames.map(h => h.hostname).join(', ');
          logger.info(`  📋 Managed Hostnames: ${managedList}`);
        } else {
          logger.info(`  📋 Managed Hostnames: None`);
        }
      }      
      
      console.log(''); // Empty line for spacing
      
      // Performance Section
      logger.info('⚡ PERFORMANCE');
      const cacheRefreshMin = (this.config.cacheRefreshInterval / 60000).toFixed(0);
      logger.info(`  💾 Cache TTL: ${cacheRefreshMin} minutes`);
      const pollIntervalSec = (this.config.pollInterval / 1000).toFixed(0);
      logger.info(`  🕒 Poll Interval: ${pollIntervalSec} seconds`);
      console.log(''); // Empty line for spacing
    } catch (error) {
      logger.error(`Error displaying settings: ${error.message}`);
      // Continue even if we can't display settings properly
    }
  }
}

module.exports = StatusReporter;