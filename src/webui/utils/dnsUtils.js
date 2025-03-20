/**
 * Utility functions for DNS record management
 */

/**
 * Format TTL value for display
 * @param {number} ttl - TTL value in seconds
 * @returns {string} - Formatted TTL for display
 */
export const formatTTL = (ttl) => {
  if (ttl === 1) return 'Auto';
  
  if (ttl < 60) {
    return `${ttl} seconds`;
  } else if (ttl < 3600) {
    return `${Math.floor(ttl / 60)} minutes`;
  } else if (ttl < 86400) {
    return `${Math.floor(ttl / 3600)} hours`;
  } else {
    return `${Math.floor(ttl / 86400)} days`;
  }
};

/**
 * Get a color variant for a DNS record type
 * @param {string} recordType - DNS record type
 * @returns {string} - Bootstrap color variant
 */
export const getRecordTypeColor = (recordType) => {
  const typeColors = {
    'A': 'primary',
    'AAAA': 'secondary',
    'CNAME': 'info',
    'MX': 'warning',
    'TXT': 'danger',
    'SRV': 'success',
    'CAA': 'dark'
  };
  
  return typeColors[recordType] || 'primary';
};

/**
 * Check if a hostname is a subdomain of another domain
 * @param {string} hostname - Hostname to check
 * @param {string} domain - Domain to check against
 * @returns {boolean} - True if hostname is subdomain of domain
 */
export const isSubdomainOf = (hostname, domain) => {
  if (!hostname || !domain) return false;
  
  // Normalize domains
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  
  // Check if hostname ends with domain
  return normalizedHostname === normalizedDomain || 
         normalizedHostname.endsWith(`.${normalizedDomain}`);
};

/**
 * Check if a hostname matches a pattern (including wildcards)
 * @param {string} hostname - Hostname to check
 * @param {string} pattern - Pattern to match against (can include wildcards)
 * @returns {boolean} - True if hostname matches pattern
 */
export const hostnameMatchesPattern = (hostname, pattern) => {
  if (!hostname || !pattern) return false;
  
  // Normalize domains
  const normalizedHostname = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  
  // Exact match
  if (normalizedHostname === normalizedPattern) return true;
  
  // Wildcard match
  if (normalizedPattern.startsWith('*.')) {
    const domainPart = normalizedPattern.substring(2);
    return normalizedHostname.endsWith(domainPart) && 
           normalizedHostname.length > domainPart.length;
  }
  
  return false;
};

/**
 * Validate an IPv4 address
 * @param {string} ip - IPv4 address to validate
 * @returns {boolean} - True if valid IPv4 address
 */
export const isValidIPv4 = (ip) => {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
};

/**
 * Validate an IPv6 address (simple validation)
 * @param {string} ip - IPv6 address to validate
 * @returns {boolean} - True if valid IPv6 address
 */
export const isValidIPv6 = (ip) => {
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
};

/**
 * Validate a hostname
 * @param {string} hostname - Hostname to validate
 * @returns {boolean} - True if valid hostname
 */
export const isValidHostname = (hostname) => {
  return /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(hostname);
};
