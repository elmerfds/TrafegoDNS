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
 * Load tracked records from file
 * @param {string} trackerFile - Path to the tracker file
 * @param {string} legacyTrackerFile - Path to the legacy tracker file
 * @param {string} provider - Current DNS provider name
 * @returns {Object} - Loaded records data
 */
function loadTrackedRecordsFromFile(trackerFile, legacyTrackerFile, provider) {
  let data = { providers: {} };
  
  // Check for the new location first
  if (fs.existsSync(trackerFile)) {
    try {
      const fileContent = fs.readFileSync(trackerFile, 'utf8');
      data = JSON.parse(fileContent);
      logger.debug(`Loaded ${Object.keys(data.providers || {}).length} providers from tracking file`);
    } catch (error) {
      logger.error(`Failed to load tracked records: ${error.message}`);
    }
  } 
  // Check for legacy location if new one doesn't exist
  else if (fs.existsSync(legacyTrackerFile)) {
    try {
      const fileContent = fs.readFileSync(legacyTrackerFile, 'utf8');
      data = JSON.parse(fileContent);
      
      // Move the file to the new location
      try {
        fs.writeFileSync(trackerFile, fileContent, 'utf8');
        logger.info(`Migrated record tracking file to ${trackerFile}`);
        
        // Try to remove the old file
        fs.unlinkSync(legacyTrackerFile);
        logger.debug('Removed legacy tracking file after migration');
      } catch (moveError) {
        logger.warn(`Failed to migrate tracking file: ${moveError.message}`);
      }
    } catch (error) {
      logger.error(`Failed to load tracked records from legacy location: ${error.message}`);
    }
  }
  
  // Ensure data structure exists
  if (!data.providers) {
    data.providers = {};
  }
  
  // Ensure the current provider exists
  if (!data.providers[provider]) {
    data.providers[provider] = { records: {} };
  }
  
  // Ensure records structure exists
  if (!data.providers[provider].records) {
    data.providers[provider].records = {};
  }
  
  return data;
}

/**
 * Save tracked records to file
 * @param {string} trackerFile - Path to the tracker file
 * @param {Object} data - Data to save
 */
function saveTrackedRecordsToFile(trackerFile, data) {
  try {
    // Check for environment variable to disable JSON file storage
    const disableJsonStorage = process.env.DISABLE_JSON_STORAGE === 'true';
    if (disableJsonStorage) {
      logger.debug('JSON file storage is disabled by configuration');
      return;
    }
    
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(trackerFile, jsonData, 'utf8');
    logger.debug('Saved tracked records to JSON file (fallback storage)');
  } catch (error) {
    logger.error(`Failed to save tracked records to JSON: ${error.message}`);
  }
}

module.exports = {
  initializePaths,
  loadTrackedRecordsFromFile,
  saveTrackedRecordsToFile
};