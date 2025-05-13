/**
 * File Manager for DNS Record Tracker
 * Handles file I/O operations for record tracking
 */
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * Initialize file paths for record tracking
 * @param {Object} config - Configuration object with provider information
 * @returns {Object} - Object with file paths
 */
function initializePaths() {
  // Define config directory path for data storage
  const configDir = path.join('/config', 'data');
  
  // Ensure the config directory exists
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
      logger.debug(`Created directory: ${configDir}`);
    } catch (error) {
      logger.error(`Failed to create config directory: ${error.message}`);
    }
  }
  
  // Define the new path for the tracker file
  const trackerFile = path.join(configDir, 'dns-records.json');
  
  // Also check for the legacy location
  const legacyTrackerFile = path.join(process.cwd(), 'dns-records.json');
  
  return {
    configDir,
    trackerFile,
    legacyTrackerFile
  };
}

/**
 * Load tracked records from file - DEPRECATED
 * @param {string} trackerFile - Path to the tracker file
 * @param {string} legacyTrackerFile - Path to the legacy tracker file
 * @param {string} provider - Current DNS provider name
 * @returns {Object} - Empty data structure (JSON storage is disabled)
 */
function loadTrackedRecordsFromFile(trackerFile, legacyTrackerFile, provider) {
  // Return an empty data structure - JSON storage is permanently disabled
  logger.debug('JSON file storage is permanently disabled, using empty data structure');
  
  // Initialize empty data structure
  const data = { 
    providers: {
      [provider]: { 
        records: {} 
      }
    } 
  };
  
  return data;
}

/**
 * Save tracked records to file - DEPRECATED
 * @param {string} trackerFile - Path to the tracker file
 * @param {Object} data - Data to save
 * @returns {boolean} - Always returns false (JSON storage is disabled)
 */
function saveTrackedRecordsToFile(trackerFile, data) {
  // JSON file storage is permanently disabled
  logger.debug('JSON file storage is permanently disabled, skipping file save');
  return false;
}

module.exports = {
  initializePaths,
  loadTrackedRecordsFromFile,
  saveTrackedRecordsToFile
};