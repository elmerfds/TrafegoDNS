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
        this.dnsProvider
      );
      
      // Skip processing if no records to process
      if (!dnsRecordConfigs || dnsRecordConfigs.length === 0) {
        this.stats.processedHostnames = processedHostnames.length;
        this.stats.timestamp = new Date().toISOString();
        return this.stats;
      }
      
      // Update stats
      this.stats.processedHostnames = processedHostnames.length;
      
      // Generate batch operations for the provider
      const batchResult = await this.dnsProvider.batchEnsureRecords(dnsRecordConfigs);
      
      // Update stats
      this.stats.created = batchResult.created.length;
      this.stats.updated = batchResult.updated.length;
      this.stats.unchanged = batchResult.unchanged.length;
      this.stats.failed = batchResult.failed.length;
      this.stats.total = dnsRecordConfigs.length;
      this.stats.timestamp = new Date().toISOString();
      
      // Track newly created or updated records
      for (const record of [...batchResult.created, ...batchResult.updated]) {
        try {
          // Check if record is already tracked
          const isTracked = await this.isRecordTracked(record);
          
          if (isTracked) {
            // Update record ID if needed (e.g., if ID changed after creation)
            await this.updateRecordId(record);
          } else {
            // Add new record to tracker
            await this.trackRecord(record);
          }
        } catch (trackError) {
          logger.error(`Failed to track record ${record.name}: ${trackError.message}`);
        }
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
      
      // During first run, we mark pre-existing records as NOT app-managed for safety
      // This prevents accidental deletion of records that existed before TrafegoDNS
      if (isFirstRun) {
        logger.info('🔒 First run detected: marking pre-existing DNS records as NOT app-managed for safety');
      }
      
      // Determine whether to mark records as app-managed based on first run
      const markAsAppManaged = !isFirstRun;
      
      // ------------------------
      // Update repository if available
      // ------------------------
      if (this.repositoryManager) {
        try {
          // Refresh the provider cache
          await this.repositoryManager.refreshProviderCache(records, this.dnsProvider.name);
          
          // For each record, check if it's already in managed records
          let newlyTrackedCount = 0;
          
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

              const success = await this.repositoryManager.trackRecord(recordToTrack, this.dnsProvider.name, markAsAppManaged);
              if (success) {
                newlyTrackedCount++;
              }
            }
          }
          
          if (newlyTrackedCount > 0) {
            logger.info(`Added ${newlyTrackedCount} pre-existing DNS records to repository (app-managed: ${markAsAppManaged})`);
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
        trackedCount = await this.recordTracker.trackAllActiveRecords(records, markAsAppManaged);
      } catch (trackerError) {
        logger.error(`Failed to synchronize legacy record tracker: ${trackerError.message}`);
      }
      
      if (trackedCount > 0) {
        logger.info(`Added ${trackedCount} pre-existing DNS records to tracker (marked as not app-managed)`);
      }
      
      return { 
        success: true, 
        trackedCount: Math.max(trackedCount, 0),
        totalRecords: records.length 
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