/**
 * DNS Manager Service - Main Module
 * Responsible for managing DNS records through the selected provider
 * This is a modular implementation that orchestrates specialized sub-modules
 * 
 * IMPORTANT BEHAVIOR:
 * - Only DNS records that EXACTLY match active hostnames from Traefik/Docker will be marked as app-managed
 * - Records that aren't marked as app-managed will NOT be deleted during cleanup
 * - During initialization, default markAsAppManaged is set to false for safety
 * - All provider DNS records are tracked, but not all are marked as app-managed
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
    
    // Initialize DNS provider with defensive error handling
    try {
      this.dnsProvider = DNSProviderFactory.createProvider(config);
      logger.debug('DNS Provider initialized successfully');
    } catch (providerError) {
      logger.error(`Failed to initialize DNS Provider: ${providerError.message}`);
      this.dnsProvider = null; // Ensure we don't have an undefined provider
    }
    
    // Initialize record tracker (legacy system - kept for backward compatibility)
    try {
      this.recordTracker = new RecordTracker(config);
      logger.debug('Record Tracker initialized successfully');
      
      // Ensure all necessary properties exist on the record tracker
      if (!this.recordTracker.managedHostnames) {
        this.recordTracker.managedHostnames = [];
        logger.debug('Initialized empty managedHostnames array in record tracker');
      }
      
      if (!this.recordTracker.preservedHostnames) {
        this.recordTracker.preservedHostnames = [];
        logger.debug('Initialized empty preservedHostnames array in record tracker');
      }
      
      if (!this.recordTracker.data) {
        this.recordTracker.data = { providers: {} };
        logger.debug('Initialized empty data object in record tracker');
      }
    } catch (trackerError) {
      logger.error(`Failed to initialize Record Tracker: ${trackerError.message}`);
      // Create a minimal record tracker object to prevent undefined errors
      this.recordTracker = {
        managedHostnames: [],
        preservedHostnames: [],
        data: { providers: {} },
        isTracked: () => false,
        trackRecord: () => false,
        isRecordOrphaned: () => false,
        markRecordOrphaned: () => false,
        unmarkRecordOrphaned: () => false,
        untrackRecord: () => false,
        shouldPreserveHostname: () => false,
        getRecordOrphanedTime: () => new Date(),
        trackAllActiveRecords: () => 0
      };
    }
    
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
    
    // Timer for orphaned records cleanup
    this.orphanedRecordCleanupTimer = null;
    
    // Set default cleanup interval to 5 minutes (can be overridden by environment variable)
    this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL_MINUTES || 5, 10) * 60 * 1000; // Convert to milliseconds
    
    // Timer for provider cache database sync
    this.providerCacheSyncTimer = null;
    
    // Set provider cache sync interval (use the same interval as DNS cache refresh)
    this.providerCacheSyncInterval = this.config.cacheRefreshInterval; // Already in milliseconds
    
    // Last active hostnames to check for orphaned records - initialize as empty array to avoid undefined
    this.lastActiveHostnames = [];
    this.hasRunInitialCleanup = false;
    
    // Debounce timer for orphaned cleanup
    this.orphanedCleanupDebounceTimer = null;
    
    // Subscribe to relevant events with error handling
    try {
      // Ensure eventBus exists before setting up subscriptions
      if (this.eventBus) {
        // Wrap processHostnames to add error handling
        const safeProcessHostnames = async (hostnames, containerLabels) => {
          try {
            await this.processHostnames(hostnames, containerLabels);
          } catch (error) {
            logger.error(`Error in processHostnames: ${error.message}`);
            logger.debug(`ProcessHostnames error stack: ${error.stack}`);
          }
        };
        
        setupEventSubscriptions(this.eventBus, safeProcessHostnames, this);
        logger.debug('Event subscriptions set up successfully');
      } else {
        logger.warn('No event bus available, skipping event subscriptions');
      }
    } catch (eventError) {
      logger.error(`Failed to set up event subscriptions: ${eventError.message}`);
      logger.debug(`Event subscription error stack: ${eventError.stack}`);
    }
    
    logger.debug('DNSManager constructor completed');
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
      
      // Start the orphaned record cleanup timer
      this.startOrphanedRecordCleanupTimer();
      
      // Start the provider cache sync timer
      this.startProviderCacheSyncTimer();

      logger.success('DNS Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize DNS Manager: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Start the orphaned record cleanup timer
   */
  startOrphanedRecordCleanupTimer() {
    try {
      // Clear any existing timer
      if (this.orphanedRecordCleanupTimer) {
        clearInterval(this.orphanedRecordCleanupTimer);
      }
      
      // Ensure lastActiveHostnames is always an array to prevent errors
      if (!this.lastActiveHostnames || !Array.isArray(this.lastActiveHostnames)) {
        this.lastActiveHostnames = [];
      }
      
      // Log the cleanup interval
      logger.info(`Starting orphaned DNS record cleanup timer with interval of ${this.cleanupInterval / 60000} minutes`);
      
      // Run the cleanup immediately on startup only if we have active hostnames
      if (this.lastActiveHostnames && this.lastActiveHostnames.length > 0) {
        logger.info('Running initial orphaned record cleanup on startup');
        if (this.dnsProvider && this.recordTracker) {
          this.cleanupOrphanedRecordsWithLastHostnames()
            .catch(error => logger.error(`Initial orphaned record cleanup failed: ${error.message}`));
        }
      } else {
        logger.info('Skipping initial orphaned record cleanup - no active hostnames processed yet');
      }
      
      // Set up the interval for regular cleanups with proper error handling
      this.orphanedRecordCleanupTimer = setInterval(() => {
        try {
          // Always validate components before cleanup
          if (!this.dnsProvider || !this.recordTracker) {
            logger.warn('Required components not initialized for orphaned record cleanup, skipping');
            return;
          }
          this.cleanupOrphanedRecordsWithLastHostnames();
        } catch (cleanupError) {
          logger.error(`Error in scheduled orphaned record cleanup: ${cleanupError.message}`);
        }
      }, this.cleanupInterval);
      
      logger.debug('Orphaned record cleanup timer started successfully');
    } catch (error) {
      logger.error(`Failed to start orphaned record cleanup timer: ${error.message}`);
    }
  }
  
  /**
   * Start the provider cache sync timer
   */
  startProviderCacheSyncTimer() {
    try {
      // Clear any existing timer
      if (this.providerCacheSyncTimer) {
        clearInterval(this.providerCacheSyncTimer);
      }
      
      // Log the sync interval
      logger.info(`Starting provider cache database sync timer with interval of ${this.providerCacheSyncInterval / 60000} minutes`);
      
      // Set up the interval for regular syncs
      this.providerCacheSyncTimer = setInterval(() => {
        this.syncProviderCacheToDatabase()
          .catch(error => logger.error(`Provider cache sync failed: ${error.message}`));
      }, this.providerCacheSyncInterval);
      
      logger.debug('Provider cache sync timer started successfully');
    } catch (error) {
      logger.error(`Failed to start provider cache sync timer: ${error.message}`);
    }
  }
  
  /**
   * Stop the provider cache sync timer
   */
  stopProviderCacheSyncTimer() {
    if (this.providerCacheSyncTimer) {
      clearInterval(this.providerCacheSyncTimer);
      this.providerCacheSyncTimer = null;
      logger.debug('Provider cache sync timer stopped');
    }
  }
  
  /**
   * Sync the provider's in-memory cache to the database
   */
  async syncProviderCacheToDatabase() {
    try {
      logger.debug('Syncing provider cache to database...');
      
      // Check if components are available
      if (!this.dnsProvider || !this.repositoryManager) {
        logger.warn('Required components not available for provider cache sync');
        return;
      }
      
      // Get records from provider's in-memory cache (this will refresh if needed)
      const records = await this.dnsProvider.getRecordsFromCache();
      
      if (!records || !Array.isArray(records)) {
        logger.warn('No records to sync from provider cache');
        return;
      }
      
      // Sync to database
      const result = await this.repositoryManager.refreshProviderCache(records, this.dnsProvider.name);
      
      if (result.success) {
        logger.info(`Provider cache synced to database: ${result.refreshedCount} records for ${result.provider}`);
      } else {
        logger.error(`Failed to sync provider cache to database: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Error syncing provider cache to database: ${error.message}`);
    }
  }
  
  /**
   * Run the orphaned record cleanup with the last known active hostnames
   */
  async cleanupOrphanedRecordsWithLastHostnames() {
    // Use debouncing to prevent multiple simultaneous cleanups
    if (this.orphanedCleanupDebounceTimer) {
      clearTimeout(this.orphanedCleanupDebounceTimer);
    }
    
    this.orphanedCleanupDebounceTimer = setTimeout(async () => {
      try {
        logger.debug('Running orphaned record cleanup check');
        
        // Validate all required components are available before proceeding
        if (!this.dnsProvider) {
          logger.warn('DNS Provider not available for orphaned record cleanup, skipping');
          return;
        }
        
        if (!this.recordTracker) {
          logger.warn('Record Tracker not available for orphaned record cleanup, skipping');
          return;
        }
        
        if (!this.config) {
          logger.warn('Configuration not available for orphaned record cleanup, skipping');
          return;
        }
        
        // Ensure lastActiveHostnames is an array
        if (!this.lastActiveHostnames || !Array.isArray(this.lastActiveHostnames)) {
          logger.warn('lastActiveHostnames is not an array, initializing empty array');
          this.lastActiveHostnames = [];
        }
        
        // Initialize loggedPreservedRecords if needed
        if (!this.loggedPreservedRecords) {
          this.loggedPreservedRecords = new Set();
        }
        
        // Import the specific orphanedRecordCleaner module
        const { cleanupOrphanedRecords } = require('./orphanedRecordCleaner');
        
        // Use the last known active hostnames for cleanup
        await cleanupOrphanedRecords(
          this.lastActiveHostnames,
          this.dnsProvider,
          this.recordTracker,
          this.config,
          this.eventBus,
          this.loggedPreservedRecords
        );
        
        logger.debug('Orphaned record cleanup complete');
      } catch (error) {
        logger.error(`Failed to run orphaned record cleanup: ${error.message}`);
        logger.debug(`Error stack: ${error.stack}`);
      }
    }, 3000); // 3 second debounce delay
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
        
        // Update last active hostnames even when there are no configs to process
        // This is important for tracking hostnames that may have disappeared
        // IMPORTANT: Include managed hostnames to prevent them from being marked as orphaned
        const containerHostnames = hostnames || [];
        const managedHostnamesList = this.getManagedHostnamesList();
        this.lastActiveHostnames = [...new Set([...containerHostnames, ...managedHostnamesList])];
        
        return this.stats;
      }
      
      // Update stats
      this.stats.processedHostnames = processedHostnames ? processedHostnames.length : 0;
      
      // Update last active hostnames
      // IMPORTANT: Include managed hostnames to prevent them from being marked as orphaned
      const containerHostnames = hostnames || [];
      const managedHostnamesList = this.getManagedHostnamesList();
      
      // Combine container hostnames with managed hostnames
      this.lastActiveHostnames = [...new Set([...containerHostnames, ...managedHostnamesList])];
      
      // Log the combined active hostnames for debugging
      if (managedHostnamesList.length > 0) {
        logger.debug(`Combined active hostnames: ${containerHostnames.length} from containers + ${managedHostnamesList.length} managed = ${this.lastActiveHostnames.length} total`);
      }
      
      // Only update existing records on first run or if explicitly needed
      // This prevents re-marking records as app-managed on every restart
      if (global.isFirstRun === true) {
        logger.debug('First run detected, will update existing records for active hostnames');
        await this.updateExistingRecordsForActiveHostnames(hostnames || []);
      }
      
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
              // This is appropriate since we're creating these records in response to active hostnames
              const success = await this.trackRecord(record, true);
              if (success) {
                logger.info(`Successfully tracked new record ${record.name} (${record.type}) with appManaged=true (this is a newly created record)`);
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
      
      // Check if hostname count decreased - if so, immediately check for orphaned records
      if (hasCountChanged && hostnameCount < this.previousStats.hostnameCount) {
        logger.info(`Hostname count decreased from ${this.previousStats.hostnameCount} to ${hostnameCount}, checking for orphaned records immediately`);
        
        // Run orphaned cleanup without waiting for timer
        try {
          await this.cleanupOrphanedRecordsWithLastHostnames();
        } catch (cleanupError) {
          logger.error(`Failed to run immediate orphaned cleanup: ${cleanupError.message}`);
        }
      }
      
      // After processing hostnames, run the first orphaned cleanup if it hasn't run yet
      if (this.lastActiveHostnames && this.lastActiveHostnames.length > 0 && !this.hasRunInitialCleanup) {
        this.hasRunInitialCleanup = true;
        logger.info('Running initial orphaned record cleanup after processing hostnames');
        this.cleanupOrphanedRecordsWithLastHostnames()
          .catch(error => logger.error(`Post-processing orphaned cleanup failed: ${error.message}`));
      }
      
      return this.stats;
    } catch (error) {
      logger.error(`Error processing hostnames: ${error.message}`);
      this.stats.error = error.message;
      this.eventBus.emit(EventTypes.DNS_RECORDS_PROCESSED, this.stats);
      return this.stats;
    }
  }
  
  /**
   * Cleanup method to stop all timers
   */
  async cleanup() {
    try {
      logger.info('Cleaning up DNS Manager...');
      
      // Stop orphaned record cleanup timer
      if (this.orphanedRecordCleanupTimer) {
        clearInterval(this.orphanedRecordCleanupTimer);
        this.orphanedRecordCleanupTimer = null;
      }
      
      // Stop provider cache sync timer
      this.stopProviderCacheSyncTimer();
      
      logger.info('DNS Manager cleanup completed');
    } catch (error) {
      logger.error(`Error during DNS Manager cleanup: ${error.message}`);
    }
  }
  
  /**
   * Get list of managed hostnames (just the hostnames, not the full config)
   * @returns {Array<string>} Array of managed hostnames
   */
  getManagedHostnamesList() {
    if (!this.recordTracker || !this.recordTracker.managedHostnames) {
      return [];
    }
    
    // Extract just the hostname strings from the managed hostname objects
    return this.recordTracker.managedHostnames
      .filter(config => config && config.hostname)
      .map(config => config.hostname);
  }
  
  /**
   * Process managed hostnames from configuration
   */
  async processManagedHostnames() {
    try {
      // Ensure recordTracker is initialized and has managedHostnames array before calling processor
      if (!this.recordTracker) {
        logger.warn('Record tracker not initialized, skipping managed hostnames processing');
        return { success: false, error: 'Record tracker not initialized' };
      }
      
      // Initialize managedHostnames array if it doesn't exist
      if (!this.recordTracker.managedHostnames) {
        this.recordTracker.managedHostnames = [];
        logger.debug('Initialized empty managedHostnames array in record tracker');
      }
      
      const result = await processManagedHostnames(this.dnsProvider, this.recordTracker);
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
      // Import the orphaned record cleaner module
      const { cleanupOrphanedRecords: cleanupFn } = require('./orphanedRecordCleaner');
      
      logger.info(`Manual orphaned record cleanup triggered${forceImmediate ? ' (with force immediate)' : ''}`);
      
      // Use the current active hostnames for cleanup
      const result = await cleanupFn(
        this.lastActiveHostnames, 
        this.dnsProvider, 
        this.recordTracker,
        this.config,
        this.eventBus,
        this.loggedPreservedRecords,
        forceImmediate
      );
      
      logger.info('Manual orphaned record cleanup completed');
      return { success: true };
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
              
              // Only consider A and CNAME records for app management
              // MX, TXT, and other record types should never be automatically marked as app-managed
              // unless explicitly created by the app (which would be tracked differently)
              if (record.type !== 'A' && record.type !== 'CNAME') {
                logger.debug(`Skipping ${record.type} record ${record.name} - only A/CNAME records are considered for app management`);
                continue;
              }
              
              // Extract the hostname part of the record name (remove provider zone)
              const providerDomain = this.config.getProviderDomain();
              let hostname = record.name;
              
              // Handle apex domain records properly
              if (record.name === providerDomain) {
                // This is an apex record (e.g., example.com)
                // Skip it - apex records should not be automatically managed
                logger.debug(`Skipping apex domain record ${record.name} (${record.type})`);
                continue;
              } else if (record.name.endsWith(`.${providerDomain}`)) {
                // This is a subdomain record (e.g., app.example.com)
                hostname = record.name.replace(`.${providerDomain}`, '');
              }
              
              // Skip if hostname is empty or undefined (safety check)
              if (!hostname) {
                logger.debug(`Skipping record ${record.name} - empty hostname after processing`);
                continue;
              }
              
              // Check if the hostname matches any of our active hostnames
              let matchFound = false;
              
              logger.debug(`Checking DNS record ${record.name} (${record.type}) against ${currentHostnames.length} active hostnames`);
              
              // Normalize record hostname for better comparison
              const normalizedRecordHostname = hostname.toLowerCase();
              const normalizedRecordName = record.name.toLowerCase();
              
              for (const activeHostname of currentHostnames) {
                if (!activeHostname) continue; // Skip empty hostnames
                
                // Normalize active hostname
                const normalizedActiveHostname = activeHostname.toLowerCase();
                
                // Only perform EXACT matching - no partial matches allowed
                // This ensures only records that exactly match active hostnames are marked as app-managed
                if (normalizedActiveHostname === normalizedRecordHostname || 
                    normalizedActiveHostname === normalizedRecordName) {
                  // Mark this record to be managed by the app
                  recordsToMarkAsManaged.set(record.id, record);
                  logger.debug(`🔍 Found exact matching DNS record for active hostname: ${hostname} (${record.type})`);
                  logger.debug(`Match details: activeHostname="${activeHostname}", hostname="${hostname}", record.name="${record.name}"`);
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
      
      // We should ALWAYS set defaultMarkAsAppManaged to false (not true)
      // Records should only be marked as app-managed if they match active hostnames
      // regardless of whether this is the first run or not
      const defaultMarkAsAppManaged = false;
      
      logger.info(`Setting default markAsAppManaged: ${defaultMarkAsAppManaged} - IMPORTANT: Only DNS records that EXACTLY match active hostnames from Traefik/Docker will be marked as app-managed`);
      
      // Log this clearly to avoid confusion
      if (recordsToMarkAsManaged.size > 0) {
        logger.info(`Records that match active hostnames: ${recordsToMarkAsManaged.size} of ${records.length} will be marked as app-managed`);
      } else {
        logger.info(`No DNS records match active hostnames, none will be automatically marked as app-managed`);
      }
      
      
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
              // Only mark as managed if it's in the recordsToMarkAsManaged map
              // This ensures we ONLY mark records as app-managed if they exactly match active hostnames
              const shouldBeManaged = recordsToMarkAsManaged.has(record.id);
                
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
        logger.info(`Added ${trackedCount} pre-existing DNS records to tracker (with default appManaged=${defaultMarkAsAppManaged})`);
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
            logger.info(`✅ Successfully tracked record ${record.name} (${record.type}) in repository with appManaged=${isAppManaged}`);
          } else {
            logger.warn(`⚠️ Failed to track record ${record.name} (${record.type}) in repository`);
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
   * Mark existing DNS records as app-managed if they match active hostnames
   * This ensures that after initialization, records that match hostnames are properly
   * marked as app-managed so they can be cleaned up if they become orphaned
   * @param {Array<string>} activeHostnames - List of active hostnames from Traefik/Docker
   */
  async updateExistingRecordsForActiveHostnames(activeHostnames) {
    try {
      if (!activeHostnames || activeHostnames.length === 0) {
        logger.debug('No active hostnames to check against existing records');
        return;
      }
      
      logger.debug(`Checking ${activeHostnames.length} active hostnames against existing DNS records`);
      
      // Get all records from the provider
      const allRecords = await this.dnsProvider.getRecordsFromCache(false);
      
      if (!allRecords || !Array.isArray(allRecords) || allRecords.length === 0) {
        logger.debug('No DNS records found in cache to update appManaged status');
        return;
      }
      
      // Create normalized versions of hostnames for matching
      const normalizedActiveHostnames = activeHostnames.map(h => {
        // Convert to lowercase and trim whitespace
        const normalized = h ? h.trim().toLowerCase() : '';
        
        // Add domain if needed
        if (normalized && !normalized.includes('.')) {
          return `${normalized}.${this.config.getProviderDomain()}`;
        }
        return normalized;
      }).filter(Boolean); // Remove empty values
      
      // Log the normalized hostnames at debug level
      logger.debug(`Normalized active hostnames: ${normalizedActiveHostnames.join(', ')}`);
      
      // Keep track of records we update
      let updatedCount = 0;
      
      // Check each record against active hostnames
      for (const record of allRecords) {
        if (!record || !record.name || !record.type || !record.id) {
          continue; // Skip invalid records
        }
        
        // Only consider A and CNAME records for app management
        // MX, TXT, and other record types should never be automatically marked as app-managed
        if (record.type !== 'A' && record.type !== 'CNAME') {
          logger.debug(`Skipping ${record.type} record ${record.name} - only A/CNAME records are considered for automatic app management`);
          continue;
        }
        
        // Skip apex domain records (records where name equals the provider domain)
        // These should not be automatically marked as app-managed
        const providerDomain = this.config.getProviderDomain();
        if (record.name === providerDomain || record.name.toLowerCase() === providerDomain.toLowerCase()) {
          logger.debug(`Skipping apex domain record ${record.name} (${record.type}) - apex records are not automatically app-managed`);
          continue;
        }
        
        // Normalize record name
        const normalizedRecordName = record.name.trim().toLowerCase();
        
        // Check if this record matches any active hostname (exact match)
        const matchingHostname = normalizedActiveHostnames.find(hostname => 
          hostname === normalizedRecordName || 
          // Also check with the domain removed if it's a subdomain
          hostname === normalizedRecordName.replace(`.${this.config.getProviderDomain()}`, '')
        );
        
        if (matchingHostname) {
          // This record matches an active hostname - check if it's already marked as app-managed
          const isAppManaged = await this.isRecordAppManaged(record);
          
          if (!isAppManaged) {
            // Mark as app-managed since it matches an active hostname
            await this.updateRecordAppManaged(record, true);
            logger.debug(`Marked existing record ${record.name} (${record.type}) as app-managed because it matches active hostname: ${matchingHostname}`);
            updatedCount++;
          }
        }
      }
      
      if (updatedCount > 0) {
        logger.info(`Updated ${updatedCount} existing DNS records to appManaged=true because they match active hostnames`);
      } else {
        logger.debug('No DNS records needed appManaged status update');
      }
      
    } catch (error) {
      logger.error(`Failed to update existing records for active hostnames: ${error.message}`);
    }
  }
  
  /**
   * Check if a record is marked as app-managed
   * @param {Object} record - The record to check
   * @returns {Promise<boolean>} Whether the record is app-managed
   */
  async isRecordAppManaged(record) {
    try {
      if (!record || !record.id) {
        return false;
      }
      
      // Check with repository manager if available
      if (this.repositoryManager) {
        try {
          const metadata = await this.repositoryManager.managedRecords.getRecordMetadata(
            this.dnsProvider.name, record.id
          );
          return metadata && metadata.appManaged === true;
        } catch (repoError) {
          logger.debug(`Failed to get app-managed status from repository: ${repoError.message}`);
        }
      }
      
      // Fall back to record tracker
      return this.recordTracker.isRecordAppManaged(record);
    } catch (error) {
      logger.error(`Failed to check if record is app-managed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update a record's app-managed status
   * @param {Object} record - The record to update
   * @param {boolean} isAppManaged - Whether the record should be marked as app-managed
   * @returns {Promise<boolean>} Success status
   */
  async updateRecordAppManaged(record, isAppManaged) {
    try {
      if (!record || !record.id) {
        return false;
      }
      
      // Update with repository manager if available
      if (this.repositoryManager) {
        try {
          // Get current metadata
          const currentMetadata = await this.repositoryManager.managedRecords.getRecordMetadata(
            this.dnsProvider.name, record.id
          ) || {};
          
          // Update app-managed status
          const newMetadata = {
            ...currentMetadata,
            appManaged: isAppManaged,
            updatedAt: new Date().toISOString()
          };
          
          // Save updated metadata
          const success = await this.repositoryManager.managedRecords.updateRecordMetadata(
            this.dnsProvider.name, record.id, JSON.stringify(newMetadata)
          );
          
          if (success) {
            return true;
          }
        } catch (repoError) {
          logger.debug(`Failed to update app-managed status in repository: ${repoError.message}`);
        }
      }
      
      // Fall back to record tracker
      return this.recordTracker.updateRecordAppManaged(record, isAppManaged);
    } catch (error) {
      logger.error(`Failed to update record app-managed status: ${error.message}`);
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