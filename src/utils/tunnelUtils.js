/**
 * src/utils/tunnelUtils.js
 * Utility functions for CloudFlare Tunnel management
 */
const logger = require('./logger');

/**
 * Extract hostname configuration for CloudFlare Tunnel
 * @param {Object} labels - Container labels
 * @param {Object} config - Application configuration
 * @param {string} hostname - Hostname to process
 * @returns {Object} - Tunnel configuration for hostname
 */
function extractTunnelConfigFromLabels(labels, config, hostname) {
  logger.trace(`tunnelUtils.extractTunnelConfigFromLabels: Extracting tunnel config for ${hostname}`);
  
  const genericPrefix = config.genericLabelPrefix;
  const tunnelPrefix = `${genericPrefix}cf.tunnel.`;
  
  // Default configuration
  const tunnelConfig = {
    hostname: hostname,
    service: 'http://localhost:80',
    path: '/'
  };
  
  // Extract service configuration
  if (labels[`${tunnelPrefix}service`]) {
    tunnelConfig.service = labels[`${tunnelPrefix}service`];
    logger.trace(`tunnelUtils.extractTunnelConfigFromLabels: Using service from label: ${tunnelConfig.service}`);
  } else if (labels[`${tunnelPrefix}service.protocol`] || 
             labels[`${tunnelPrefix}service.host`] || 
             labels[`${tunnelPrefix}service.port`]) {
    // Build service from components
    const protocol = labels[`${tunnelPrefix}service.protocol`] || 'http';
    const host = labels[`${tunnelPrefix}service.host`] || 'localhost';
    const port = labels[`${tunnelPrefix}service.port`] || '80';
    
    tunnelConfig.service = `${protocol}://${host}:${port}`;
    logger.trace(`tunnelUtils.extractTunnelConfigFromLabels: Built service from components: ${tunnelConfig.service}`);
  }
  
  // Extract path configuration
  if (labels[`${tunnelPrefix}path`]) {
    tunnelConfig.path = labels[`${tunnelPrefix}path`];
    logger.trace(`tunnelUtils.extractTunnelConfigFromLabels: Using path from label: ${tunnelConfig.path}`);
  }
  
  // Extract additional configurations
  if (labels[`${tunnelPrefix}disabled`] === 'true') {
    tunnelConfig.disabled = true;
    logger.trace(`tunnelUtils.extractTunnelConfigFromLabels: Tunnel disabled for ${hostname}`);
  }
  
  return tunnelConfig;
}

/**
 * Check if hostname should be managed by CloudFlare Tunnel
 * @param {string} hostname - Hostname to check
 * @param {Object} labels - Container labels
 * @param {Object} config - Application configuration
 * @returns {boolean} - True if hostname should be managed by tunnel
 */
function shouldUseTunnel(hostname, labels, config) {
  // If tunnel is not enabled globally, never use it
  if (!config.cfTunnelEnabled) {
    return false;
  }
  
  // 1. Check for explicit label overrides
  const genericPrefix = config.genericLabelPrefix;
  
  if (labels[`${genericPrefix}cf.tunnel.disabled`] === 'true' || 
      labels[`${genericPrefix}cf.tunnel.enabled`] === 'false') {
    logger.trace(`tunnelUtils.shouldUseTunnel: Tunnel explicitly disabled for ${hostname}`);
    return false;
  }
  
  if (labels[`${genericPrefix}cf.tunnel.enabled`] === 'true') {
    logger.trace(`tunnelUtils.shouldUseTunnel: Tunnel explicitly enabled for ${hostname}`);
    return true;
  }
  
  // 2. Check if hostname matches suffix pattern
  if (config.cfTunnelHostnameSuffix && hostname.endsWith(config.cfTunnelHostnameSuffix)) {
    logger.trace(`tunnelUtils.shouldUseTunnel: Hostname ${hostname} matches tunnel suffix pattern`);
    return true;
  }
  
  // 3. If global mode is enabled without suffix, use tunnel for all hostnames
  if (config.cfTunnelEnabled && !config.cfTunnelHostnameSuffix) {
    logger.trace(`tunnelUtils.shouldUseTunnel: Using tunnel for ${hostname} (global tunnel mode)`);
    return true;
  }
  
  logger.trace(`tunnelUtils.shouldUseTunnel: Not using tunnel for ${hostname}`);
  return false;
}

module.exports = {
  extractTunnelConfigFromLabels,
  shouldUseTunnel
};