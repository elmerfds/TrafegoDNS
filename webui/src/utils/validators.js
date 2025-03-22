// src/utils/validators.js

/**
 * Validate an IPv4 address
 * 
 * @param {string} ip - IP address to validate
 * @returns {boolean} - Whether the IP is valid
 */
export const isValidIPv4 = (ip) => {
    if (!ip) return false;
    
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) return false;
    
    // Check each octet
    const octets = ip.split('.');
    return octets.every(octet => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  };
  
  /**
   * Basic validation for IPv6 address
   * 
   * @param {string} ip - IP address to validate
   * @returns {boolean} - Whether the IP is valid
   */
  export const isValidIPv6 = (ip) => {
    if (!ip) return false;
    
    // Basic check if it contains at least one colon
    return ip.includes(':');
  };
  
  /**
   * Validate a domain name
   * 
   * @param {string} domain - Domain to validate
   * @returns {boolean} - Whether the domain is valid
   */
  export const isValidDomain = (domain) => {
    if (!domain) return false;
    
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    return domainRegex.test(domain);
  };
  
  /**
   * Validate email address
   * 
   * @param {string} email - Email to validate
   * @returns {boolean} - Whether the email is valid
   */
  export const isValidEmail = (email) => {
    if (!email) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };