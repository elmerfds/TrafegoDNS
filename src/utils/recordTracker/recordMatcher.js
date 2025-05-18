/**
 * DNS Record Matcher
 * Utilities for improved matching between DNS records and containers/traefik routes
 */
const logger = require('../logger');

/**
 * Normalizes a hostname for comparison by removing trailing dots
 * and converting to lowercase
 * @param {string} hostname - The hostname to normalize
 * @returns {string} - Normalized hostname
 */
function normalizeHostname(hostname) {
  if (!hostname) return '';
  
  // Convert to string if it's an object
  if (typeof hostname !== 'string') {
    hostname = String(hostname);
  }
  
  // Trim whitespace and convert to lowercase
  hostname = hostname.trim().toLowerCase();
  
  // Remove trailing dots (used in some DNS contexts)
  while (hostname.endsWith('.')) {
    hostname = hostname.slice(0, -1);
  }
  
  return hostname;
}

/**
 * Creates a map of hostnames with their variations for efficient lookup
 * @param {string[]} hostnames - Array of hostnames
 * @param {string} baseDomain - Base domain for the provider (e.g., example.com)
 * @returns {Object} - Map of normalized hostnames with variations
 */
function createHostnameMap(hostnames, baseDomain) {
  const hostnameMap = new Map();
  const normalizedBaseDomain = normalizeHostname(baseDomain || '');
  
  // Ensure hostnames is iterable and handle null/undefined gracefully
  if (!hostnames || !Array.isArray(hostnames)) {
    logger.warn('Invalid hostnames array passed to createHostnameMap, using empty array');
    return hostnameMap;
  }
  
  hostnames.forEach(hostname => {
    // Skip null or undefined hostnames
    if (hostname === null || hostname === undefined) return;
  
    const normalizedHostname = normalizeHostname(hostname);
    
    // Skip empty hostnames
    if (!normalizedHostname) return;
    
    // Store the original form
    hostnameMap.set(normalizedHostname, hostname);
    
    // Skip domain-related processing if we don't have a base domain
    if (!normalizedBaseDomain) return;
    
    // Store without the domain if it's a subdomain
    if (normalizedHostname.endsWith(normalizedBaseDomain) && 
        normalizedHostname !== normalizedBaseDomain) {
      const withoutDomain = normalizedHostname.substring(
        0, 
        normalizedHostname.length - normalizedBaseDomain.length - 1
      );
      hostnameMap.set(withoutDomain, hostname);
    }
    
    // Store with the domain explicitly appended
    // Ensure normalizedHostname is a string before calling string methods
    if (typeof normalizedHostname === 'string' && 
        normalizedBaseDomain && 
        !normalizedHostname.endsWith(normalizedBaseDomain) &&
        !normalizedHostname.includes('.')) {
      const withDomain = `${normalizedHostname}.${normalizedBaseDomain}`;
      hostnameMap.set(withDomain, hostname);
    }
  });
  
  return hostnameMap;
}

/**
 * Find a matching hostname for a DNS record in a list of active hostnames
 * Uses multiple matching strategies for better accuracy
 * @param {Object} record - The DNS record to match
 * @param {Map} hostnameMap - Map of normalized hostnames with variations
 * @param {string} baseDomain - Base domain for the provider
 * @returns {string|null} - Matching hostname or null if no match
 */
function findMatchingHostname(record, hostnameMap, baseDomain) {
  if (!record || !record.name) return null;
  
  const normalizedBaseDomain = normalizeHostname(baseDomain);
  
  // Try different variations of the record name for matching
  
  // 1. Try the record name directly
  const directName = normalizeHostname(record.name);
  if (hostnameMap.has(directName)) {
    return hostnameMap.get(directName);
  }
  
  // 2. If the record name is '@', try the base domain
  if (record.name === '@' && hostnameMap.has(normalizedBaseDomain)) {
    return hostnameMap.get(normalizedBaseDomain);
  }
  
  // 3. Try with the domain explicitly appended
  const withDomain = `${directName}.${normalizedBaseDomain}`;
  if (hostnameMap.has(withDomain)) {
    return hostnameMap.get(withDomain);
  }
  
  // 4. If the record name already includes the domain, try extracting subdomain part
  if (directName.endsWith(normalizedBaseDomain) && directName !== normalizedBaseDomain) {
    const subdomain = directName.substring(0, directName.length - normalizedBaseDomain.length - 1);
    if (hostnameMap.has(subdomain)) {
      return hostnameMap.get(subdomain);
    }
  }
  
  // No match found after trying all variations
  return null;
}

/**
 * Determine if a record is managed by our application
 * Considers both metadata and legacy indicators
 * @param {Object} record - The DNS record to check
 * @param {Object} recordTracker - The record tracker instance
 * @param {string} dnsProvider - The DNS provider name
 * @returns {Promise<boolean>} - Whether the record is app-managed
 */
async function isAppManagedRecord(record, recordTracker, dnsProvider) {
  // Check metadata in SQLite first if available
  if (recordTracker.sqliteManager && 
      recordTracker.sqliteManager.repository && 
      recordTracker.sqliteManager.repository.isAppManaged) {
    try {
      const isAppManaged = await recordTracker.sqliteManager.repository.isAppManaged(
        dnsProvider, record.id
      );
      
      if (isAppManaged) {
        return true;
      }
    } catch (error) {
      logger.debug(`Failed to check app-managed status in SQLite: ${error.message}`);
    }
  }
  
  // Check in-memory data structure (JSON fallback)
  try {
    const recordData = recordTracker.data?.providers?.[dnsProvider]?.records?.[record.id];
    if (recordData && recordData.metadata && recordData.metadata.appManaged === true) {
      return true;
    }
  } catch (error) {
    logger.debug(`Failed to check app-managed status in memory: ${error.message}`);
  }
  
  // Check legacy indicators (Cloudflare comment)
  if (dnsProvider === 'cloudflare' && 
      (record.comment === 'Managed by Traefik DNS Manager' || 
       record.comment === 'Managed by TráfegoDNS')) {
    return true;
  }
  
  // Not app-managed
  return false;
}

module.exports = {
  normalizeHostname,
  createHostnameMap,
  findMatchingHostname,
  isAppManagedRecord
};