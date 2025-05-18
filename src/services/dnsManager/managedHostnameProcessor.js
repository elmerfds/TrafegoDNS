/**
 * Managed Hostname Processor
 * Processes manually configured hostnames
 */
const logger = require('../../utils/logger');

/**
 * Process managed hostnames and ensure they exist
 * @param {Object} dnsProvider - DNS provider instance
 * @param {Object} recordTracker - Record tracker instance
 */
async function processManagedHostnames(dnsProvider, recordTracker) {
  // Add defensive checks for null/undefined recordTracker
  if (!recordTracker) {
    logger.warn('Record tracker is undefined or null, cannot process managed hostnames');
    return { success: false, error: 'Record tracker not initialized' };
  }
  
  // Ensure managedHostnames exists and is an array
  if (!recordTracker.managedHostnames) {
    logger.debug('managedHostnames property does not exist, initializing as empty array');
    recordTracker.managedHostnames = [];
  } else if (!Array.isArray(recordTracker.managedHostnames)) {
    logger.warn('managedHostnames is not an array, converting to array');
    try {
      // Try to convert to array if possible
      recordTracker.managedHostnames = Array.from(recordTracker.managedHostnames);
    } catch (error) {
      logger.error(`Could not convert managedHostnames to array: ${error.message}`);
      recordTracker.managedHostnames = [];
    }
  }
  
  // Now check for empty managed hostnames
  if (recordTracker.managedHostnames.length === 0) {
    logger.debug('No managed hostnames to process');
    return { success: true, processed: 0 };
  }
  
  logger.info(`Processing ${recordTracker.managedHostnames.length} manually managed hostnames`);
  
  // Collect DNS record configurations
  const dnsRecordConfigs = [];
  
  // Process each managed hostname
  for (const config of recordTracker.managedHostnames) {
    try {
      // Create a record configuration
      const recordConfig = {
        type: config.type,
        name: config.hostname,
        content: config.content,
        ttl: config.ttl
      };
      
      // Add proxied flag for Cloudflare with thorough null/undefined checks
      if (config && config.provider && typeof config.provider === 'string' && 
          config.type && typeof config.type === 'string' && 
          config.provider === 'cloudflare' && 
          ['A', 'AAAA', 'CNAME'].includes(config.type)) {
        recordConfig.proxied = config.proxied !== undefined ? config.proxied : false;
      }
      
      // Add to batch process list
      dnsRecordConfigs.push(recordConfig);
      
      logger.debug(`Added managed hostname to processing: ${config.hostname} (${config.type})`);
    } catch (error) {
      logger.error(`Error processing managed hostname ${config.hostname}: ${error.message}`);
    }
  }
  
  // Batch process all DNS records
  if (dnsRecordConfigs.length > 0) {
    logger.debug(`Batch processing ${dnsRecordConfigs.length} managed DNS records`);
    
    try {
      // Verify dnsProvider exists and has the batchEnsureRecords method
      if (!dnsProvider) {
        logger.error('DNS Provider is null or undefined, cannot process managed hostnames');
        return { success: false, error: 'DNS Provider not initialized' };
      }
      
      if (typeof dnsProvider.batchEnsureRecords !== 'function') {
        logger.error('DNS Provider missing batchEnsureRecords method, cannot process managed hostnames');
        return { success: false, error: 'DNS Provider missing required methods' };
      }
      
      // Process the records
      const processedRecords = await dnsProvider.batchEnsureRecords(dnsRecordConfigs);
      
      // Ensure processedRecords is an array
      const records = Array.isArray(processedRecords) ? processedRecords : [];
      
      // Track created/updated records
      let trackedCount = 0;
      if (records.length > 0) {
        for (const record of records) {
          // Only track records that have an ID (successfully created/updated)
          if (record && record.id) {
            try {
              // Check if this is a new record or just an update
              const isTracked = await recordTracker.isTracked(record);
              
              if (isTracked) {
                // Update the tracked record with the latest ID
                await recordTracker.updateRecordId(record, record);
              } else {
                // Track new record and always mark as app-managed (true)
                await recordTracker.trackRecord(record, true);
              }
              trackedCount++;
            } catch (trackError) {
              logger.error(`Error tracking record ${record.name}: ${trackError.message}`);
            }
          }
        }
      }
      
      logger.info(`Successfully processed ${records.length} managed hostnames (tracked ${trackedCount})`);
      return { 
        success: true, 
        processed: records.length,
        tracked: trackedCount,
        records: records
      };
    } catch (error) {
      logger.error(`Error batch processing managed hostnames: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  return [];
}

module.exports = {
  processManagedHostnames
};