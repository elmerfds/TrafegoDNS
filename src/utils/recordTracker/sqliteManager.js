/**
 * SQLite Manager for DNS Record Tracker
 * Handles database operations for record tracking using SQLite
 */
const logger = require('../logger');

class SQLiteRecordManager {
  constructor(database) {
    this.database = database;
    this.repository = null;
    this.initialized = false;
    this.isReady = false;
  }

  /**
   * Initialize the SQLite record manager
   * @returns {boolean} - Success status
   */
  initialize() {
    try {
      // Check if database is available
      if (!this.database || !this.database.isInitialized()) {
        logger.debug('SQLite database not initialized, record tracker will use JSON storage');
        return false;
      }

      // Get repository
      if (!this.database.repositories || !this.database.repositories.dnsTrackedRecord) {
        logger.debug('DNS tracked record repository not available, record tracker will use JSON storage');
        return false;
      }

      this.repository = this.database.repositories.dnsTrackedRecord;
      this.initialized = true;
      this.isReady = true;
      
      logger.info('DNS record tracker initialized with SQLite storage');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SQLite record manager: ${error.message}`);
      this.isReady = false;
      return false;
    }
  }

  /**
   * Check if SQLite is ready to use
   * @returns {boolean} - Whether SQLite is ready
   */
  isInitialized() {
    return this.initialized && this.isReady && this.repository !== null;
  }

  /**
   * Load tracked records from SQLite
   * @param {string} provider - Current DNS provider name
   * @returns {Promise<Object>} - Loaded records data
   */
  async loadTrackedRecordsFromDatabase(provider) {
    if (!this.isInitialized()) {
      return { providers: {} };
    }

    try {
      // Get records for this provider
      if (provider) {
        const providerRecords = await this.repository.getProviderRecords(provider);
        return { 
          providers: { 
            [provider]: providerRecords 
          } 
        };
      } 
      
      // Or get all records if no provider specified
      return await this.repository.getAllTrackedRecords();
    } catch (error) {
      logger.error(`Failed to load tracked records from SQLite: ${error.message}`);
      return { providers: {} };
    }
  }

  /**
   * Save tracked records to SQLite
   * @param {Object} data - Records data to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveTrackedRecordsToDatabase(data) {
    if (!this.isInitialized() || !data || !data.providers) {
      return false;
    }

    try {
      let recordCount = 0;

      // Process all providers and their records
      for (const provider in data.providers) {
        const providerData = data.providers[provider];
        
        if (!providerData || !providerData.records) continue;
        
        for (const recordId in providerData.records) {
          const record = providerData.records[recordId];
          
          if (!record) continue;
          
          // Track the record in the database
          await this.repository.trackRecord({
            provider,
            record_id: recordId,
            type: record.type,
            name: record.name,
            content: record.content || record.value || '',
            ttl: record.ttl || 1,
            proxied: !!record.proxied,
            is_orphaned: record.is_orphaned ? 1 : 0,
            orphaned_at: record.orphaned_at || null,
            tracked_at: record.tracked_at || new Date().toISOString()
          });
          
          recordCount++;
        }
      }
      
      logger.debug(`Saved ${recordCount} tracked records to SQLite database`);
      return true;
    } catch (error) {
      logger.error(`Failed to save tracked records to SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Track a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {Object} record - Record to track
   * @returns {Promise<boolean>} - Success status
   */
  async trackRecord(provider, record) {
    if (!this.isInitialized()) {
      return false;
    }

    if (!record || !record.id) {
      logger.warn(`Cannot track record without ID in SQLite: ${JSON.stringify(record)}`);
      return false;
    }

    try {
      // Get record key for better identification
      const recordKey = `${record.type}:${record.name}`;
      logger.debug(`Tracking record in SQLite: ${recordKey} (ID: ${record.id})`);

      await this.repository.trackRecord({
        provider,
        record_id: record.id,
        type: record.type,
        name: record.name,
        content: record.content || record.value || '',
        ttl: record.ttl || 1,
        proxied: !!record.proxied,
        tracked_at: record.tracked_at || new Date().toISOString()
      });

      return true;
    } catch (error) {
      // If it's a constraint error (duplicate), try to update instead
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        try {
          logger.debug(`Record already exists, attempting to update: ${record.name} (${record.type})`);

          // Check if record exists with a different ID
          const exists = await this.repository.isTrackedByTypeAndName(provider, record.type, record.name);
          if (exists) {
            // Try to update the existing record
            logger.debug(`Found existing record with same type and name, updating ID: ${record.name} (${record.type})`);
            await this.repository.updateRecordByTypeAndName(provider, record.type, record.name, record.id);
            return true;
          }
        } catch (updateError) {
          logger.error(`Failed to update existing record in SQLite: ${updateError.message}`);
        }
      }

      logger.error(`Failed to track record in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Untrack a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async untrackRecord(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.untrackRecord(provider, recordId);
    } catch (error) {
      logger.error(`Failed to untrack record in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is tracked in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is tracked
   */
  async isTracked(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.isTracked(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is tracked in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Update record ID in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} oldRecordId - Old record ID
   * @param {string} newRecordId - New record ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateRecordId(provider, oldRecordId, newRecordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.updateRecordId(provider, oldRecordId, newRecordId);
    } catch (error) {
      logger.error(`Failed to update record ID in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Mark a record as orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async markRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.markRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to mark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Unmark a record as orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async unmarkRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.unmarkRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to unmark record as orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a record is orphaned in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<boolean>} - Whether the record is orphaned
   */
  async isRecordOrphaned(provider, recordId) {
    if (!this.isInitialized()) {
      return false;
    }

    try {
      return await this.repository.isRecordOrphaned(provider, recordId);
    } catch (error) {
      logger.error(`Failed to check if record is orphaned in SQLite: ${error.message}`);
      return false;
    }
  }

  /**
   * Get orphaned time of a record in SQLite
   * @param {string} provider - DNS provider name
   * @param {string} recordId - Record ID
   * @returns {Promise<string|null>} - Orphaned time or null
   */
  async getRecordOrphanedTime(provider, recordId) {
    if (!this.isInitialized()) {
      return null;
    }

    try {
      const result = await this.repository.getRecordOrphanedTime(provider, recordId);
      // Make sure we have a string, not a Date object
      return result ? (typeof result === 'string' ? result : new Date(result).toISOString()) : null;
    } catch (error) {
      logger.error(`Failed to get record orphaned time from SQLite: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all tracked records in SQLite
   * @returns {Promise<Object>} - All tracked records
   */
  async getAllTrackedRecords() {
    if (!this.isInitialized()) {
      return { providers: {} };
    }

    try {
      return await this.repository.getAllTrackedRecords();
    } catch (error) {
      logger.error(`Failed to get all tracked records from SQLite: ${error.message}`);
      return { providers: {} };
    }
  }

  /**
   * Get records for a provider in SQLite
   * @param {string} provider - DNS provider name
   * @returns {Promise<Object>} - Provider records
   */
  async getProviderRecords(provider) {
    if (!this.isInitialized()) {
      return { records: {} };
    }

    try {
      return await this.repository.getProviderRecords(provider);
    } catch (error) {
      logger.error(`Failed to get provider records from SQLite: ${error.message}`);
      return { records: {} };
    }
  }
}

module.exports = SQLiteRecordManager;