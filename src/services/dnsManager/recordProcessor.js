/**
 * DNS Record Processor
 * Processes hostnames and prepares DNS records for batch processing
 */
const logger = require('../../utils/logger');
const { extractDnsConfigFromLabels } = require('../../utils/dns');

/**
 * Process a list of hostnames and prepare DNS records for creation/update
 * @param {Array<string>} hostnames - List of hostnames to process
 * @param {Object} containerLabels - Map of container IDs to their labels
 * @param {Object} config - Configuration manager instance
 * @param {Object} stats - Statistics tracking object
 * @returns {Array} Array of processed DNS record configurations
 */
async function processHostnames(hostnames, containerLabels, config, stats) {
  logger.debug(`Processing ${hostnames.length} hostnames`);
  
  // Track processed hostnames for cleanup
  const processedHostnames = [];
  
  // Collect all DNS record configurations to batch process
  const dnsRecordConfigs = [];
  
  // Process each hostname
  for (const hostname of hostnames) {
    try {
      stats.total++;
      
      // Find container labels for this hostname if possible
      const labels = containerLabels[hostname] || {};
      
      // Get label prefixes for easier reference
      const genericLabelPrefix = config.genericLabelPrefix;
      const providerLabelPrefix = config.dnsLabelPrefix;
      
      // Check if we should manage DNS based on global setting and labels
      // First check generic labels
      let manageLabel = labels[`${genericLabelPrefix}manage`];
      let skipLabel = labels[`${genericLabelPrefix}skip`];
      
      // Then check provider-specific labels which take precedence
      if (labels[`${providerLabelPrefix}manage`] !== undefined) {
        manageLabel = labels[`${providerLabelPrefix}manage`];
        logger.debug(`Found provider-specific manage label: ${providerLabelPrefix}manage=${manageLabel}`);
      }
      
      if (labels[`${providerLabelPrefix}skip`] !== undefined) {
        skipLabel = labels[`${providerLabelPrefix}skip`];
        logger.debug(`Found provider-specific skip label: ${providerLabelPrefix}skip=${skipLabel}`);
      }
      
      // Determine whether to manage this hostname's DNS
      let shouldManage = config.defaultManage;
      
      // If global setting is false (opt-in), check for explicit manage=true
      if (!shouldManage && manageLabel === 'true') {
        shouldManage = true;
        logger.debug(`Enabling DNS management for ${hostname} due to manage=true label`);
      }
      
      // Skip label always overrides (for backward compatibility)
      if (skipLabel === 'true') {
        shouldManage = false;
        logger.debug(`Skipping DNS management for ${hostname} due to skip=true label`);
      }
      
      // Skip to next hostname if we shouldn't manage this one
      if (!shouldManage) {
        continue;
      }
      
      // Create fully qualified domain name
      const fqdn = ensureFqdn(hostname, config.getProviderDomain());
      processedHostnames.push(fqdn);
      
      // Extract DNS configuration
      const recordConfig = extractDnsConfigFromLabels(
        labels, 
        config,
        fqdn
      );
      
      // Add to batch instead of processing immediately
      dnsRecordConfigs.push(recordConfig);
      
    } catch (error) {
      stats.errors++;
      logger.error(`Error processing hostname ${hostname}: ${error.message}`);
    }
  }
  
  return {
    processedHostnames,
    dnsRecordConfigs
  };
}

/**
 * Ensure a hostname is a fully qualified domain name
 */
function ensureFqdn(hostname, zone) {
  if (hostname.includes('.')) {
    return hostname;
  }
  return `${hostname}.${zone}`;
}

module.exports = {
  processHostnames,
  ensureFqdn
};