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

class DNSManager {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.dnsProvider = DNSProviderFactory.createProvider(config);
    
    // Initialize record tracker
    this.recordTracker = new RecordTracker(config);
    
    // Track which preserved records we've already logged to avoid spam
    this.loggedPreservedRecords = new Set();

    // Flag to track if we've logged the preserved hostnames list (to avoid repeated logging)
    this.hasLoggedPreservedHostnames = false;

    // Initialize counters for statistics
    this.stats = createStats();
    
    // Track previous poll statistics to reduce logging noise
    this.previousStats = createPreviousStats();
    
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
      // Only log at INFO level if the hostname count has changed or it's the first run
      const hasCountChanged = this.previousStats.hostnameCount !== hostnames.length;

      if (hasCountChanged) {
        logger.info(`Processing ${hostnames.length} hostnames for DNS management`);
      } else {
        // Log at debug level if nothing changed to reduce noise
        logger.debug(`Processing ${hostnames.length} hostnames for DNS management`);
      }

      // Update previous stats with current hostname count
      this.previousStats.hostnameCount = hostnames.length;

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
        hostnames, 
        containerLabels, 
        this.config,
        this.stats
      );
      
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
        }
      }
      
      // Log summary stats if we have records
      logStats(this.stats, this.previousStats, this.eventBus);
      
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
        source: 'DNSManager.processHostnames',
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Reset logged preserved records tracking
   */
  resetLoggedPreservedRecords() {
    this.loggedPreservedRecords = new Set();
  }
  
  /**
   * Clean up orphaned DNS records
   */
  async cleanupOrphanedRecords(activeHostnames) {
    return await cleanupOrphanedRecords(
      activeHostnames, 
      this.dnsProvider, 
      this.recordTracker, 
      this.config, 
      this.eventBus,
      this.loggedPreservedRecords
    );
  }
  
  /**
   * Process managed hostnames and ensure they exist
   */
  async processManagedHostnames() {
    return await processManagedHostnames(this.dnsProvider, this.recordTracker);
  }

  /**
   * Synchronize the record tracker with all active records from the provider
   * This ensures all existing records are tracked properly
   */
  async synchronizeRecordTracker() {
    try {
      // Get all active records from the provider
      logger.info('Synchronizing DNS record tracker with active records');
      const activeRecords = await this.dnsProvider.getRecordsFromCache(true);

      if (!activeRecords || activeRecords.length === 0) {
        logger.warn('No active records found from provider, skipping tracker synchronization');
        return 0;
      }

      // Check if this is the first run of the application
      // If so, be more conservative with existing records
      const isFirstRun = global.isFirstRun === true;
      
      if (isFirstRun) {
        logger.info('🔒 First run detected: marking pre-existing DNS records as NOT app-managed for safety');
      }

      // Track all active records with special handling for first run
      const newlyTrackedCount = await this.recordTracker.trackAllActiveRecords(activeRecords, !isFirstRun);

      // Log the results
      if (newlyTrackedCount > 0) {
        if (isFirstRun) {
          logger.info(`Added ${newlyTrackedCount} pre-existing DNS records to tracker (marked as not app-managed)`);
          this.eventBus.publish(EventTypes.INFO_EVENT, {
            source: 'DNSManager.synchronizeRecordTracker',
            message: `Added ${newlyTrackedCount} pre-existing DNS records to tracker (preserved for safety)`
          });
        } else {
          logger.info(`Added ${newlyTrackedCount} previously untracked DNS records to tracker`);
          this.eventBus.publish(EventTypes.INFO_EVENT, {
            source: 'DNSManager.synchronizeRecordTracker',
            message: `Added ${newlyTrackedCount} previously untracked DNS records to tracker`
          });
        }
      } else {
        logger.debug('All active DNS records are already being tracked');
      }

      return newlyTrackedCount;
    } catch (error) {
      logger.error(`Failed to synchronize record tracker: ${error.message}`);
      this.eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DNSManager.synchronizeRecordTracker',
        error: error.message
      });
      return 0;
    }
  }
}

module.exports = DNSManager;