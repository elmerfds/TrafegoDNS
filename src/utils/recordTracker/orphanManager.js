/**
 * Orphan Manager for DNS Record Tracker
 * Handles tracking of orphaned DNS records
 */
const logger = require('../logger');
const { getRecordKey } = require('./keyManager');

/**
 * Mark a record as orphaned
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to mark as orphaned
 */
function markRecordOrphaned(data, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    logger.warn(`Cannot mark record as orphaned: Invalid record format`);
    return;
  }
  
  // Ensure the key exists in our tracking
  if (!data.providers[provider].records[key]) {
    logger.warn(`Cannot mark untracked record as orphaned: ${key}`);
    return;
  }
  
  // Set orphaned status with timestamp
  data.providers[provider].records[key].orphaned = {
    timestamp: new Date().toISOString(),
    timeMs: Date.now()
  };
  
  logger.debug(`Marked record as orphaned: ${key}`);
}

/**
 * Unmark a record as orphaned (reactivate it)
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to unmark as orphaned
 */
function unmarkRecordOrphaned(data, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    logger.warn(`Cannot unmark record as orphaned: Invalid record format`);
    return;
  }
  
  // Ensure the key exists in our tracking
  if (!data.providers[provider].records[key]) {
    logger.warn(`Cannot unmark untracked record as orphaned: ${key}`);
    return;
  }
  
  // Remove orphaned status
  if (data.providers[provider].records[key].orphaned) {
    delete data.providers[provider].records[key].orphaned;
    logger.debug(`Unmarked record as orphaned: ${key}`);
  }
}

/**
 * Check if a record is marked as orphaned
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to check
 * @returns {boolean} - Whether the record is orphaned
 */
function isRecordOrphaned(data, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    return false;
  }
  
  // Check if the record exists and has orphaned flag
  return !!(
    data.providers[provider].records[key] && 
    data.providers[provider].records[key].orphaned
  );
}

/**
 * Get the timestamp when a record was marked as orphaned
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to check
 * @returns {Date|null} - Timestamp when the record was marked as orphaned
 */
function getRecordOrphanedTime(data, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    return null;
  }
  
  // Check if the record exists and has orphaned status
  const recordData = data.providers[provider].records[key];
  if (recordData && recordData.orphaned) {
    // Return the time in ms if available, otherwise parse the timestamp
    if (recordData.orphaned.timeMs) {
      return new Date(recordData.orphaned.timeMs);
    } else if (recordData.orphaned.timestamp) {
      return new Date(recordData.orphaned.timestamp);
    }
  }
  
  return null;
}

module.exports = {
  markRecordOrphaned,
  unmarkRecordOrphaned,
  isRecordOrphaned,
  getRecordOrphanedTime
};