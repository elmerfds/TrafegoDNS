/**
 * DNS Manager Bridge
 * Provides a standardized interface between the DNS Manager and the Record Tracker
 */
const logger = require('../../utils/logger');
const database = require('../index');

/**
 * Initializes the DNS repositories and provides a bridge to the DNS Manager
 * @returns {Promise<boolean>} Success status 
 */
async function initializeDnsRepositories() {
  try {
    // First, ensure the database is initialized
    if (!database.isInitialized()) {
      logger.info('Database not initialized, initializing now...');
      await database.initialize();
    }

    // Check if repositories are available
    if (!database.repositories || !database.repositories.dnsManager) {
      logger.error('DNS repository manager not available');
      return false;
    }

    logger.info('DNS repository manager initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize DNS repositories: ${error.message}`);
    return false;
  }
}

/**
 * Gets a tracked record repository from the DNS Manager
 * @returns {Object|null} The tracked record repository or null
 */
function getTrackedRecordRepository() {
  try {
    if (database && database.repositories && database.repositories.dnsManager) {
      return database.repositories.dnsManager.getTrackedRecordRepository();
    }
    return null;
  } catch (error) {
    logger.error(`Failed to get tracked record repository: ${error.message}`);
    return null;
  }
}

/**
 * Saves a record to the DNS tracked record repository
 * @param {string} provider - The DNS provider name
 * @param {Object} record - The record to save
 * @returns {Promise<boolean>} Success status
 */
async function trackRecord(provider, record) {
  try {
    // Get the repository
    const repository = getTrackedRecordRepository();
    if (!repository) {
      throw new Error('Tracked record repository not available');
    }

    // Track the record
    await repository.trackRecord({
      provider: provider,
      record_id: record.id || record.record_id,
      type: record.type || 'UNKNOWN',
      name: record.name || (record.id || record.record_id),
      content: record.content || '',
      ttl: record.ttl || 1,
      proxied: record.proxied === true ? 1 : 0,
      metadata: JSON.stringify({
        appManaged: record.metadata?.appManaged === true,
        trackedAt: new Date().toISOString()
      })
    });
    
    return true;
  } catch (error) {
    logger.error(`Failed to track record in DNS repository: ${error.message}`);
    return false;
  }
}

/**
 * Gets all records for a provider
 * @param {string} provider - The DNS provider name
 * @returns {Promise<Object>} The provider records
 */
async function getProviderRecords(provider) {
  try {
    // Get the repository
    const repository = getTrackedRecordRepository();
    if (!repository) {
      throw new Error('Tracked record repository not available');
    }

    // Get the records
    return await repository.getProviderRecords(provider);
  } catch (error) {
    logger.error(`Failed to get provider records: ${error.message}`);
    return { records: {} };
  }
}

/**
 * Checks if a record is tracked
 * @param {string} provider - The DNS provider name
 * @param {string} recordId - The record ID
 * @returns {Promise<boolean>} Whether the record is tracked
 */
async function isTracked(provider, recordId) {
  try {
    // Get the repository
    const repository = getTrackedRecordRepository();
    if (!repository) {
      throw new Error('Tracked record repository not available');
    }

    // Check if the record is tracked
    return await repository.isTracked(provider, recordId);
  } catch (error) {
    logger.error(`Failed to check if record is tracked: ${error.message}`);
    return false;
  }
}

// Export the module functions
module.exports = {
  initializeDnsRepositories,
  getTrackedRecordRepository,
  trackRecord,
  getProviderRecords,
  isTracked
};