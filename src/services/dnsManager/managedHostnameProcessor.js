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
  if (!recordTracker.managedHostnames || recordTracker.managedHostnames.length === 0) {
    logger.debug('No managed hostnames to process');
    return;
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
      
      // Add proxied flag for Cloudflare
      if (config.provider === 'cloudflare' && ['A', 'AAAA', 'CNAME'].includes(config.type)) {
        recordConfig.proxied = config.proxied;
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
      const processedRecords = await dnsProvider.batchEnsureRecords(dnsRecordConfigs);
      
      // Track created/updated records
      if (processedRecords && processedRecords.length > 0) {
        for (const record of processedRecords) {
          // Only track records that have an ID (successfully created/updated)
          if (record && record.id) {
            // Check if this is a new record or just an update
            const isTracked = recordTracker.isTracked(record);
            
            if (isTracked) {
              // Update the tracked record with the latest ID
              recordTracker.updateRecordId(record, record);
            } else {
              // Track new record
              recordTracker.trackRecord(record);
            }
          }
        }
      }
      
      logger.success(`Successfully processed ${processedRecords.length} managed hostnames`);
      return processedRecords;
    } catch (error) {
      logger.error(`Error batch processing managed hostnames: ${error.message}`);
      throw error;
    }
  }
  
  return [];
}

module.exports = {
  processManagedHostnames
};