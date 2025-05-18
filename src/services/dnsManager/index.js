/**
 * DNS Manager Service - Main Module
 * Responsible for managing DNS records through the selected provider
 * This is a modular implementation that orchestrates specialized sub-modules
 */
const { DNSProviderFactory } = require('../../providers');
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');
const RecordTracker = require('../../utils/recordTracker');

// Import sub-modules
const { setupEventSubscriptions } = require('./eventHandler');
const { processHostnames } = require('./recordProcessor');
const { cleanupOrphanedRecords } = require('./orphanedRecordCleaner');
const { processManagedHostnames } = require('./managedHostnameProcessor');
const { createStats, createPreviousStats, logStats } = require('./statistics');
const { safeArrayLength, safeConcatArrays, safeGetProperty, safeForEach } = require('./safeHelpers');

// Database module for repository access
const database = require('../../database');

class DNSManager {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsProvider = DNSProviderFactory.createProvider(config);
    
    // Initialize record tracker (legacy system - kept for backward compatibility)
    this.recordTracker = new RecordTracker(config);
    
    // Repository manager will be initialized during init()
    this.repositoryManager = null;
    
    // Track which preserved records we've already logged to avoid spam
    this.loggedPreservedRecords = new Set();

    // Flag to track if we've logged the preserved hostnames list (to avoid repeated logging)
    this.hasLoggedPreservedHostnames = false;

    // Initialize counters for statistics
    this.stats = createStats();
    
    // Track previous poll statistics to reduce logging noise
    this.previousStats = createPreviousStats();
    
    // Track cache TTL
    this.cacheTtl = parseInt(process.env.CACHE_TTL_MINUTES || 60, 10) * 60; // Convert to seconds
    
