/**
 * src/services/EnhancedDNSManager.js
 * Enhanced DNS Manager with hot-swappable providers and state management
 */
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const RecordTracker = require('../utils/recordTracker');
const { extractDnsConfigFromLabels } = require('../utils/dns');
const DNSProviderFactory = require('../providers/factory');

class EnhancedDNSManager {
  constructor(config, eventBus, stateManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.stateManager = stateManager;
    
    // Create provider factory
    this.providerFactory = new DNSProviderFactory(config, eventBus, stateManager);
    
    // References to monitors
    this.traefikMonitor = null;
    this.directDnsManager = null;
    this.dockerMonitor = null;
    
    // Initialize record tracker
    this.recordTracker = new RecordTracker(config);
    
    // Initialize DNS provider
    this.dnsProvider = null;
    
    // Initialize statistics
    this.stats = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0,
      total: 0
    };
    
    // Make statistics available globally (for use in providers)
    global.statsCounter = this.stats;
    
    // Track active hostnames for cleanup
    this.activeHostnames = [];
    
    // Track which preserved records we've already logged to avoid spam
    this.loggedPreservedRecords = new Set();
    
    // Subscribe to events
    this.setupEventSubscriptions();
  }
  
  /**
   * Initialize the DNS Manager
   */
  async init() {
    try {
      logger.debug('Initializing Enhanced DNS Manager...');
      
      // Initialize the DNS provider
      this.dnsProvider = await this.providerFactory.createAndInitProvider(this.config.dnsProvider);
      
      // Update state manager with available providers
      if (this.stateManager) {
        const availableProviders = this.providerFactory.getAvailableProviders();
        this.stateManager.updateAvailableProviders(availableProviders);
        
        // Update record tracking in state manager
        const trackedRecords = this.recordTracker.getAllTrackedRecords();
        this.stateManager.updateTrackedRecords(trackedRecords);
        
        // Update preserved hostnames in state manager
        this.stateManager.updatePreservedHostnames(this.recordTracker.preservedHostnames || []);
        
        // Update managed hostnames in state manager
        this.stateManager.updateManagedHostnames(this.recordTracker.managedHostnames || []);
      }
      
      // Process managed hostnames during initialization
      await this.processManagedHostnames();
      
      logger.success('Enhanced DNS Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Enhanced DNS Manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to provider changes
    this.eventBus.subscribe('provider:changed', async (data) => {
      const { provider, instance } = data;
      logger.info(`Switching to ${provider} provider`);
      
      // Update the DNS provider instance
      this.dnsProvider = instance;
      
      // Refresh records from new provider
      try {
        await this.dnsProvider.refreshRecordCache();
        logger.success(`Successfully switched to ${provider} provider`);
        
        // Process managed hostnames with new provider
        await this.processManagedHostnames();
      } catch (error) {
        logger.error(`Error refreshing records after provider switch: ${error.message}`);
      }
    });
    
    // Subscribe to mode changes
    this.eventBus.subscribe('mode:switched', async (data) => {
      const { mode } = data;
      logger.info(`Switching to ${mode} operation mode`);
      
      // Refresh records next time we poll
      if (mode === 'traefik' && this.traefikMonitor) {
        this.traefikMonitor.pollTraefikAPI();
      } else if (mode === 'direct' && this.directDnsManager) {
        this.directDnsManager.pollContainers();
      }
    });
    
    // Subscribe to Traefik router updates
    this.eventBus.subscribe(EventTypes.TRAEFIK_ROUTERS_UPDATED, async (data) => {
      const { hostnames, containerLabels } = data;
      
      // Store active hostnames for cleanup
      this.activeHostnames = [...hostnames];
      
      // Process hostnames
      await this.processHostnames(hostnames, containerLabels);
    });
  }
  
  /**
   * Get active hostnames for cleanup
   * @returns {Array} List of active hostnames
   */
  getActiveHostnames() {
    return this.activeHostnames;
  }
  
  /**
   * Process a list of hostnames and ensure DNS records exist
   * @param {Array<string>} hostnames - List of hostnames to process
   * @param {Object} containerLabels - Map of container IDs to their labels
   */
  async processHostnames(hostnames, containerLabels) {
    try {
      logger.debug(`Enhanced DNS Manager processing ${hostnames.length} hostnames`);
      
      // Reset statistics for this processing run
      this.resetStats();
      
      // Track processed hostnames for cleanup
      const processedHostnames = [];
      
      // Collect all DNS record configurations to batch process
      const dnsRecordConfigs = [];
      
      // Process each hostname
      for (const hostname of hostnames) {
        try {
          this.stats.total++;
          
          // Find container labels for this hostname if possible
          const labels = containerLabels[hostname] || {};
          
          // Get label prefixes for easier reference
          const genericLabelPrefix = this.config.genericLabelPrefix;
          const providerLabelPrefix = this.config.dnsLabelPrefix;
          
          // Check if we should manage DNS based on global setting and labels
          // First check generic labels
          let manageLabel = labels[`${genericLabelPrefix}manage`];
          let skipLabel = labels[`${genericLabelPrefix}skip`];
          
          // Then check provider-specific labels which take precedence
          if (labels[`${providerLabelPrefix}manage`] !== undefined) {
            manageLabel = labels[`${providerLabelPrefix}manage`];
            logger.debug(`Found provider-specific manage label: ${providerLabelPrefix}manage=${manageLabel}`);
          }
          
          if (labels[`${providerLabelPrefix}skip`] !== undefined) {
            skipLabel = labels[`${providerLabelPrefix}skip`];
            logger.debug(`Found provider-specific skip label: ${providerLabelPrefix}skip=${skipLabel}`);
          }
          
          // Determine whether to manage this hostname's DNS
          let shouldManage = this.config.defaultManage;
          
          // If global setting is false (opt-in), check for explicit manage=true
          if (!shouldManage && manageLabel === 'true') {
            shouldManage = true;
            logger.debug(`Enabling DNS management for ${hostname} due to manage=true label`);
          }
          
          // Skip label always overrides (for backward compatibility)
          if (skipLabel === 'true') {
            shouldManage = false;
            logger.debug(`Skipping DNS management for ${hostname} due to skip=true label`);
          }
          
          // Skip to next hostname if we shouldn't manage this one
          if (!shouldManage) {
            continue;
          }
          
          // Create fully qualified domain name
          const fqdn = this.ensureFqdn(hostname, this.config.getProviderDomain());
          processedHostnames.push(fqdn);
          
          // Extract DNS configuration
          const recordConfig = extractDnsConfigFromLabels(
            labels, 
            this.config,
            fqdn
          );
          
          // Add to batch instead of processing immediately
          dnsRecordConfigs.push(recordConfig);
          
        } catch (error) {
          this.stats.errors++;
          logger.error(`Error processing hostname ${hostname}: ${error.message}`);
        }
      }
      
      // Batch process all DNS records
      if (dnsRecordConfigs.length > 0) {
        logger.debug(`Batch processing ${dnsRecordConfigs.length} DNS record configurations`);
        const processedRecords = await this.dnsProvider.batchEnsureRecords(dnsRecordConfigs);
        
        // Track all created/updated records
        if (processedRecords && processedRecords.length > 0) {
          for (const record of processedRecords) {
            // Only track records that have an ID (successfully created/updated)
            if (record && record.id) {
              // Check if this is a new record or just an update
              const isTracked = this.recordTracker.isTracked(record);
              
              if (isTracked) {
                // Update the tracked record with the latest ID
                this.recordTracker.updateRecordId(record, record);
              } else {
                // Track new record
                this.recordTracker.trackRecord(record);
              }
            }
          }
          
          // Update tracked records in state manager
          if (this.stateManager) {
            const trackedRecords = this.recordTracker.getAllTrackedRecords();
            this.stateManager.updateTrackedRecords(trackedRecords);
          }
        }
      }
      
      // Log summary stats if we have records
      this.logStats();
      
      // Cleanup orphaned records if configured
      if (this.config.cleanupOrphaned && processedHostnames.length > 0) {
        await this.cleanupOrphanedRecords(processedHostnames);
      }
      
      // Publish event with results
      this.eventBus.publish(EventTypes.DNS_RECORDS_UPDATED, {
        stats: this.stats,
        processedHostnames
      });
      
      return {
        stats: this.stats,
        processedHostnames
      };
    } catch (error) {
      logger.error(`Error processing hostnames: ${error.message}`);
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'EnhancedDNSManager.processHostnames',
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Reset statistics counters
   */
  resetStats() {
    this.stats = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0,
      total: 0
    };
    
    // Update global stats reference
    global.statsCounter = this.stats;
  }
  
  /**
   * Reset logged preserved records tracking
   */
  resetLoggedPreservedRecords() {
    this.loggedPreservedRecords = new Set();
    logger.debug('Reset preserved records logging cache');
  }
  
  /**
   * Log statistics about processed DNS records
   */
  logStats() {
    if (this.stats.total > 0) {
      if (this.stats.created > 0) {
        logger.success(`Created ${this.stats.created} new DNS records`);
        
        // Publish event for each creation (for metrics/monitoring)
        this.eventBus.publish(EventTypes.DNS_RECORD_CREATED, {
          count: this.stats.created
        });
      }
      
      if (this.stats.updated > 0) {
        logger.success(`Updated ${this.stats.updated} existing DNS records`);
        
        // Publish event for each update
        this.eventBus.publish(EventTypes.DNS_RECORD_UPDATED, {
          count: this.stats.updated
        });
      }
      
      if (this.stats.upToDate > 0) {
        logger.info(`${this.stats.upToDate} DNS records are up to date`);
      }
      
      if (this.stats.errors > 0) {
        logger.warn(`Encountered ${this.stats.errors} errors processing DNS records`);
      }
    }
  }
  
  /**
   * Ensure a hostname is a fully qualified domain name
   */
  ensureFqdn(hostname, zone) {
    if (hostname.includes('.')) {
      return hostname;
    }
    return `${hostname}.${zone}`;
  }
  
  /**
   * Clean up orphaned DNS records
   */
  async cleanupOrphanedRecords(activeHostnames) {
    try {
      logger.debug('Checking for orphaned DNS records...');
      
      // Get all DNS records for our zone (from cache when possible)
      const allRecords = await this.dnsProvider.getRecordsFromCache(true); // Force refresh
      
      // Normalize active hostnames for comparison
      const normalizedActiveHostnames = new Set(activeHostnames.map(host => host.toLowerCase()));
      
      // Log all active hostnames in trace mode
      logger.trace(`Active hostnames: ${Array.from(normalizedActiveHostnames).join(', ')}`);
      
      // Find records that were created by this tool but no longer exist in Traefik
      const orphanedRecords = [];
      const domainSuffix = `.${this.config.getProviderDomain()}`;
      const domainName = this.config.getProviderDomain().toLowerCase();
      
      for (const record of allRecords) {
        // Skip apex domain/root records
        if (record.name === '@' || record.name === this.config.getProviderDomain()) {
          logger.debug(`Skipping apex record: ${record.name}`);
          continue;
        }
        
        // Skip records that aren't a subdomain of our managed domain
        if (record.type === 'NS' || record.type === 'SOA' || record.type === 'CAA') {
          logger.debug(`Skipping system record: ${record.name} (${record.type})`);
          continue;
        }
        
        // Check if this record is tracked by our tool
        if (!this.recordTracker.isTracked(record)) {
          // Support legacy records with comment for backward compatibility
          if (this.config.dnsProvider === 'cloudflare' && 
              (record.comment === 'Managed by Traefik DNS Manager' || 
               record.comment === 'Managed by TráfegoDNS')) {
            // This is a legacy record created before we implemented tracking
            logger.debug(`Found legacy managed record with comment: ${record.name} (${record.type})`);
            this.recordTracker.trackRecord(record);
          } else {
            // Not tracked and not a legacy record - skip it
            logger.debug(`Skipping non-managed record: ${record.name} (${record.type})`);
            continue;
          }
        }
        
        // Reconstruct the FQDN from record name format
        let recordFqdn;
        if (record.name === '@') {
          recordFqdn = domainName;
        } else {
          // Check if the record name already contains the domain
          const recordName = record.name.toLowerCase();
          if (recordName.endsWith(domainName)) {
            // Already has domain name, use as is
            recordFqdn = recordName;
          } else {
            // Need to append domain
            recordFqdn = `${recordName}${domainSuffix}`;
          }
        }
        
        // Check for domain duplication (e.g., example.com.example.com)
        const doublePattern = new RegExp(`${domainName}\\.${domainName}$`, 'i');
        if (doublePattern.test(recordFqdn)) {
          // Remove the duplicated domain part
          recordFqdn = recordFqdn.replace(doublePattern, domainName);
          logger.debug(`Fixed duplicated domain in record: ${recordFqdn}`);
        }
        
        // Log each record for debugging
        logger.debug(`Checking record FQDN: ${recordFqdn} (${record.type})`);
        
        // Check if this record should be preserved
        if (this.recordTracker.shouldPreserveHostname(recordFqdn)) {
          // Create a unique key for this record for tracking log messages
          const recordKey = `${recordFqdn}-${record.type}-preserved`;
          
          // If we haven't logged this record yet, log at INFO level
          if (!this.loggedPreservedRecords.has(recordKey)) {
            logger.info(`Preserving DNS record (in preserved list): ${recordFqdn} (${record.type})`);
            this.loggedPreservedRecords.add(recordKey);
          } else {
            // We've already logged this one, use DEBUG level to avoid spam
            logger.debug(`Preserving DNS record (in preserved list): ${recordFqdn} (${record.type})`);
          }
          
          continue;
        }
        
        // Also check if this record is in the managed hostnames list
        if (this.recordTracker.managedHostnames && 
            this.recordTracker.managedHostnames.some(h => h.hostname.toLowerCase() === recordFqdn.toLowerCase())) {
          // Create a unique key for this record for tracking log messages
          const recordKey = `${recordFqdn}-${record.type}-managed`;
          
          // If we haven't logged this record yet, log at INFO level
          if (!this.loggedPreservedRecords.has(recordKey)) {
            logger.info(`Preserving DNS record (in managed list): ${recordFqdn} (${record.type})`);
            this.loggedPreservedRecords.add(recordKey);
          } else {
            // We've already logged this one, use DEBUG level to avoid spam
            logger.debug(`Preserving DNS record (in managed list): ${recordFqdn} (${record.type})`);
          }
          
          continue;
        }
        
        // Check if this record is still active
        if (!normalizedActiveHostnames.has(recordFqdn)) {
          logger.debug(`Found orphaned record: ${recordFqdn} (${record.type})`);
          orphanedRecords.push({
            ...record,
            displayName: recordFqdn // Save the normalized display name
          });
        }
      }
      
      // Delete orphaned records
      if (orphanedRecords.length > 0) {
        logger.info(`Found ${orphanedRecords.length} orphaned DNS records to clean up`);
        
        for (const record of orphanedRecords) {
          // Use the saved display name for logging
          const displayName = record.displayName || 
                             (record.name === '@' ? this.config.getProviderDomain() 
                                                 : `${record.name}.${this.config.getProviderDomain()}`);
                             
          logger.info(`🗑️ Removing orphaned DNS record: ${displayName} (${record.type})`);
          
          try {
            await this.dnsProvider.deleteRecord(record.id);
            
            // Remove record from tracker
            this.recordTracker.untrackRecord(record);
            
            // Update tracked records in state manager
            if (this.stateManager) {
              const trackedRecords = this.recordTracker.getAllTrackedRecords();
              this.stateManager.updateTrackedRecords(trackedRecords);
            }
            
            // Publish delete event
            this.eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
              name: displayName,
              type: record.type
            });
          } catch (error) {
            logger.error(`Error deleting orphaned record ${displayName}: ${error.message}`);
          }
        }
        
        logger.success(`Removed ${orphanedRecords.length} orphaned DNS records`);
      } else {
        logger.debug('No orphaned DNS records found');
      }
      
      // Reset the logged records cache daily to ensure important changes are logged
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        this.resetLoggedPreservedRecords();
      }
    } catch (error) {
      logger.error(`Error cleaning up orphaned records: ${error.message}`);
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'EnhancedDNSManager.cleanupOrphanedRecords',
        error: error.message
      });
    }
  }
  
  /**
   * Process managed hostnames and ensure they exist
   */
  async processManagedHostnames() {
    if (!this.recordTracker.managedHostnames || this.recordTracker.managedHostnames.length === 0) {
      logger.debug('No managed hostnames to process');
      return;
    }
    
    logger.info(`Processing ${this.recordTracker.managedHostnames.length} manually managed hostnames`);
    
    // Collect DNS record configurations
    const dnsRecordConfigs = [];
    
    // Process each managed hostname
    for (const config of this.recordTracker.managedHostnames) {
      try {
        // Create a record configuration
        const recordConfig = {
          type: config.type,
          name: config.hostname,
          content: config.content,
          ttl: config.ttl
        };
        
        // Add proxied flag for Cloudflare
        if (this.config.dnsProvider === 'cloudflare' && ['A', 'AAAA', 'CNAME'].includes(config.type)) {
          recordConfig.proxied = config.proxied;
        }
        
        // Add to batch process list
        dnsRecordConfigs.push(recordConfig);
        
        logger.debug(`Added managed hostname to processing: ${config.hostname} (${config.type})`);
      } catch (error) {
        logger.error(`Error processing managed hostname ${config.hostname}: ${error.message}`);
      }
    }
    
    // Batch process all DNS records
    if (dnsRecordConfigs.length > 0) {
      logger.debug(`Batch processing ${dnsRecordConfigs.length} managed DNS records`);
      
      try {
        const processedRecords = await this.dnsProvider.batchEnsureRecords(dnsRecordConfigs);
        
        // Track created/updated records
        if (processedRecords && processedRecords.length > 0) {
          for (const record of processedRecords) {
            // Only track records that have an ID (successfully created/updated)
            if (record && record.id) {
              // Check if this is a new record or just an update
              const isTracked = this.recordTracker.isTracked(record);
              
              if (isTracked) {
                // Update the tracked record with the latest ID
                this.recordTracker.updateRecordId(record, record);
              } else {
                // Track new record
                this.recordTracker.trackRecord(record);
              }
            }
          }
          
          // Update tracked records in state manager
          if (this.stateManager) {
            const trackedRecords = this.recordTracker.getAllTrackedRecords();
            this.stateManager.updateTrackedRecords(trackedRecords);
          }
        }
        
        logger.success(`Successfully processed ${processedRecords.length} managed hostnames`);
      } catch (error) {
        logger.error(`Error batch processing managed hostnames: ${error.message}`);
      }
    }
  }
  
  /**
   * Switch to a different DNS provider
   * @param {string} provider - The provider name to switch to
   */
  async switchProvider(provider) {
    try {
      // Reset log cache when switching providers
      this.resetLoggedPreservedRecords();
      
      // Switch provider using the factory
      this.dnsProvider = await this.providerFactory.switchProvider(provider);
      logger.success(`Switched to ${provider} provider`);
      
      // Process managed hostnames with the new provider
      await this.processManagedHostnames();
      
      return true;
    } catch (error) {
      logger.error(`Failed to switch to ${provider} provider: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update DNS provider configuration
   * @param {string} provider - The provider name
   * @param {Object} config - Provider configuration
   */
  updateProviderConfig(provider, config) {
    // Reset log cache when changing provider config
    this.resetLoggedPreservedRecords();
    
    // Update the state
    if (this.stateManager) {
      this.stateManager.updateProviderConfig(provider, config);
    }
    
    // If this is the current provider, update and reinitialize
    if (provider === this.config.dnsProvider) {
      // Update config based on provider type
      this.updateConfigForProvider(provider, config);
      
      // Clear provider cache to force recreation on next access
      this.providerFactory.clearProviderCache();
      
      // Reinitialize provider
      this.dnsProvider = null; // Force recreation
      this.providerFactory.createAndInitProvider(provider)
        .then(provider => {
          this.dnsProvider = provider;
          logger.success(`Reinitialized ${provider} provider with new configuration`);
          return this.processManagedHostnames();
        })
        .catch(error => {
          logger.error(`Failed to reinitialize ${provider} provider: ${error.message}`);
        });
    }
  }
  
  /**
   * Update configuration for a specific provider
   * @param {string} provider - Provider name
   * @param {Object} providerConfig - Provider configuration
   */
  updateConfigForProvider(provider, providerConfig) {
    // Update the relevant config properties based on provider type
    switch (provider) {
      case 'cloudflare':
        this.config.cloudflareToken = providerConfig.token;
        this.config.cloudflareZone = providerConfig.zone;
        break;
      case 'digitalocean':
        this.config.digitalOceanToken = providerConfig.token;
        this.config.digitalOceanDomain = providerConfig.domain;
        break;
      case 'route53':
        this.config.route53AccessKey = providerConfig.accessKey;
        this.config.route53SecretKey = providerConfig.secretKey;
        this.config.route53Zone = providerConfig.zone;
        this.config.route53ZoneId = providerConfig.zoneId;
        this.config.route53Region = providerConfig.region || 'eu-west-2';
        break;
    }
  }
}

module.exports = EnhancedDNSManager;