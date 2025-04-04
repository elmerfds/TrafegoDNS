/**
 * DNS-related utility functions
 */
const logger = require('./logger');
const { LOG_LEVELS } = require('./logger');

/**
 * Check if a hostname is an apex/root domain
 * @param {string} hostname - The hostname to check
 * @param {string} zone - The zone name
 * @returns {boolean} - True if the hostname is an apex domain
 */
function isApexDomain(hostname, zone) {
  logger.trace(`dns.isApexDomain: Checking if ${hostname} is apex domain for zone ${zone}`);
  
  // Remove trailing dot if present
  const cleanHostname = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  const cleanZone = zone.endsWith('.') ? zone.slice(0, -1) : zone;
  
  logger.trace(`dns.isApexDomain: Cleaned hostname: ${cleanHostname}, cleaned zone: ${cleanZone}`);
  
  // If the hostname equals the zone, it's an apex domain
  const isApex = cleanHostname === cleanZone;
  logger.trace(`dns.isApexDomain: Result: ${isApex}`);
  
  return isApex;
}

/**
 * Check if a hostname is an IPv4 address
 * @param {string} hostname - The hostname to check
 * @returns {boolean} - True if the hostname is an IPv4 address
 */
function isIPv4Address(hostname) {
  logger.trace(`dns.isIPv4Address: Checking if ${hostname} is an IPv4 address`);

  const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
  const isIPv4 = ipv4Regex.test(hostname);

  logger.trace(`dns.isIPv4Address: Result: ${isIPv4}`);

  return isIPv4;
}

/**
 * Check if a hostname is an IPv6 address
 * @param {string} hostname - The hostname to check
 * @returns {boolean} - True if the hostname is an IPv6 address
 */
function isIPv6Address(hostname) {
  logger.trace(`dns.isIPv6Address: Checking if ${hostname} is an IPv6 address`);

  const ipv6Regex = /^(?:(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,7}:|(?:[A-Fa-f0-9]{1,4}:){1,6}:[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,5}(?::[A-Fa-f0-9]{1,4}){1,2}|(?:[A-Fa-f0-9]{1,4}:){1,4}(?::[A-Fa-f0-9]{1,4}){1,3}|(?:[A-Fa-f0-9]{1,4}:){1,3}(?::[A-Fa-f0-9]{1,4}){1,4}|(?:[A-Fa-f0-9]{1,4}:){1,2}(?::[A-Fa-f0-9]{1,4}){1,5}|[A-Fa-f0-9]{1,4}:(?:(?::[A-Fa-f0-9]{1,4}){1,6})|:(?:(?::[A-Fa-f0-9]{1,4}){1,7}|:))$/;
  const isIPv6 = ipv6Regex.test(hostname);

  logger.trace(`dns.isIPv6Address: Result: ${isIPv6}`);

  return isIPv6;
}

/**
 * Get label value with provider-specific precedence
 * @param {Object} labels - Container labels
 * @param {string} genericPrefix - Generic label prefix 
 * @param {string} providerPrefix - Provider-specific label prefix
 * @param {string} key - Label key (without prefix)
 * @param {*} defaultValue - Default value if label not found
 * @returns {*} - Label value
 */
function getLabelValue(labels, genericPrefix, providerPrefix, key, defaultValue) {
  // First check provider-specific label
  if (labels[`${providerPrefix}${key}`] !== undefined) {
    return labels[`${providerPrefix}${key}`];
  }
  
  // Then check generic label
  if (labels[`${genericPrefix}${key}`] !== undefined) {
    return labels[`${genericPrefix}${key}`];
  }
  
  // Return default if no label found
  return defaultValue;
}

/**
 * Get the minimum TTL value for a specific DNS provider
 * @param {string} provider - The DNS provider name
 * @returns {number} - The minimum TTL value in seconds
 */
function getMinimumTTL(provider) {
  switch (provider.toLowerCase()) {
    case 'cloudflare':
      return 1;  // Cloudflare supports TTL as low as 1 second (Auto)
    case 'digitalocean':
      return 30;  // DigitalOcean minimum TTL is 30 seconds
    case 'route53':
      return 60;  // Route53 minimum TTL is 60 seconds
    default:
      return 1;  // Default minimum
  }
}

