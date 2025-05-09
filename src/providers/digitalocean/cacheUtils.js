/**
 * Cache utility functions for DigitalOcean provider
 */
const logger = require('../../utils/logger');

/**
 * Update a record in the cache
 */
function updateRecordInCache(recordCache, record) {
  logger.trace(`Updating record in cache: ID=${record.id}, type=${record.type}, name=${record.name}`);
  
  const index = recordCache.records.findIndex(
    r => r.id === record.id
  );
  
  if (index !== -1) {
    logger.trace(`Found existing record at index ${index}, replacing`);
    recordCache.records[index] = record;
  } else {
    logger.trace(`Record not found in cache, adding new record`);
    recordCache.records.push(record);
  }
}

/**
 * Remove a record from the cache
 */
function removeRecordFromCache(recordCache, id) {
  logger.trace(`Removing record ID=${id} from cache`);
  
  const initialLength = recordCache.records.length;
  recordCache.records = recordCache.records.filter(
    record => record.id !== id
  );
  
  const removed = initialLength - recordCache.records.length;
  logger.trace(`Removed ${removed} records from cache`);
}

module.exports = {
  updateRecordInCache,
  removeRecordFromCache
};