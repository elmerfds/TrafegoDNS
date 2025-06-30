/**
 * Hostname Manager for DNS Record Tracker
 * Handles preserved and managed hostnames
 */
const logger = require('../logger');

/**
 * Load preserved hostnames from environment variable
 * @param {Object} config - Configuration object
 * @param {boolean} suppressLog - Whether to suppress the log message
 * @returns {Array} - Array of preserved hostname patterns
 */
function loadPreservedHostnames(config, suppressLog = false) {
  const hostnameStr = process.env.PRESERVED_HOSTNAMES || '';

  if (!hostnameStr) {
    logger.debug('No preserved hostnames configured');
    return [];
  }

  const hostnames = hostnameStr.split(',')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  // Only log if not suppressed - this allows us to delay the log message
  if (!suppressLog) {
    logger.info(`Loaded ${hostnames.length} preserved hostnames: ${hostnames.join(', ')}`);
  }

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
    
    for (const configStr of hostnameConfigs) {
      // Parse the configuration string - format: hostname:type:content:ttl:proxied
      const parts = configStr.split(':');
      
      if (parts.length < 2) {
        logger.warn(`Invalid managed hostname configuration: ${configStr} (format should be hostname:type[:content][:ttl][:proxied])`);
        continue;
      }
      
      const hostname = parts[0];
      const type = parts[1].toUpperCase();
      
      // Handle content with auto-detection for A and AAAA records
      let content;
      if (parts.length >= 3 && parts[2]) {
        content = parts[2];
      } else {
        // Auto-detect content based on record type
        if (type === 'CNAME') {
          content = config.getProviderDomain();
        } else if (type === 'AAAA') {
          content = config.getPublicIPv6Sync();
        } else if (type === 'A') {
          content = config.getPublicIPSync();
        } else {
          logger.warn(`Invalid managed hostname configuration: ${configStr} (${type} records require explicit content)`);
          continue;
        }
      }
      
      // Optional TTL - adjust index based on whether content was provided
      let ttl = config.defaultTTL || 1;
      const ttlIndex = parts.length >= 3 && parts[2] ? 3 : 2; // TTL is after content if provided, otherwise position 2
      if (parts.length > ttlIndex && !isNaN(parseInt(parts[ttlIndex]))) {
        ttl = parseInt(parts[ttlIndex]);
      }
      
      // Optional proxied flag (Cloudflare only) - adjust index based on whether content was provided
      let proxied = false;
      const proxiedIndex = parts.length >= 3 && parts[2] ? 4 : 3; // Proxied is after TTL
      if (parts.length > proxiedIndex) {
        proxied = parts[proxiedIndex].toLowerCase() === 'true';
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