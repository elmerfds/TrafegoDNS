/**
 * DNS Manager Service
 * Responsible for managing DNS records through the selected provider
 */
const { DNSProviderFactory } = require('../providers');
const logger = require('../utils/logger');
const EventTypes = require('../events/EventTypes');
const { extractDnsConfigFromLabels } = require('../utils/dns');
const RecordTracker = require('../utils/recordTracker');

// Static property to track recently deleted hostnames across all instances
class DNSManager {
  static recentlyDeletedHostnames = new Set();
  // Track cleanup operations with container context
  static recentCleanupOperations = new Map();
  // Track which hostname sets have been reported
  static reportedCleanupSets = new Map();
  
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsProvider = DNSProviderFactory.createProvider(config);
    
    // Initialise record tracker
    this.recordTracker = new RecordTracker(config);
    
    // Track which preserved records we've already logged to avoid spam
    this.loggedPreservedRecords = new Set();
    
    // Initialise counters for statistics
    this.stats = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0,
      total: 0
    };
    
    // Track previous poll statistics to reduce logging noise
    this.previousStats = {
      upToDateCount: 0
    };
    
    // Subscribe to relevant events
    this.setupEventSubscriptions();
  }
  
  /**
   * Initialise the DNS Manager
   */
  async init() {
    try {
      logger.debug('Initializing DNS Manager...');
      await this.dnsProvider.init();
      
      // Process managed hostnames during initialization
      await this.processManagedHostnames();
      
      logger.success('DNS Manager initialised successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialise DNS Manager: ${error.message}`);
      throw error;
    }
  }
  /**
   * Set up event subscriptions
   */
  setupEventSubscriptions() {
    // Subscribe to Traefik router updates
    this.eventBus.subscribe(EventTypes.TRAEFIK_ROUTERS_UPDATED, async (data) => {
      const { hostnames, containerLabels, containerRemoved = false } = data;
      // Always log at debug level, especially for container removal events
      if (containerRemoved) {
        logger.debug(`Received TRAEFIK_ROUTERS_UPDATED event for container removal`);
      } else {
        logger.debug(`Received TRAEFIK_ROUTERS_UPDATED event`);
      }
      await this.processHostnames(hostnames, containerLabels, containerRemoved);
    });
    
    // Track recently cleaned up containers to prevent duplicate cleanups
    this.recentlyCleanedContainers = new Set();
    
    // Direct subscription to container stop events for more reliable cleanup
    this.eventBus.subscribe(EventTypes.DOCKER_CONTAINER_STOPPED, async (data) => {
      const { containerName, status, containerRemoved = true } = data;
      
      // Skip if not using CloudFlare Zero Trust provider
      if (this.config.dnsProvider !== 'cfzerotrust') {
        logger.debug('Not using CloudFlare Zero Trust provider, skipping direct cleanup');
        return;
      }
      
      // Check if we've already processed this container recently to avoid duplicate cleanups
      const containerKey = `${containerName}:${status}:${Date.now()}`;
      if (this.recentlyCleanedContainers.has(containerName)) {
        logger.debug(`Skipping duplicate cleanup for recently processed container: ${containerName}`);
        return;
      }
      
      // Add to recently cleaned set with 10-second expiry
      this.recentlyCleanedContainers.add(containerName);
      setTimeout(() => {
        this.recentlyCleanedContainers.delete(containerName);
      }, 10000);
      
      logger.debug(`DNSManager: Processing container stop event for ${containerName} with status=${status}`);
      
      // Wait a moment for Traefik to update its routers
      setTimeout(async () => {
        logger.debug(`DNSManager: Executing delayed cleanup for stopped container ${containerName}`);
        
        try {
          // Get current hostnames from Traefik via the last event
          const lastEvent = this.eventBus.getLastEvent(EventTypes.TRAEFIK_ROUTERS_UPDATED);
          const hostnames = lastEvent?.data?.hostnames || [];
          
          // Force cleanup regardless of config setting
          logger.debug(`Forcing cleanup for stopped container ${containerName}`);
          await this.cleanupOrphanedRecords(hostnames);
        } catch (error) {
          logger.error(`Error in delayed cleanup for container ${containerName}: ${error.message}`);
        }
      }, 5000); // Wait 5 seconds, slightly longer than TraefikMonitor's 3 seconds
    });
  }
  
  /**
   * Process a list of hostnames and ensure DNS records exist
   * @param {Array<string>} hostnames - List of hostnames to process
   * @param {Object} containerLabels - Map of container IDs to their labels
   */
  async processHostnames(hostnames, containerLabels, containerRemoved = false) {
    try {
      // Always log at debug level
      // Track if there are any changes to report
      const hasChanges = this.previousStats.hostnameCount !== hostnames.length;
      
      // Only log at INFO level if there are changes, otherwise use DEBUG
      if (containerRemoved) {
        logger.debug(`DNS Manager processing ${hostnames.length} hostnames for container removal`);
      } else if (hasChanges) {
        logger.info(`DNS Manager processing ${hostnames.length} hostnames for DNS management`);
      } else {
        logger.debug(`DNS Manager processing ${hostnames.length} hostnames for DNS management (no changes)`);
      }
      
      // Update previous count for next comparison
      this.previousStats.hostnameCount = hostnames.length;
      
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
        
        // Setup global counter for provider to update
        global.statsCounter = { created: 0, updated: 0, upToDate: 0, errors: 0 };
        
        const results = await this.dnsProvider.batchEnsureRecords(dnsRecordConfigs);
        
        // Update stats from global counter
        if (global.statsCounter) {
          this.stats.created += global.statsCounter.created || 0;
          this.stats.updated += global.statsCounter.updated || 0;
          this.stats.upToDate += global.statsCounter.upToDate || 0;
          this.stats.errors += global.statsCounter.errors || 0;
          
          // Clean up global counter
          global.statsCounter = null;
        }
        
        // Track all created/updated records
        if (results && results.length > 0) {
          logger.debug(`Processing ${results.length} results for tracking`);
          for (const record of results) {
            // Only track records that have an ID (successfully created/updated)
            if (record && record.id) {
              logger.debug(`Tracking record: ${record.name} (ID: ${record.id})`);
              
              // Check if this is a new record or just an update
              const isTracked = this.recordTracker.isTracked(record);
              
              if (isTracked) {
                // Update the tracked record with the latest ID
                logger.debug(`Updating existing tracked record: ${record.name}`);
                this.recordTracker.updateRecordId(record, record);
              } else {
                // Track new record
                logger.debug(`Tracking new record: ${record.name}`);
                this.recordTracker.trackRecord(record);
              }
            } else {
              logger.debug(`Skipping tracking for record without ID: ${record?.name || 'unknown'}`);
            }
          }
        }
        
        // Persist tunnel hostname tracking if needed
        if (this.config.dnsProvider === 'cfzerotrust' && results && results.length > 0) {
          logger.debug(`Persisting ${results.length} tunnel hostnames for tracking`);
          this.persistTunnelHostnameTracking(results);
        }
      }
      
      // Log summary stats if we have records
      this.logStats();
      
      // Cleanup orphaned records if configured or if a container was removed
      logger.debug(`Cleanup condition: cleanupOrphaned=${this.config.cleanupOrphaned}, containerRemoved=${containerRemoved}, processedHostnames.length=${processedHostnames.length}`);
      // Always run cleanup if containerRemoved is true, regardless of processedHostnames.length
      if (this.config.cleanupOrphaned || containerRemoved) {
        // Track if we've found any orphaned records to clean up
        let foundOrphaned = false;
        
        // For cfzerotrust provider, we need to check if there are orphaned tunnel hostnames
        if (this.config.dnsProvider === 'cfzerotrust') {
          try {
            // Get current hostnames from the tunnel
            const tunnelId = this.config.cfzerotrustTunnelId;
            const tunnelHostnames = await this.dnsProvider.getTunnelHostnames(tunnelId);
            
            // Get all active hostnames that should be preserved
            const normalizedActiveHostnames = new Set(activeHostnames.map(host => host.toLowerCase()));
            
            // Check if there are any orphaned hostnames
            for (const record of tunnelHostnames) {
              const hostname = record.name;
              const isActive = normalizedActiveHostnames.has(hostname.toLowerCase());
              const shouldPreserve = this.recordTracker.shouldPreserveHostname(hostname);
              
              if (!isActive && !shouldPreserve) {
                foundOrphaned = true;
                break;
              }
            }
          } catch (error) {
            logger.debug(`Error checking for orphaned tunnel hostnames: ${error.message}`);
          }
        }
        
        // Only log at DEBUG level to reduce noise
        if (containerRemoved) {
          logger.debug(`Cleaning up orphaned records due to container removal`);
        } else if (foundOrphaned) {
          logger.debug(`Cleaning up orphaned records`);
        } else {
          logger.debug(`Checking for orphaned records`);
        }
        await this.cleanupOrphanedRecords(processedHostnames);
      } else {
        logger.debug(`Skipping cleanup: cleanupOrphaned=${this.config.cleanupOrphaned}, containerRemoved=${containerRemoved}, processedHostnames.length=${processedHostnames.length}`);
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
        source: 'DNSManager.processHostnames',
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
  }
  
  /**
   * Reset logged preserved records tracking
   */
  resetLoggedPreservedRecords() {
    this.loggedPreservedRecords = new Set();
  }
  
  /**
   * Log statistics about processed DNS records
   */
  logStats() {
    if (this.stats.total > 0) {
      if (this.stats.created > 0) {
        logger.debug(`Created ${this.stats.created} new DNS records`);
        
        // Publish event for each creation (for metrics/monitoring)
        this.eventBus.publish(EventTypes.DNS_RECORD_CREATED, {
          count: this.stats.created
        });
      }
      
      if (this.stats.updated > 0) {
        logger.debug(`Updated ${this.stats.updated} existing DNS records`);
        
        // Publish event for each update
        this.eventBus.publish(EventTypes.DNS_RECORD_UPDATED, {
          count: this.stats.updated
        });
      }
      
      // Only log "up to date" records if the count has changed
      if (this.stats.upToDate > 0) {
        const hasUpToDateChanged = this.previousStats.upToDateCount !== this.stats.upToDate;
        
        if (hasUpToDateChanged) {
          logger.info(`${this.stats.upToDate} DNS records are up to date`);
        } else {
          // Log at debug level instead of info when nothing has changed
          logger.debug(`${this.stats.upToDate} DNS records are up to date`);
        }
        
        // Update for next comparison
        this.previousStats.upToDateCount = this.stats.upToDate;
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
   * Process results from provider operations and persist tracking
   * This is primarily used for cfzerotrust provider but the method
   * is designed to be safe for all providers
   * @param {Array} results - Results from provider operations
   */
  persistTunnelHostnameTracking(results) {
    // Only process for cfzerotrust provider
    if (this.config.dnsProvider !== 'cfzerotrust') {
      return;
    }
    
    // Skip if no results
    if (!results || !Array.isArray(results) || results.length === 0) {
      return;
    }
    
    logger.debug(`Persisting tracking for ${results.length} tunnel hostnames`);
    
    // Process each record and persist tracking
    for (const record of results) {
      if (record && record.name) {
        // Check if the provider has the trackCreatedHostname method
        if (typeof this.dnsProvider.trackCreatedHostname === 'function') {
          this.dnsProvider.trackCreatedHostname(record.name, record, this.recordTracker);
        }
      }
    }
  }
  
  /**
   * Clean up orphaned DNS records
   */
  async cleanupOrphanedRecords(activeHostnames) {
    // Generate unique context for this cleanup operation
    const cleanupId = `cleanup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Check if we're already running a cleanup within the last 3 seconds
    const now = Date.now();
    if (this.lastCleanupTime && (now - this.lastCleanupTime < 3000)) {
      logger.debug(`Skipping duplicate cleanup run (previous run ${now - this.lastCleanupTime}ms ago)`);
      return;
    }
    
    // Set last cleanup time
    this.lastCleanupTime = now;
    
    // Make sure activeHostnames is always an array
    activeHostnames = Array.isArray(activeHostnames) ? activeHostnames : [];
    try {
      logger.trace(`Cleaning up orphaned records with ${activeHostnames.length} active hostnames`);
      logger.debug(`Active hostnames: ${activeHostnames.join(', ')}`);
      logger.debug(`Cleanup orphaned setting: ${this.config.cleanupOrphaned}`);
      // Special handling for CloudFlare Zero Trust provider
      if (this.config.dnsProvider === 'cfzerotrust') {
        logger.debug('CloudFlare Zero Trust provider detected - running tunnel hostname cleanup');
        
        try {
          logger.debug('Checking for orphaned CloudFlare Zero Trust tunnel hostnames...');
          
          
          // Get current hostnames directly from the tunnel API instead of relying solely on tracking
          const tunnelId = this.config.cfzerotrustTunnelId;
          logger.debug(`Getting current hostnames from tunnel ${tunnelId}...`);
          const tunnelHostnames = await this.dnsProvider.getTunnelHostnames(tunnelId);
          logger.debug(`Found ${tunnelHostnames.length} hostnames in tunnel ${tunnelId}`);
          
          // Get all active hostnames that should be preserved
          const normalizedActiveHostnames = new Set(activeHostnames.map(host => host.toLowerCase()));
          logger.debug(`Normalized ${normalizedActiveHostnames.size} active hostnames for comparison`);
          
          // Find orphaned tunnel hostnames
          let orphanedTunnelHostnames = [];
          
          // Check each tunnel hostname
          for (const record of tunnelHostnames) {
            const hostname = record.name;
            const isActive = normalizedActiveHostnames.has(hostname.toLowerCase());
            const shouldPreserve = this.recordTracker.shouldPreserveHostname(hostname);
            
            logger.debug(`Checking ${hostname}: active=${isActive}, preserved=${shouldPreserve}`);
            
            // Skip if hostname is in active list or should be preserved
            if (isActive || shouldPreserve) {
              continue;
            }
            
            // Skip if hostname is in manually managed hostnames
            const isManaged = this.recordTracker.managedHostnames && 
                             this.recordTracker.managedHostnames.some(h => 
                               h.hostname.toLowerCase() === hostname.toLowerCase());
            
            if (isManaged) {
              logger.debug(`Skipping managed hostname: ${hostname}`);
              continue;
            }
            
            // Check if this hostname has already been processed recently
            if (DNSManager.recentlyDeletedHostnames.has(hostname)) {
              logger.debug(`Skipping recently processed hostname: ${hostname}`);
              continue;
            }
            
            // This is an orphaned hostname - log at debug level to reduce noise
            logger.debug(`Found orphaned tunnel hostname: ${hostname} (tunnel: ${record.tunnelId}, id: ${record.id})`);
            orphanedTunnelHostnames.push({
              hostname,
              info: {
                tunnelId: record.tunnelId,
                id: record.id
              }
            });
          }
          
          // Delete orphaned tunnel hostnames
          if (orphanedTunnelHostnames.length > 0) {
            // Only log once at the beginning of the cleanup process
            logger.debug(`Found ${orphanedTunnelHostnames.length} orphaned tunnel hostnames to clean up`);
            
            // Track successful deletions for summary
            let successfulDeletions = 0;
            
            for (const { hostname, info } of orphanedTunnelHostnames) {
              // Only log at DEBUG level for the preparation
              logger.debug(`Preparing to remove orphaned tunnel hostname: ${hostname} (tunnel: ${info.tunnelId}, id: ${info.id})`);
              
              try {
                // Add additional logging to track the delete operation
                logger.debug(`Calling deleteRecord for ${hostname} with ID ${info.id}`);
                try {
                  await this.deleteOrphanedRecord({
                    id: info.id,
                    name: hostname,
                    tunnelId: info.tunnelId
                  });
                } catch (error) {
                  logger.error(`Error initiating delete for ${hostname}: ${error.message}`);
                }
                
                successfulDeletions++;
                
                // Add to recently deleted set with 10-second expiry
                DNSManager.recentlyDeletedHostnames.add(hostname);
                setTimeout(() => {
                  DNSManager.recentlyDeletedHostnames.delete(hostname);
                  logger.debug(`Removed ${hostname} from recently deleted tracking`);
                }, 10000);
              } catch (error) {
                logger.error(`Error initiating delete for ${hostname}: ${error.message}`);
              }
            }
            
            // Only log this message once at the end of the cleanup process
            if (successfulDeletions > 0) {
              // Create a list of the hostnames that were deleted
              const deletedHostnames = orphanedTunnelHostnames
                .filter(item => item.hostname)
                .map(item => item.hostname)
                .slice(0, successfulDeletions); // Only include ones that were successfully deleted
              
              // Create a unique key based on the sorted hostnames
              const hostnamesKey = deletedHostnames.sort().join(',');
              const now = Date.now();
              
              // Only log if we haven't reported this exact set of hostnames recently
              if (!DNSManager.reportedCleanupSets.has(hostnamesKey) || 
                  (now - DNSManager.reportedCleanupSets.get(hostnamesKey)) > 5000) {
                  
                // Include hostname in message for single deletions
                let message = '';
                if (successfulDeletions === 1) {
                  message = `Removed 1 orphaned tunnel hostname: ${deletedHostnames[0]}`;
                } else {
                  // For multiple, show count and first couple of examples
                  const displayNames = deletedHostnames.slice(0, 2);
                  const remainingCount = successfulDeletions - displayNames.length;
                  
                  message = `Removed ${successfulDeletions} orphaned tunnel hostnames: ${displayNames.join(', ')}`;
                  if (remainingCount > 0) {
                    message += ` and ${remainingCount} more`;
                  }
                }
                
                // Log the success message at INFO level only for the first time we see this set of hostnames
                // or if it's been more than 30 seconds since we last reported it
                const lastReported = DNSManager.reportedCleanupSets.get(hostnamesKey) || 0;
                const timeSinceLastReport = now - lastReported;
                
                if (lastReported === 0 || timeSinceLastReport > 30000) {
                  // First time seeing this set or it's been more than 30 seconds
                  logger.success(message);
                } else {
                  // We've seen this set recently, log at debug level
                  logger.debug(message);
                }
                
                // Mark these hostnames as reported
                DNSManager.reportedCleanupSets.set(hostnamesKey, now);
                
                // Clean up old entries after 10 seconds
                setTimeout(() => {
                  DNSManager.reportedCleanupSets.delete(hostnamesKey);
                }, 10000);
              } else {
                logger.debug(`Skipping duplicate cleanup report for: ${hostnamesKey}`);
              }
            }
          } else {
            logger.debug('No orphaned tunnel hostnames found');
          }
        } catch (error) {
          logger.error(`Error cleaning up orphaned tunnel hostnames: ${error.message}`);
        }
        
        return; // Skip the regular DNS cleanup for this provider
      }
      
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
          const recordKey = `${recordFqdn}-${record.type}`;
          
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
        if (!normalizedActiveHostnames.has(recordFqdn.toLowerCase())) {
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
            await this.deleteOrphanedRecord(record);
          } catch (error) {
            logger.error(`Error deleting orphaned record ${displayName}: ${error.message}`);
          }
        }
        
        logger.success(`Removed ${orphanedRecords.length} orphaned DNS records`);
      } else {
        logger.debug('No orphaned DNS records found');
      }
    } catch (error) {
      logger.error(`Error cleaning up orphaned records: ${error.message}`);
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DNSManager.cleanupOrphanedRecords',
        error: error.message
      });
    }
  }
  
  /**
   * Force cleanup of a specific tunnel hostname
   * @param {string} hostname - The hostname to clean up
   */
  async forceTunnelCleanup(hostname) {
    if (this.config.dnsProvider !== 'cfzerotrust') {
      logger.info('This method only works with cfzerotrust provider');
      return;
    }
    
    logger.info(`Force cleaning tunnel hostname: ${hostname}`);
    
    try {
      // Check in recordTracker first
      const allTrackedRecords = this.recordTracker.getAllTrackedRecords();
      const trackedRecord = allTrackedRecords.find(r => 
        r.provider === 'cfzerotrust' && r.name === hostname
      );
      
      if (trackedRecord) {
        logger.info(`Found in recordTracker: ${hostname} (ID: ${trackedRecord.id})`);
        
        try {
          // Use deleteOrphanedRecord instead of direct API call
          await this.deleteOrphanedRecord(trackedRecord);
          logger.info(`Deleted record from CloudFlare: ${hostname}`);
        } catch (error) {
          logger.error(`Failed to delete record from CloudFlare: ${error.message}`);
        }
      } else {
        logger.info(`Not found in recordTracker: ${hostname}`);
      }
      
      // Check in-memory tracking
      if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
        const info = global.tunnelHostnames.get(hostname);
        logger.info(`Found in memory tracking: ${hostname} (ID: ${info.id})`);
        
        // Delete if not already deleted and different from tracked record
        if (!trackedRecord || trackedRecord.id !== info.id) {
          try {
            // Use deleteOrphanedRecord instead of direct API call
            await this.deleteOrphanedRecord({
              id: info.id,
              name: hostname
            });
            logger.info(`Deleted record from CloudFlare: ${hostname}`);
          } catch (error) {
            logger.error(`Failed to delete record from CloudFlare: ${error.message}`);
          }
        }
        
        // Remove from memory tracking handled by deleteOrphanedRecord
      } else {
        logger.info(`Not found in memory tracking: ${hostname}`);
      }
      
      // Direct check against the tunnel
      try {
        const tunnelId = trackedRecord?.tunnelId || this.config.cfzerotrustTunnelId;
        logger.info(`Checking tunnel directly: ${tunnelId}`);
        
        if (typeof this.dnsProvider.getTunnelHostnames === 'function') {
          const records = await this.dnsProvider.getTunnelHostnames(tunnelId);
          const record = records.find(r => r.name === hostname);
          
          if (record) {
            logger.info(`Found directly in tunnel: ${hostname} (ID: ${record.id})`);
            // Use deleteOrphanedRecord instead of direct API call
            await this.deleteOrphanedRecord({
              id: record.id, 
              name: hostname,
              tunnelId: tunnelId
            });
            logger.info(`Deleted record directly from tunnel: ${hostname}`);
          } else {
            logger.info(`Not found directly in tunnel: ${hostname}`);
          }
        }
      } catch (error) {
        logger.error(`Error checking tunnel directly: ${error.message}`);
      }
      
      logger.info(`Force cleanup completed for: ${hostname}`);
    } catch (error) {
      logger.error(`Force cleanup failed: ${error.message}`);
    }
  }
  
  /**
   * Check for any hostnames in Traefik that aren't in active hostnames
   * This helps diagnose synchronization issues between Traefik and DNS management
   */
  async checkTraefikDnsSync() {
    try {
      // Get active hostnames from Traefik
      const traefikMonitor = global.traefikMonitor || null;
      if (!traefikMonitor || !traefikMonitor.getRouters) {
        logger.info('Cannot check sync - TraefikMonitor not available');
        return;
      }
      
      // Get current routers from Traefik
      const routers = await traefikMonitor.getRouters();
      const traefikHostnames = new Set();
      
      // Extract all hostnames from router rules
      for (const [_, router] of Object.entries(routers)) {
        if (router.rule && router.rule.includes('Host')) {
          // Extract hostnames using the helper function if available
          const extractFunction = traefikMonitor.extractHostnamesFromRule || 
              (rule => {
                const matches = [];
                let match;
                const regex = /Host\(`([^`]+)`\)/g;
                while ((match = regex.exec(rule)) !== null) {
                  matches.push(match[1]);
                }
                return matches;
              });
          
          const routerHostnames = extractFunction(router.rule);
          for (const hostname of routerHostnames) {
            traefikHostnames.add(hostname.toLowerCase());
          }
        }
      }
      
      logger.info(`Found ${traefikHostnames.size} hostnames in Traefik routers`);
      logger.debug(`Traefik hostnames: ${Array.from(traefikHostnames).join(', ')}`);
      
      // Get tracked hostnames
      const allTrackedRecords = this.recordTracker.getAllTrackedRecords();
      const cfzerotrustRecords = allTrackedRecords.filter(record => 
        record.provider === 'cfzerotrust'
      );
      
      const trackedHostnames = new Set(
        cfzerotrustRecords.map(record => record.name.toLowerCase())
      );
      
      logger.info(`Found ${trackedHostnames.size} tracked cfzerotrust hostnames`);
      logger.debug(`Tracked hostnames: ${Array.from(trackedHostnames).join(', ')}`);
      
      // Get in-memory hostnames
      const memoryHostnames = new Set();
      if (global.tunnelHostnames) {
        for (const hostname of global.tunnelHostnames.keys()) {
          memoryHostnames.add(hostname.toLowerCase());
        }
      }
      
      logger.info(`Found ${memoryHostnames.size} in-memory tracked hostnames`);
      logger.debug(`In-memory hostnames: ${Array.from(memoryHostnames).join(', ')}`);
      
      // Find hostnames in Traefik that aren't in tracked records
      const missingFromTracking = [];
      for (const hostname of traefikHostnames) {
        if (!trackedHostnames.has(hostname)) {
          missingFromTracking.push(hostname);
        }
      }
      
      // Find hostnames in tracking that aren't in Traefik
      const missingFromTraefik = [];
      for (const hostname of trackedHostnames) {
        if (!traefikHostnames.has(hostname)) {
          missingFromTraefik.push(hostname);
        }
      }
      
      // Show results
      if (missingFromTracking.length > 0) {
        logger.info(`Found ${missingFromTracking.length} hostnames in Traefik not in tracking:`);
        missingFromTracking.forEach(hostname => {
          logger.info(`- ${hostname} (in Traefik but not tracked)`);
        });
      } else {
        logger.info('All Traefik hostnames are properly tracked');
      }
      
      if (missingFromTraefik.length > 0) {
        logger.info(`Found ${missingFromTraefik.length} tracked hostnames not in Traefik:`);
        missingFromTraefik.forEach(hostname => {
          logger.info(`- ${hostname} (tracked but not in Traefik - orphaned?)`);
        });
      } else {
        logger.info('All tracked hostnames exist in Traefik');
      }
      
      // Special check for specific hostname if provided
      if (this.hostnameToCheck) {
        const hostname = this.hostnameToCheck.toLowerCase();
        logger.info(`Checking specific hostname: ${hostname}`);
        
        const inTraefik = traefikHostnames.has(hostname);
        const inTracking = trackedHostnames.has(hostname);
        const inMemory = memoryHostnames.has(hostname);
        
        logger.info(`Status for ${hostname}:`);
        logger.info(`- In Traefik: ${inTraefik}`);
        logger.info(`- In RecordTracker: ${inTracking}`);
        logger.info(`- In Memory: ${inMemory}`);
      }
      
      logger.info('Traefik-DNS synchronization check complete');
    } catch (error) {
      logger.error(`Error checking Traefik-DNS sync: ${error.message}`);
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
          
          // Persist tunnel hostname tracking if needed for cfzerotrust provider
          if (this.config.dnsProvider === 'cfzerotrust') {
            this.persistTunnelHostnameTracking(processedRecords);
          }
        }
        
        logger.success(`Successfully processed ${processedRecords.length} managed hostnames`);
      } catch (error) {
        logger.error(`Error batch processing managed hostnames: ${error.message}`);
      }
    }
  }

  /**
   * Delete an orphaned DNS record and handle all related cleanup
   * @param {Object} record - The record to delete
   * @returns {Promise<boolean>} - Success/failure of the delete operation
   */
  async deleteOrphanedRecord(record) {
    try {
      const displayName = record.displayName || record.name;
      logger.info(`🗑️ Removing orphaned DNS record: ${displayName} (${record.type || 'TUNNEL'})`);
      
      // Delete from provider
      try {
        await this.dnsProvider.deleteRecord(record.id);
      } catch (error) {
        // Handle 404 errors gracefully - record already deleted
        if (error.response && error.response.status === 404) {
          logger.debug(`DNS record ${displayName} already deleted (404)`);
          // Continue with cleanup since the record is gone anyway
        } else {
          // Re-throw other errors
          throw error;
        }
      }
      
      // Remove from tracking
      if (this.recordTracker) {
        this.recordTracker.untrackRecord(record);
      }
      
      // Special handling for cfzerotrust provider
      if (this.config.dnsProvider === 'cfzerotrust' && record.name) {
        // Also remove from in-memory tracking
        if (global.tunnelHostnames && global.tunnelHostnames.has(record.name)) {
          global.tunnelHostnames.delete(record.name);
          logger.debug(`Removed tracked tunnel hostname from memory: ${record.name}`);
        }
      }
      
      // Publish delete event
      this.eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
        name: displayName,
        type: record.type || 'TUNNEL'
      });
      
      return true;
    } catch (error) {
      logger.error(`Error deleting orphaned record ${record.displayName || record.name}: ${error.message}`);
      return false;
    }
  }
}

module.exports = DNSManager;