/**
 * Key Manager for DNS Record Tracker
 * Manages record identification and keys
 */
const logger = require('../logger');

/**
 * Generate a key for a DNS record to use in tracking
 * This normalizes record format across different providers
 * @param {Object} record - DNS record object
 * @returns {string} - Unique key for the record
 */
function getRecordKey(record) {
  if (!record) {
    return null;
  }
  
  // Check that we have minimum required fields
  if (!record.type || !record.name) {
    logger.warn(`Cannot generate key for incomplete record: ${JSON.stringify(record)}`);
    return null;
  }
  
  // For consistency, generate a key from type and name
  const key = `${record.type}:${record.name}`;
  logger.trace(`Generated record key: ${key}`);
  
  return key;
}

module.exports = {
  getRecordKey
};