/**
 * Error handling utilities for Route53 provider
 */
const logger = require('../../utils/logger');

/**
 * Analyze a Route53 batch operation error and categorize it
 * @param {Error} error - The error object from AWS API
 * @returns {Object} - Categorized error information with affected records
 */
function analyzeBatchError(error) {
  // Default error category
  let category = 'UNKNOWN_ERROR';
  let message = error.message;
  let affectedRecords = [];
  let shouldRetryIndividually = true;
  let logLevel = 'error'; // Default log level
  
  // Check if this is a ServiceException or another AWS-specific error type
  if (error.name === 'InvalidChangeBatch') {
    category = 'INVALID_CHANGE_BATCH';
    
    // Extract specific record information from the error message
    const recordPattern = /resource record set ['"]([A-Z]+)\s+([^'"]+)['"]/g;
    let match;
    
    while ((match = recordPattern.exec(message)) !== null) {
      const recordType = match[1];
      const recordName = match[2];
      affectedRecords.push({ type: recordType, name: recordName });
    }
    
    // Check if the error is about records already existing
    if (message.includes('already exists')) {
      category = 'RECORD_EXISTS';
      shouldRetryIndividually = false; // No need to retry, just fetch existing records
      logLevel = 'debug'; // Downgrade to debug since this is an expected condition
    }
    // Check if the error is about invalid changes
    else if (message.includes('invalid set of changes')) {
      category = 'RECORD_CONFLICT';
      shouldRetryIndividually = true; // Try individual processing
    }
  } 
  // Handle throttling errors (rate limits)
  else if (error.name === 'Throttling' || message.includes('Rate exceeded')) {
    category = 'RATE_LIMIT';
    shouldRetryIndividually = true;
    logLevel = 'warn';
  }
  // Handle authentication/authorization errors
  else if (error.name === 'AccessDenied' || error.name === 'InvalidSignature') {
    category = 'AUTH_ERROR';
    shouldRetryIndividually = false; // Auth errors won't be fixed by retrying
  }
  
  return {
    category,
    message,
    affectedRecords,
    shouldRetryIndividually,
    logLevel,
    originalError: error
  };
}

module.exports = {
  analyzeBatchError
};