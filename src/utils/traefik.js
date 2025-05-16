/**
 * Traefik-related utility functions
 */
const logger = require('./logger');

/**
 * Extract hostnames from a Traefik router rule
 * Supports both v1 and v2 formats
 * @param {string} rule - Traefik router rule
 * @returns {Array<string>} - Array of extracted hostnames
 */
function extractHostnamesFromRule(rule) {
  // Safety check for invalid inputs
  if (!rule || typeof rule !== 'string') {
    logger.warn(`traefik.extractHostnamesFromRule: Invalid rule provided: ${typeof rule}`);
    return [];
  }
  
  logger.trace(`traefik.extractHostnamesFromRule: Extracting hostnames from rule: ${rule}`);
  
  try {
    const hostnames = [];
    
    // Handle Traefik v2 format: Host(`example.com`)
    const v2HostRegex = /Host\(`([^`]+)`\)/g;
    let match;
    
    while ((match = v2HostRegex.exec(rule)) !== null) {
      if (match[1]) {
        logger.trace(`traefik.extractHostnamesFromRule: Found v2 hostname: ${match[1]}`);
        hostnames.push(match[1]);
      }
    }
    
    // Handle Traefik v1 format: Host:example.com
    const v1HostRegex = /Host:([a-zA-Z0-9.-]+)/g;
    
    while ((match = v1HostRegex.exec(rule)) !== null) {
      if (match[1]) {
        logger.trace(`traefik.extractHostnamesFromRule: Found v1 hostname: ${match[1]}`);
        hostnames.push(match[1]);
      }
    }
    
    // Return empty array immediately if no hostnames found
    if (hostnames.length === 0) {
      logger.trace(`traefik.extractHostnamesFromRule: No hostnames found in rule`);
      return [];
    }
    
    logger.trace(`traefik.extractHostnamesFromRule: Extracted ${hostnames.length} hostnames: ${hostnames.join(', ')}`);
    return hostnames;
  } catch (error) {
    logger.error(`traefik.extractHostnamesFromRule: Error extracting hostnames: ${error.message}`);
    return [];
  }
}

/**
 * Find labels for a router by looking at container label cache
 * @param {Object} router - Traefik router object
 * @param {Object} containerLabelsCache - Cache of container labels
 * @param {string} traefikLabelPrefix - Prefix for Traefik labels
 * @returns {Object} - Labels for the router
 */
function findLabelsForRouter(router, containerLabelsCache, traefikLabelPrefix) {
  // Start with empty labels
  const labels = {};
  
  // Defensive checks for all parameters
  if (!router || typeof router !== 'object') {
    logger.debug('findLabelsForRouter: Invalid router object provided');
    return labels;
  }
  
  if (!containerLabelsCache || typeof containerLabelsCache !== 'object') {
    logger.debug('findLabelsForRouter: Invalid container labels cache provided');
    return labels;
  }
  
  if (!traefikLabelPrefix) {
    logger.debug('findLabelsForRouter: No Traefik label prefix provided, using default');
    traefikLabelPrefix = 'traefik.';
  }
  
  try {
    // Check if router has a related container
    const service = router.service;
    const routerName = router.name || 'unknown';
    
    if (service) {
      // Try to find container by service name using safe iteration
      try {
        Object.entries(containerLabelsCache).forEach(([key, containerLabels]) => {
          if (!containerLabels || typeof containerLabels !== 'object') {
            return; // Skip invalid label objects
          }
          
          // Various ways a container might be related to this router
          if (
            key === service || 
            containerLabels[`${traefikLabelPrefix}http.routers.${routerName}.service`] === service ||
            containerLabels[`${traefikLabelPrefix}http.services.${service}.loadbalancer.server.port`]
          ) {
            // Merge labels
            Object.assign(labels, containerLabels);
          }
        });
      } catch (iterationError) {
        logger.warn(`findLabelsForRouter: Error iterating container labels: ${iterationError.message}`);
      }
    }
  } catch (error) {
    logger.error(`findLabelsForRouter: Unexpected error: ${error.message}`);
  }
  
  return labels;
}

/**
 * Parse and extract service name from router
 * @param {Object} router - Traefik router object
 * @returns {string|null} - Service name or null if not found
 */
function extractServiceName(router) {
  try {
    // Comprehensive safety check
    if (!router || typeof router !== 'object') {
      return null;
    }
    
    if (!router.service || typeof router.service !== 'string' || router.service.trim() === '') {
      return null;
    }
    
    return router.service;
  } catch (error) {
    logger.error(`extractServiceName: Error extracting service name: ${error.message}`);
    return null;
  }
}

module.exports = {
  extractHostnamesFromRule,
  findLabelsForRouter,
  extractServiceName
};