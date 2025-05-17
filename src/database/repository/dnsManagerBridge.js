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
    // Check if the database module is available and initialized
    if (database && database.isInitialized()) {
      // Try to access the repository from the dnsManager
      if (database.repositories && database.repositories.dnsManager) {
        return database.repositories.dnsManager.getTrackedRecordRepository();
      } else {
        // If dnsManager is not available, try to load the DNSTrackedRecordRepository directly
        try {
          const DNSTrackedRecordRepository = require('./dnsTrackedRecordRepository');
          return new DNSTrackedRecordRepository(database.db);
        } catch (repoError) {
          logger.debug(`Could not create DNSTrackedRecordRepository directly: ${repoError.message}`);
        }
      }
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
      // Try to initialize the repository first
      await initializeDnsRepositories();
      
      // Try getting the repository again
      const retryRepo = getTrackedRecordRepository();
      if (!retryRepo) {
        // Still not available, try another approach
        logger.debug('Could not get tracked record repository, falling back to direct database access');
        
        // Try to access the database directly
        if (database && database.isInitialized() && database.db) {
          try {
            // Create a direct SQL query to insert the record
            const now = new Date().toISOString();
            const recordId = record.id || record.record_id;
            const recordType = record.type || 'UNKNOWN';
            const recordName = record.name || (record.id || record.record_id);
            const content = record.content || '';
            const ttl = record.ttl || 1;
            const proxied = record.proxied === true ? 1 : 0;
            const metadata = JSON.stringify({
              appManaged: record.metadata?.appManaged === true,
              trackedAt: now
            });
            
            // Directly insert into dns_tracked_records table
            await database.db.run(`
              INSERT OR REPLACE INTO dns_tracked_records
              (provider, record_id, type, name, content, ttl, proxied, tracked_at, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [provider, recordId, recordType, recordName, content, ttl, proxied, now, metadata]);
            
            return true;
          } catch (directDbError) {
            logger.debug(`Direct database access failed: ${directDbError.message}`);
            throw new Error('Tracked record repository not available and direct DB access failed');
          }
        } else {
          throw new Error('Tracked record repository not available');
        }
      }
      
      // Use the repository obtained on retry
      await retryRepo.trackRecord({
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
    }

    // Track the record using the repository found on first attempt
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
      // Try to initialize the repository first
      await initializeDnsRepositories();
      
      // Try getting the repository again
      const retryRepo = getTrackedRecordRepository();
      if (!retryRepo) {
        // Still not available, try another approach
        if (database && database.isInitialized() && database.db) {
          try {
            // Direct database query for provider records
            const rows = await database.db.all(`
              SELECT * FROM dns_tracked_records
              WHERE provider = ?
              ORDER BY name
            `, [provider]);
            
            // Format results for compatibility
            const records = {};
            
            for (const row of rows) {
              records[row.record_id] = {
                id: row.record_id,
                type: row.type,
                name: row.name,
                content: row.content,
                ttl: row.ttl,
                proxied: row.proxied === 1,
                tracked_at: row.tracked_at,
                is_orphaned: row.is_orphaned === 1,
                orphaned_at: row.orphaned_at,
                metadata: row.metadata ? JSON.parse(row.metadata) : null
              };
            }
            
            return { records };
          } catch (directDbError) {
            logger.debug(`Direct database query for records failed: ${directDbError.message}`);
          }
        }
        
        // Return empty result if all methods fail
        return { records: {} };
      }
      
      // Use the repository obtained on retry
      return await retryRepo.getProviderRecords(provider);
    }

    // Get the records using the repository found on first attempt
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
      // Try to initialize the repository first
      await initializeDnsRepositories();
      
      // Try getting the repository again
      const retryRepo = getTrackedRecordRepository();
      if (!retryRepo) {
        // Still not available, try another approach
        if (database && database.isInitialized() && database.db) {
          try {
            // Direct database query to check if record exists
            const record = await database.db.get(`
              SELECT id FROM dns_tracked_records
              WHERE provider = ? AND record_id = ?
            `, [provider, recordId]);
            
            return !!record;
          } catch (directDbError) {
            logger.debug(`Direct database query to check tracked status failed: ${directDbError.message}`);
          }
        }
        
        // Return false if all methods fail
        return false;
      }
      
      // Use the repository obtained on retry
      return await retryRepo.isTracked(provider, recordId);
    }

    // Check if the record is tracked using the repository found on first attempt
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