/**
 * Extract DNS configuration from container labels
 */
function extractDnsConfigFromLabels(labels, config, hostname) {
  logger.trace(`dns.extractDnsConfigFromLabels: Extracting DNS config for ${hostname}`);
  logger.trace(`dns.extractDnsConfigFromLabels: Label count: ${Object.keys(labels).length}`);
  
  if (logger.level >= LOG_LEVELS.TRACE) {
    // In TRACE mode, log all DNS-related labels
    const dnsLabels = Object.entries(labels)
      .filter(([key]) => key.startsWith(config.genericLabelPrefix) || key.startsWith(config.dnsLabelPrefix))
      .map(([key, value]) => `${key}=${value}`);
      
    logger.trace(`dns.extractDnsConfigFromLabels: DNS-related labels: ${dnsLabels.length ? dnsLabels.join(', ') : 'none'}`);
  }
  
  const genericPrefix = config.genericLabelPrefix;
  const providerPrefix = config.dnsLabelPrefix;
  
  // Check if this is an apex domain
  const isApex = isApexDomain(hostname, config.getProviderDomain());
  
  // Determine record type - first from specific labels, then from default
  const recordTypeLabel = getLabelValue(labels, genericPrefix, providerPrefix, 'type', null);
  let recordType = recordTypeLabel || (isApex ? 'A' : config.defaultRecordType);
  
  logger.trace(`dns.extractDnsConfigFromLabels: Using record type: ${recordType} (from ${recordTypeLabel ? 'label' : 'default'})`);
  
  // Get defaults for this record type
  const defaults = config.getDefaultsForType(recordType);
  logger.trace(`dns.extractDnsConfigFromLabels: Using defaults for type ${recordType}: ${JSON.stringify(defaults)}`);
  
  // Build basic record config
  const recordConfig = {
    type: recordType,
    name: hostname,
    ttl: parseInt(getLabelValue(labels, genericPrefix, providerPrefix, 'ttl', defaults.ttl), 10)
  };
  
  // Handle content based on record type and apex status
  let content = getLabelValue(labels, genericPrefix, providerPrefix, 'content', null);
  
  // If content isn't specified in labels
  if (!content) {
    if (isApex && (recordType === 'CNAME' || recordType === 'A')) {
      // For apex domains, we should use an A record
      recordConfig.type = 'A';
      logger.trace(`dns.extractDnsConfigFromLabels: Converting to A record for apex domain`);
      
      // Get IP if available, otherwise set flag for async IP lookup
      const ip = config.getPublicIPSync();
      if (ip) {
        recordConfig.content = ip;
        logger.trace(`dns.extractDnsConfigFromLabels: Using IP from cache: ${ip}`);
      } else {
        // Flag this record as needing async IP lookup
        recordConfig.needsIpLookup = true;
        recordConfig.content = 'pending'; // Temporary placeholder
        logger.trace(`dns.extractDnsConfigFromLabels: Flagging for async IP lookup`);
      }
      
      logger.debug(`Apex domain detected for ${hostname}, using A record with IP: ${recordConfig.content || 'to be determined'}`);
    } else {
      recordConfig.content = defaults.content;
      logger.trace(`dns.extractDnsConfigFromLabels: Using default content: ${defaults.content}`);
    }
  } else {
    recordConfig.content = content;
    logger.trace(`dns.extractDnsConfigFromLabels: Using label-specified content: ${content}`);
  }

  const isIPv4 = isIPv4Address(recordConfig.content);
  if (isIPv4 && !recordTypeLabel && recordConfig.type === 'CNAME') {
    // The record type is CNAME by default (not given by label) but the content is IPV4 which isn't supported
    recordConfig.type = 'A';
    logger.debug(`IPv4 address (${recordConfig.content}) content detected for ${hostname}, using A record instead of CNAME`);
  }

  const isIPv6 = isIPv6Address(recordConfig.content);
  if (isIPv6 && !recordTypeLabel && recordConfig.type === 'CNAME') {
    // The record type is CNAME by default (not given by label) but the content is IPV6 which isn't supported
    recordConfig.type = 'AAAA';
    logger.debug(`IPv6 address (${recordConfig.content}) content detected for ${hostname}, using AAAA record instead of CNAME`);
  }
  
  // Handle proxied status ONLY for providers that support it (Cloudflare)
  if (['A', 'AAAA', 'CNAME'].includes(recordConfig.type) && config.dnsProvider === 'cloudflare') {
    const proxiedLabel = getLabelValue(labels, genericPrefix, providerPrefix, 'proxied', null);
    logger.debug(`Processing proxied status for ${hostname}: Label value = ${proxiedLabel}`);
    
    // Create a simple cache to track if we've already logged this hostname's proxied status
    if (!global.proxiedStatusCache) {
      global.proxiedStatusCache = {};
    }
    
    const previousValue = global.proxiedStatusCache[hostname];
    
    if (proxiedLabel !== null) {
      // Explicitly check against string 'false' to ensure proper conversion to boolean
      // This is a critical conversion point - must be clear and reliable
      if (proxiedLabel === 'false') {
        recordConfig.proxied = false;
        
        // Only log at INFO level the first time or if value changed from true
        if (previousValue === undefined || previousValue === true) {
          logger.info(`🔒 DNS record for ${hostname}: Setting proxied=false from label`);
        } else {
          // Use debug level for repeated information
          logger.debug(`DNS record for ${hostname}: Setting proxied=false from label (unchanged)`);
        }
        
        // Update the cache
        global.proxiedStatusCache[hostname] = false;
      } else {
        recordConfig.proxied = true;
        
        // Only log at INFO if value changed from false to true
        if (previousValue === false) {
          logger.info(`DNS record for ${hostname}: Setting proxied=true from label (changed from false)`);
        } else {
          logger.debug(`DNS record for ${hostname}: Setting proxied=true from label value '${proxiedLabel}'`);
        }
        
        // Update the cache
        global.proxiedStatusCache[hostname] = true;
      }
    } else {
      recordConfig.proxied = defaults.proxied;
      
      // Only log at INFO if previously had explicit value
      if (previousValue !== undefined) {
        logger.info(`DNS record for ${hostname}: Reverting to default proxied=${defaults.proxied} (had explicit setting before)`);
      } else {
        logger.debug(`DNS record for ${hostname}: Using default proxied=${defaults.proxied}`);
      }
      
      // Update the cache
      global.proxiedStatusCache[hostname] = undefined;
    }
  }
  
  // Add type-specific fields
  switch (recordConfig.type) {
    case 'MX':
      recordConfig.priority = parseInt(
        getLabelValue(labels, genericPrefix, providerPrefix, 'priority', defaults.priority), 
        10
      );
      logger.trace(`dns.extractDnsConfigFromLabels: MX priority set to ${recordConfig.priority}`);
      break;
      
    case 'SRV':
      recordConfig.priority = parseInt(
        getLabelValue(labels, genericPrefix, providerPrefix, 'priority', defaults.priority), 
        10
      );
      recordConfig.weight = parseInt(
        getLabelValue(labels, genericPrefix, providerPrefix, 'weight', defaults.weight), 
        10
      );
      recordConfig.port = parseInt(
        getLabelValue(labels, genericPrefix, providerPrefix, 'port', defaults.port), 
        10
      );
      logger.trace(`dns.extractDnsConfigFromLabels: SRV fields - priority: ${recordConfig.priority}, weight: ${recordConfig.weight}, port: ${recordConfig.port}`);
      break;
      
    case 'CAA':
      recordConfig.flags = parseInt(
        getLabelValue(labels, genericPrefix, providerPrefix, 'flags', defaults.flags), 
        10
      );
      recordConfig.tag = getLabelValue(labels, genericPrefix, providerPrefix, 'tag', defaults.tag);
      logger.trace(`dns.extractDnsConfigFromLabels: CAA fields - flags: ${recordConfig.flags}, tag: ${recordConfig.tag}`);
      break;
  }
  
  logger.trace(`dns.extractDnsConfigFromLabels: Final record config: ${JSON.stringify(recordConfig)}`);
  return recordConfig;
}

module.exports = {
  isApexDomain,
  extractDnsConfigFromLabels,
  getLabelValue,
  getMinimumTTL
};