    // Subscribe to relevant events
    setupEventSubscriptions(this.eventBus, this.processHostnames.bind(this));
  }
  
  /**
   * Initialize the DNS Manager
   */
  async init() {
    try {
      logger.debug('Initializing DNS Manager...');
      await this.dnsProvider.init();

      // Initialize repository manager if database is ready
      if (database.isInitialized() && database.repositories && database.repositories.dnsManager) {
        this.repositoryManager = database.repositories.dnsManager;
        logger.debug('DNS Repository Manager is ready');
      } else {
        logger.warn('DNS Repository Manager not available - using legacy record tracker only');
      }

      // Set provider name if undefined (for internal tracking)
      if (!this.dnsProvider.name) {
        this.dnsProvider.name = this.config.dnsProvider || 'unknown';
        logger.debug(`Set provider name to ${this.dnsProvider.name} for internal tracking`);
      }
      
      // Synchronize tracker with active records
      await this.synchronizeRecordTracker();

      // Process managed hostnames during initialization
      await this.processManagedHostnames();

      logger.success('DNS Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DNS Manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Process a list of hostnames and ensure DNS records exist
   * @param {Array<string>} hostnames - List of hostnames to process
   * @param {Object} containerLabels - Map of container IDs to their labels
   */
  async processHostnames(hostnames, containerLabels) {
    try {
      // Defensive programming: ensure hostnames is an array
      if (!hostnames) {
        logger.warn('Empty hostnames array passed to processHostnames');
        hostnames = [];
      } else if (!Array.isArray(hostnames)) {
        logger.warn('Non-array passed to processHostnames, converting to array');
        try {
          // Try to convert to array if possible
          hostnames = Array.from(hostnames);
        } catch (conversionError) {
          logger.error(`Failed to convert hostnames to array: ${conversionError.message}`);
          hostnames = [];
        }
      }
      
      // Ensure containerLabels is an object
      if (!containerLabels) {
        logger.debug('Empty containerLabels passed to processHostnames');
        containerLabels = {};
      }
      
      // Get hostname count safely
      const hostnameCount = safeArrayLength(hostnames);
      
      // Only log at INFO level if the hostname count has changed or it's the first run
      const hasCountChanged = this.previousStats.hostnameCount !== hostnameCount;

      if (hasCountChanged) {
        logger.info(`Processing ${hostnameCount} hostnames for DNS management`);
      } else {
        // Log at debug level if nothing changed to reduce noise
        logger.debug(`Processing ${hostnameCount} hostnames for DNS management`);
      }

      // Update previous stats with current hostname count
      this.previousStats.hostnameCount = hostnameCount;

      // Track if we've already logged the preserved hostnames
      // We only want to log this once during startup, not on every poll
      if (!this.hasLoggedPreservedHostnames &&
          this.recordTracker.preservedHostnames &&
          this.recordTracker.preservedHostnames.length > 0) {
        logger.info(`Loaded ${this.recordTracker.preservedHostnames.length} preserved hostnames: ${this.recordTracker.preservedHostnames.join(', ')}`);
        this.hasLoggedPreservedHostnames = true;
      }

      // Reset statistics for this processing run
      this.stats = createStats();
      
      // Process hostnames to get DNS configurations
      const { processedHostnames, dnsRecordConfigs } = await processHostnames(
        hostnames || [], 
        containerLabels || {}, 
        this.config, 
        this.dnsProvider
      );
      
      // Skip processing if no records to process
      if (!dnsRecordConfigs || dnsRecordConfigs.length === 0) {
        this.stats.processedHostnames = processedHostnames ? processedHostnames.length : 0;
        this.stats.timestamp = new Date().toISOString();
        return this.stats;
      }
      
      // Update stats
      this.stats.processedHostnames = processedHostnames ? processedHostnames.length : 0;
      
      // Generate batch operations for the provider
      let batchResult;
      try {
        batchResult = await this.dnsProvider.batchEnsureRecords(dnsRecordConfigs);
      } catch (batchError) {
        logger.error(`Error in batch DNS operations: ${batchError.message}`);
        batchResult = {
          created: [],
          updated: [],
          unchanged: [],
          failed: []
        };
      }
      
      // Ensure batchResult and its properties exist
      if (!batchResult) {
        logger.warn('Batch operation returned undefined result, using empty results');
        batchResult = {
          created: [],
          updated: [],
          unchanged: [],
          failed: []
        };
      }
      
      // Ensure all arrays exist
      batchResult.created = batchResult.created || [];
      batchResult.updated = batchResult.updated || [];
      batchResult.unchanged = batchResult.unchanged || [];
      batchResult.failed = batchResult.failed || [];
      
      // Update stats
      this.stats.created = batchResult.created.length;
      this.stats.updated = batchResult.updated.length;
      this.stats.unchanged = batchResult.unchanged.length;
      this.stats.failed = batchResult.failed.length;
      this.stats.total = dnsRecordConfigs.length;
      this.stats.timestamp = new Date().toISOString();
      
      // Track newly created or updated records
      try {
        // Use our safe helpers to avoid errors
        const recordsToTrack = safeConcatArrays(batchResult.created, batchResult.updated);
        
        // Log records we're about to track
        if (recordsToTrack && recordsToTrack.length > 0) {
          logger.info(`Tracking ${recordsToTrack.length} newly created/updated DNS records`);
        }
        
        // Track each record
        for (const record of recordsToTrack) {
          try {
            // Extra validation to ensure we have a valid record to track
            if (!record || !record.id) {
              logger.warn(`Skipping invalid record in tracking: ${JSON.stringify(record)}`);
              continue;
            }
            
            // Always mark newly created records as appManaged=true since we just created them
            const isNewlyCreated = batchResult.created.some(r => r.id === record.id);
            if (isNewlyCreated) {
              logger.info(`Tracking newly created record ${record.name} (${record.type}) with ID ${record.id}`);
            }
            
            // Check if record is already tracked
            const isTracked = await this.isRecordTracked(record);
            
            if (isTracked) {
              // Update record ID if needed (e.g., if ID changed after creation)
              await this.updateRecordId(record);
              logger.debug(`Updated existing record tracking for ${record.name} (${record.type})`);
            } else {
              // Add new record to tracker - always mark as app managed for newly created records
              const success = await this.trackRecord(record, true);
              if (success) {
                logger.info(`Successfully tracked new record ${record.name} (${record.type})`);
              } else {
                logger.error(`Failed to track new record ${record.name} (${record.type})`);
              }
            }
            
            // Double check with repository to ensure record is properly tracked
            if (this.repositoryManager) {
              try {
                const isNowTracked = await this.repositoryManager.isTracked(record.id, this.dnsProvider.name);
                if (!isNowTracked) {
                  logger.warn(`Record ${record.name} (${record.type}) not found in repository after tracking, retrying...`);
                  await this.repositoryManager.trackRecord(record, this.dnsProvider.name, true);
                }
              } catch (repoError) {
                logger.error(`Repository tracking verification failed: ${repoError.message}`);
              }
            }
          } catch (trackError) {
            logger.error(`Failed to track record ${record?.name || 'unknown'}: ${trackError.message}`);
          }
        }
      } catch (batchTrackError) {
        logger.error(`Error tracking batch records: ${batchTrackError.message}`);
      }
      
      // Log statistics if anything changed or at debug level
      if (this.stats.created > 0 || this.stats.updated > 0 || this.stats.failed > 0) {
        logStats(this.stats);
      } else {
        // Log at debug level if nothing changed
        logStats(this.stats, 'debug');
      }
      
      // Emit statistics event
      this.eventBus.emit(EventTypes.DNS_RECORDS_PROCESSED, this.stats);
      
      return this.stats;
    } catch (error) {
      logger.error(`Error processing hostnames: ${error.message}`);
      this.stats.error = error.message;
      this.eventBus.emit(EventTypes.DNS_RECORDS_PROCESSED, this.stats);
      return this.stats;
    }
  }
  
  /**
   * Process managed hostnames from configuration
   */
  async processManagedHostnames() {
    try {
      const result = await processManagedHostnames(this.config, this.dnsProvider, this.trackRecord.bind(this));
      return result;
    } catch (error) {
      logger.error(`Failed to process managed hostnames: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Cleanup orphaned DNS records
   * @param {boolean} forceImmediate - Whether to force immediate cleanup
   */
  async cleanupOrphanedRecords(forceImmediate = false) {
    try {
      const result = await cleanupOrphanedRecords(
        this.config, 
        this.dnsProvider, 
        this.recordTracker,
        forceImmediate,
        this.repositoryManager
      );
      
      return result;
    } catch (error) {
      logger.error(`Failed to cleanup orphaned records: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Synchronize record tracker with active DNS records
   * This ensures all existing records are properly tracked
   */
  async synchronizeRecordTracker() {
    try {
      logger.info('Synchronizing DNS record tracker with active records');
      
      // Get all records from provider (force fresh data)
      const records = await this.dnsProvider.getRecordsFromCache(true);
      
      if (!records || !Array.isArray(records)) {
        logger.warn('No records returned from provider or invalid data format');
        return { success: false, error: 'Invalid records data from provider' };
      }
      
      // First run detection - this influences how we handle existing records
      const isFirstRun = global.isFirstRun === true;
      
      // Get current hostnames from Traefik/Docker
      let currentHostnames = [];
      let recordsToMarkAsManaged = new Map();
      
      // If this is the first run, collect current hostnames from active services to match against DNS records
      if (isFirstRun) {
        logger.info('🔍 First run detected: collecting active hostnames to match pre-existing DNS records');
        try {
          // Get hostnames from global services if available
          if (global.services && global.services.Monitor) {
            if (this.config.operationMode.toLowerCase() === 'direct') {
              // For Direct mode - get hostnames from Docker container labels
              if (global.services.DockerMonitor) {
                try {
                  const containerLabels = global.services.DockerMonitor.getLabelCache ? 
                    global.services.DockerMonitor.getLabelCache() : {};
                    
                  // Extract hostnames from container labels
                  for (const [containerId, labels] of Object.entries(containerLabels)) {
                    const dnsLabels = Object.keys(labels)
                      .filter(key => key.startsWith('dns.') || key.startsWith('traefik.http.routers'))
                      .reduce((obj, key) => {
                        obj[key] = labels[key];
                        return obj;
                      }, {});
                      
                    // Look for hostnames in DNS and Traefik labels
                    for (const [key, value] of Object.entries(dnsLabels)) {
                      if (key.includes('host') || key.includes('name')) {
                        // Extract potential hostnames
                        const possibleHostnames = value.split(',').map(h => h.trim());
                        currentHostnames.push(...possibleHostnames);
                      }
                    }
                  }
                } catch (dockerError) {
                  logger.warn(`Could not get Docker container labels: ${dockerError.message}`);
                }
              }
            } else {
              // For Traefik mode - get hostnames from the Traefik monitor
              if (global.services.TraefikMonitor) {
                try {
                  // If we can access the real-time hostnames from TraefikMonitor
                  const traefikMonitor = global.services.TraefikMonitor;
                  
                  // Poll Traefik API directly to get current routers/hostnames
                  const routers = await traefikMonitor.getRouters();
                  if (routers) {
                    const { hostnames } = traefikMonitor.processRouters(routers);
                    if (Array.isArray(hostnames) && hostnames.length > 0) {
                      currentHostnames.push(...hostnames);
                    }
                  }
                } catch (traefikError) {
                  logger.warn(`Could not get Traefik hostnames: ${traefikError.message}`);
                }
              }
            }
          }
          
          // Ensure we have unique hostnames
          currentHostnames = [...new Set(currentHostnames)].filter(Boolean);
          
          if (currentHostnames.length > 0) {
            logger.info(`Found ${currentHostnames.length} active hostnames to match against DNS records`);
            
            // Match records with current hostnames
            for (const record of records) {
              if (!record || !record.name) continue;
              
              // Extract the hostname part of the record name (remove provider zone)
              const hostname = record.name.replace(`.${this.config.getProviderDomain()}`, '');
              
              // Check if the hostname matches any of our active hostnames
              let matchFound = false;
              for (const activeHostname of currentHostnames) {
                // Perform exact matches only to avoid incorrect flagging
                // Only consider exact hostname matches or exact FQDN matches
                if (activeHostname === hostname || activeHostname === record.name) {
                  // Mark this record to be managed by the app
                  recordsToMarkAsManaged.set(record.id, record);
                  logger.info(`🔍 Found matching DNS record for active hostname: ${hostname}`);
                  matchFound = true;
                  break;
                }
              }
              
              // Log when a record is NOT matched - useful for debugging
              if (!matchFound && (record.type === 'A' || record.type === 'CNAME')) {
                logger.debug(`Record ${record.name} (${record.type}) not matched to any active hostname`);
              }
            }
            
            logger.info(`${recordsToMarkAsManaged.size} of ${records.length} DNS records match active hostnames and will be marked as app-managed`);
          } else {
            logger.warn('No active hostnames found to match against DNS records');
          }
        } catch (hostnameError) {
          logger.warn(`Error collecting active hostnames: ${hostnameError.message}`);
        }
      }
      
      // During first run, we mark pre-existing records as NOT app-managed by default for safety
      // This prevents accidental deletion of records that existed before TrafegoDNS
      if (isFirstRun) {
        logger.info('🔒 First run detected: marking pre-existing DNS records as NOT app-managed by default for safety');
      }
      
      // Determine whether to mark records as app-managed based on first run
      const defaultMarkAsAppManaged = !isFirstRun;
      
      // ------------------------
      // Update repository if available
      // ------------------------
      if (this.repositoryManager) {
        try {
          // Refresh the provider cache
          await this.repositoryManager.refreshProviderCache(records, this.dnsProvider.name);
          
          // For each record, check if it's already in managed records
          let newlyTrackedCount = 0;
          let managedCount = 0;
          
          for (const record of records) {
            if (!record || !record.id || !record.type || !record.name) {
              continue;
            }
            
            const isTracked = await this.repositoryManager.isTracked(record.id, this.dnsProvider.name);
            
            if (!isTracked) {
              // Ensure provider is always set to avoid NULL constraint errors
              const recordToTrack = { ...record };
              if (!recordToTrack.provider) {
                recordToTrack.provider = this.dnsProvider.name || 'unknown';
              }
              
              // Double-check the provider is set to prevent NULL constraint failures
              recordToTrack.provider = recordToTrack.provider || 'unknown';

              // Determine if this record should be marked as app-managed
              const shouldBeManaged = isFirstRun && recordsToMarkAsManaged.has(record.id) ? 
                true : defaultMarkAsAppManaged;
                
              // If marking as managed, count it
              if (shouldBeManaged) {
                managedCount++;
              }

              // Track the record with the appropriate app-managed setting
              const success = await this.repositoryManager.trackRecord(recordToTrack, this.dnsProvider.name, shouldBeManaged);
              if (success) {
                newlyTrackedCount++;
              }
            }
          }
          
          if (newlyTrackedCount > 0) {
            logger.info(`Added ${newlyTrackedCount} pre-existing DNS records to repository`);
            if (managedCount > 0) {
              logger.info(`Marked ${managedCount} of those records as app-managed because they match active hostnames`);
            }
          }
          
          // Ensure orphaned records are properly marked
          await this.repositoryManager.syncManagedRecordsWithProvider(this.dnsProvider.name);
        } catch (repoError) {
          logger.error(`Failed to synchronize with repository: ${repoError.message}`);
          // Continue with legacy tracker as fallback
        }
      }
      
      // ------------------------
      // Legacy tracker update (for backward compatibility)
      // ------------------------
      let trackedCount = 0;
      try {
        // For legacy tracker, use the same logic for determining which records to mark as managed
        trackedCount = await this.recordTracker.trackAllActiveRecords(
          records, 
          defaultMarkAsAppManaged,
          isFirstRun ? recordsToMarkAsManaged : null // Pass the map of records to mark as managed
        );
      } catch (trackerError) {
        logger.error(`Failed to synchronize legacy record tracker: ${trackerError.message}`);
      }
      
      if (trackedCount > 0) {
        logger.info(`Added ${trackedCount} pre-existing DNS records to tracker`);
      }
      
      return { 
        success: true, 
        trackedCount: Math.max(trackedCount, 0),
        totalRecords: records.length,
        managedCount: recordsToMarkAsManaged.size
      };
    } catch (error) {
      logger.error(`Failed to synchronize record tracker: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Refresh DNS records from provider
   * @param {boolean} force - Whether to force refresh (bypass cache)
   */
  async refreshRecords(force = true) {
    try {
      logger.info('Refreshing DNS records from provider');
      
      // Get records from provider
      const records = await this.dnsProvider.getRecordsFromCache(force);
      
      if (!records || !Array.isArray(records)) {
        return { 
          success: false, 
          error: 'Invalid records data from provider' 
        };
      }
      
      // Update repositories if available
      if (this.repositoryManager) {
        try {
          await this.repositoryManager.refreshProviderCache(records, this.dnsProvider.name);
        } catch (repoError) {
          logger.error(`Failed to refresh provider cache in repository: ${repoError.message}`);
        }
      }
      
      return { 
        success: true, 
        recordCount: records.length 
      };
    } catch (error) {
      logger.error(`Failed to refresh DNS records: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * Get DNS records
   * @param {Object} options - Filter options
   */
  async getRecords(options = {}) {
    try {
      const records = [];
      
      // Try to get records from repository first
      if (this.repositoryManager) {
        try {
          // If we need managed records
          if (options.managed) {
            const managedRecords = await this.repositoryManager.getManagedRecords(
              this.dnsProvider.name, 
              { 
                isAppManaged: true,
                ...options 
              }
            );
            return managedRecords;
          }
          
          // If we need orphaned records
          if (options.orphaned) {
            const orphanedRecords = await this.repositoryManager.getManagedRecords(
              this.dnsProvider.name,
              {
                isOrphaned: true,
                ...options
              }
            );
            return orphanedRecords;
          }
          
          // If we're looking for all records, prefer the provider cache
          const providerRecords = await this.repositoryManager.getProviderRecords(
            this.dnsProvider.name,
            options
          );
          
          // If provider cache has records, use those
          if (providerRecords && providerRecords.length > 0) {
            return providerRecords;
          }
          
          // If provider cache is empty, fall back to managed records
          const managedRecords = await this.repositoryManager.getManagedRecords(
            this.dnsProvider.name,
            options
          );
          
          if (managedRecords && managedRecords.length > 0) {
            return managedRecords;
          }
        } catch (repoError) {
          logger.error(`Failed to get records from repository: ${repoError.message}`);
          // Fall back to provider
        }
      }
      
      // Fall back to direct provider if repository failed or is empty
      return await this.dnsProvider.getRecordsFromCache(options.force);
    } catch (error) {
      logger.error(`Failed to get DNS records: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Check if a record is being tracked
   * @param {Object} record - Record to check
   */
  async isRecordTracked(record) {
    try {
      // Try repository first if available
      if (this.repositoryManager) {
        try {
          return await this.repositoryManager.isTracked(record.id, this.dnsProvider.name);
        } catch (repoError) {
          logger.debug(`Repository check failed, falling back to legacy tracker: ${repoError.message}`);
        }
      }
      
      // Fall back to legacy tracker
      return await this.recordTracker.isTracked(record);
    } catch (error) {
      logger.error(`Failed to check if record is tracked: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Track a DNS record (add to managed records)
   * @param {Object} record - Record to track
   * @param {boolean} isAppManaged - Whether this record is managed by the app
   */
  async trackRecord(record, isAppManaged = true) {
    try {
      if (!record || !record.id || !record.name || !record.type) {
        logger.warn(`Cannot track invalid record: ${JSON.stringify(record)}`);
        return false;
      }
      
      let trackingSuccessful = false;
      
      // Try repository first if available
      if (this.repositoryManager) {
        try {
          trackingSuccessful = await this.repositoryManager.trackRecord(
            record, 
            this.dnsProvider.name, 
            isAppManaged
          );
          
          if (trackingSuccessful) {
            logger.debug(`Tracked record ${record.name} (${record.type}) in repository`);
          }
        } catch (repoError) {
          logger.debug(`Repository tracking failed, falling back to legacy tracker: ${repoError.message}`);
        }
      }
      
      // Fall back to legacy tracker (and for backward compatibility)
      const legacySuccess = await this.recordTracker.trackRecord(record, isAppManaged);
      
      // Return success if either method worked
      return trackingSuccessful || legacySuccess;
    } catch (error) {
      logger.error(`Failed to track record: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update a record's ID in the tracker
   * @param {Object} record - Record with new ID
   * @param {Object} oldRecord - Old record (optional if already tracked)
   */
  async updateRecordId(record, oldRecord = null) {
    try {
      let oldRecordId = oldRecord ? oldRecord.id : null;
      let updateSuccessful = false;
      
      if (!oldRecordId) {
        // If no old record provided, try to find by type and name
        if (this.repositoryManager) {
          // First check if a record with this type and name already exists
          const matchingRecords = await this.repositoryManager.findManagedRecords(
            this.dnsProvider.name,
            {
              type: record.type,
              name: record.name
            }
          );
          
          if (matchingRecords && matchingRecords.length > 0) {
            oldRecordId = matchingRecords[0].providerId;
          }
        }
      }
      
      // If we found an old record ID, update it
      if (oldRecordId) {
        // Try repository first if available
        if (this.repositoryManager) {
          try {
            updateSuccessful = await this.repositoryManager.managedRecords.updateRecordId(
              this.dnsProvider.name,
              oldRecordId,
              record.id
            );
            
            if (updateSuccessful) {
              logger.debug(`Updated record ID ${oldRecordId} to ${record.id} in repository`);
            }
          } catch (repoError) {
            logger.debug(`Repository update failed, falling back to legacy tracker: ${repoError.message}`);
          }
        }
      } else {
        // If no old record ID, try to update by type and name
        if (this.repositoryManager) {
          try {
            updateSuccessful = await this.repositoryManager.managedRecords.updateRecordByTypeAndName(
              this.dnsProvider.name,
              record.type,
              record.name,
              record.id
            );
            
            if (updateSuccessful) {
              logger.debug(`Updated record ${record.type}:${record.name} to ID ${record.id} in repository`);
            }
          } catch (repoError) {
            logger.debug(`Repository update by type/name failed: ${repoError.message}`);
          }
        }
      }
      
      // Fall back to legacy tracker (and for backward compatibility)
      let legacySuccess = false;
      
      if (oldRecordId) {
        legacySuccess = await this.recordTracker.updateRecordId(
          { id: oldRecordId }, 
          record
        );
      } else {
        // Create a dummy record with type and name for the tracker to update
        legacySuccess = await this.recordTracker.updateRecordId(
          { 
            type: record.type, 
            name: record.name 
          }, 
          record
        );
      }
      
      // Return success if either method worked
      return updateSuccessful || legacySuccess;
    } catch (error) {
      logger.error(`Failed to update record ID: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Check if provider cache needs refresh
   */
  async needsCacheRefresh() {
    try {
      // Check repository first if available
      if (this.repositoryManager) {
        try {
          return await this.repositoryManager.needsCacheRefresh(
            this.dnsProvider.name, 
            this.cacheTtl
          );
        } catch (repoError) {
          logger.debug(`Repository cache check failed: ${repoError.message}`);
        }
      }
      
      // Fall back to provider's own cache check
      return await this.dnsProvider.needsCacheRefresh();
    } catch (error) {
      logger.error(`Failed to check if cache needs refresh: ${error.message}`);
      // On error, assume refresh is needed
      return true;
    }
  }
}

module.exports = DNSManager;