/**
 * Hostname Manager for DNS Record Tracker
 * Handles preserved and managed hostnames
 */
const logger = require('../logger');

/**
 * Load preserved hostnames from environment variable
 * @param {Object} config - Configuration object
 * @returns {Array} - Array of preserved hostname patterns
 */
function loadPreservedHostnames(config) {
  const hostnameStr = process.env.PRESERVED_HOSTNAMES || '';
  
  if (!hostnameStr) {
    logger.debug('No preserved hostnames configured');
    return [];
  }
  
  const hostnames = hostnameStr.split(',')
    .map(h => h.trim())
    .filter(h => h.length > 0);
  
  logger.info(`Loaded ${hostnames.length} preserved hostnames: ${hostnames.join(', ')}`);
  return hostnames;
}

/**
 * Check if a hostname should be preserved (not deleted during cleanup)
 * @param {Array} preservedHostnames - Array of preserved hostname patterns
 * @param {string} hostname - Hostname to check
 * @returns {boolean} - Whether the hostname should be preserved
 */
function shouldPreserveHostname(preservedHostnames, hostname) {
  if (!hostname || !preservedHostnames || !Array.isArray(preservedHostnames)) {
    return false;
  }
  
  // Normalize for case-insensitive comparison
  const normalizedHostname = hostname.toLowerCase();
  
  for (const pattern of preservedHostnames) {
    // Check for wildcard patterns
    if (pattern.startsWith('*.')) {
      const suffix = pattern.substring(1); // Extract the part after *
      
      if (normalizedHostname.endsWith(suffix.toLowerCase())) {
        logger.trace(`Hostname ${hostname} matches wildcard pattern ${pattern}`);
        return true;
      }
    } 
    // Exact match
    else if (pattern.toLowerCase() === normalizedHostname) {
      logger.trace(`Hostname ${hostname} exactly matches preserved pattern ${pattern}`);
      return true;
    }
  }
  
  return false;
}

/**
 * Load managed hostnames from environment variable
 * @param {Object} config - Configuration object
 * @returns {Array} - Array of managed hostname objects
 */
function loadManagedHostnames(config) {
  const managedHostnamesStr = process.env.MANAGED_HOSTNAMES || '';
  
  if (!managedHostnamesStr) {
    logger.debug('No managed hostnames configured');
    return [];
  }
  
  try {
    // Split string on commas
    const hostnameConfigs = managedHostnamesStr.split(',')
      .map(h => h.trim())
      .filter(h => h.length > 0);
    
    const managedHostnames = [];
    
    for (const config of hostnameConfigs) {
      // Parse the configuration string - format: hostname:type:content:ttl:proxied
      const parts = config.split(':');
      
      if (parts.length < 3) {
        logger.warn(`Invalid managed hostname configuration: ${config} (format should be hostname:type:content[:ttl][:proxied])`);
        continue;
      }
      
      const hostname = parts[0];
      const type = parts[1].toUpperCase();
      const content = parts[2];
      
      // Optional TTL
      let ttl = config.defaultTTL || 1;
      if (parts.length > 3 && !isNaN(parseInt(parts[3]))) {
        ttl = parseInt(parts[3]);
      }
      
      // Optional proxied flag (Cloudflare only)
      let proxied = false;
      if (parts.length > 4) {
        proxied = parts[4].toLowerCase() === 'true';
      }
      
      managedHostnames.push({
        hostname,
        type,
        content,
        ttl,
        proxied,
        provider: config.dnsProvider
      });
      
      logger.debug(`Loaded managed hostname: ${hostname} (${type})`);
    }
    
    logger.info(`Loaded ${managedHostnames.length} managed hostnames`);
    return managedHostnames;
  } catch (error) {
    logger.error(`Error parsing managed hostnames: ${error.message}`);
    return [];
  }
}

module.exports = {
  loadPreservedHostnames,
  shouldPreserveHostname,
  loadManagedHostnames
};