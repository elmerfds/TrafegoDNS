/**
 * Provider Checker
 * Utility to ensure provider field is always properly set
 */
const logger = require('../logger');

/**
 * Ensure a provider value is never null or undefined
 * @param {*} provider - Provider value to check
 * @param {string} defaultValue - Default value to use if provider is missing
 * @param {string} context - Context for logging
 * @returns {string} - Valid provider value
 */
function ensureValidProvider(provider, defaultValue = 'unknown', context = '') {
  if (!provider) {
    const contextMsg = context ? ` [${context}]` : '';
    logger.warn(`Provider is undefined/null${contextMsg} - using default "${defaultValue}"`);
    return defaultValue;
  }
  
  return provider;
}

/**
 * Ensure a record has a valid provider field
 * @param {Object} record - Record to check and update
 * @param {string} defaultValue - Default provider value
 * @param {string} context - Context for logging
 * @returns {Object} - Record with valid provider
 */
function ensureRecordHasProvider(record, defaultValue = 'unknown', context = '') {
  if (!record) return null;
  
  const updatedRecord = { ...record };
  
  if (!updatedRecord.provider) {
    const contextMsg = context ? ` [${context}]` : '';
    logger.warn(`Record missing provider${contextMsg} - using default "${defaultValue}"`);
    updatedRecord.provider = defaultValue;
  }
  
  return updatedRecord;
}

module.exports = {
  ensureValidProvider,
  ensureRecordHasProvider
};