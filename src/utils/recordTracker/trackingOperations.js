/**
 * Tracking Operations for DNS Record Tracker
 * Core tracking functionality
 */
const logger = require('../logger');
const { getRecordKey } = require('./keyManager');
const { saveTrackedRecordsToFile } = require('./fileManager');

/**
 * Track a new DNS record
 * @param {Object} data - Record tracking data
 * @param {string} trackerFile - Path to tracker file 
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to track
 */
function trackRecord(data, trackerFile, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    logger.warn(`Cannot track record: Invalid record format`);
    return;
  }
  
  // Store the record ID (avoid storing the whole record to save space)
  data.providers[provider].records[key] = {
    id: record.id,
    tracked: new Date().toISOString()
  };
  
  logger.trace(`Tracking record: ${key} (ID: ${record.id})`);
  
  // Save changes to file
  saveTrackedRecordsToFile(trackerFile, data);
}

/**
 * Untrack (stop tracking) a DNS record
 * @param {Object} data - Record tracking data
 * @param {string} trackerFile - Path to tracker file 
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to untrack
 */
function untrackRecord(data, trackerFile, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    logger.warn(`Cannot untrack record: Invalid record format`);
    return;
  }
  
  // Remove the record from tracking
  if (data.providers[provider].records[key]) {
    delete data.providers[provider].records[key];
    logger.trace(`Untracked record: ${key}`);
    
    // Save changes to file
    saveTrackedRecordsToFile(trackerFile, data);
  }
}

/**
 * Check if a record is being tracked
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @param {Object} record - Record to check
 * @returns {boolean} - Whether the record is tracked
 */
function isTracked(data, provider, record) {
  const key = getRecordKey(record);
  if (!key) {
    return false;
  }
  
  return !!data.providers[provider].records[key];
}

/**
 * Update a record's ID in the tracker
 * Used when a record ID changes but it's still the same logical record
 * @param {Object} data - Record tracking data
 * @param {string} trackerFile - Path to tracker file 
 * @param {string} provider - Current DNS provider
 * @param {Object} oldRecord - Original record
 * @param {Object} newRecord - New record
 */
function updateRecordId(data, trackerFile, provider, oldRecord, newRecord) {
  const key = getRecordKey(oldRecord);
  if (!key) {
    logger.warn(`Cannot update record ID: Invalid record format`);
    return;
  }
  
  // Verify we're tracking this record
  if (!data.providers[provider].records[key]) {
    logger.warn(`Cannot update ID for untracked record: ${key}`);
    return;
  }
  
  // Update the ID
  const oldId = data.providers[provider].records[key].id;
  data.providers[provider].records[key].id = newRecord.id;
  logger.trace(`Updated record ID: ${key} (${oldId} → ${newRecord.id})`);
  
  // Add updated timestamp
  data.providers[provider].records[key].updated = new Date().toISOString();
  
  // Save changes to file
  saveTrackedRecordsToFile(trackerFile, data);
}

/**
 * Get all tracked records
 * @param {Object} data - Record tracking data
 * @returns {Object} - All tracked records across providers
 */
function getAllTrackedRecords(data) {
  return data.providers;
}

/**
 * Get tracked records for the current provider
 * @param {Object} data - Record tracking data
 * @param {string} provider - Current DNS provider
 * @returns {Object} - Tracked records for the current provider
 */
function getCurrentProviderRecords(data, provider) {
  return data.providers[provider].records;
}

module.exports = {
  trackRecord,
  untrackRecord,
  isTracked,
  updateRecordId,
  getAllTrackedRecords,
  getCurrentProviderRecords
};