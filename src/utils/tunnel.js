/**
 * src/utils/tunnel.js
 * 
 * Tunnel-related utility functions
 * Provides helpers for working with Cloudflare Tunnels
 */
const logger = require('./logger');
const { getLabelValue } = require('./dns');

/**
 * Extract tunnel configuration from container labels
 * @param {Object} labels - Container labels
 * @param {Object} config - TráfegoDNS configuration
 * @param {string} hostname - The hostname to configure
 * @returns {Object|null} - Tunnel configuration or null if not configured
 */
function extractTunnelConfigFromLabels(labels, config, hostname) {
  logger.trace(`tunnel.extractTunnelConfigFromLabels: Extracting tunnel config for ${hostname}`);
  
  // Only proceed if we're using Cloudflare
  if (config.dnsProvider !== 'cloudflare') {
    logger.trace(`tunnel.extractTunnelConfigFromLabels: Not using Cloudflare provider, skipping tunnel extraction`);
    return null;
  }
  
  const genericPrefix = config.genericLabelPrefix;
  const providerPrefix = config.dnsLabelPrefix;
  
  // Check if tunnel ID/name is specified
  const tunnelId = getLabelValue(labels, genericPrefix, providerPrefix, 'cloudflare.tunnel', null);
  
  if (!tunnelId) {
    logger.trace(`tunnel.extractTunnelConfigFromLabels: No tunnel ID found for ${hostname}`);
    return null;
  }
  
  // Extract other tunnel settings
  const tunnelPath = getLabelValue(labels, genericPrefix, providerPrefix, 'cloudflare.tunnel.path', '/');
  const tunnelService = getLabelValue(labels, genericPrefix, providerPrefix, 'cloudflare.tunnel.service', null);
  
  // Service URL is required
  if (!tunnelService) {
    logger.warn(`No service URL specified for tunnel ${tunnelId} (hostname: ${hostname})`);
    logger.warn(`Please set the ${genericPrefix}cloudflare.tunnel.service label to specify where traffic should be routed`);
    return null;
  }
  
  logger.trace(`tunnel.extractTunnelConfigFromLabels: Found tunnel config for ${hostname}: tunnelId=${tunnelId}, path=${tunnelPath}, service=${tunnelService}`);
  
  return {
    tunnelId,
    hostname,
    path: tunnelPath,
    service: tunnelService
  };
}

/**
 * Validate a tunnel configuration
 * @param {Object} tunnelConfig - Tunnel configuration to validate
 * @returns {Object} - Validated tunnel configuration or throws an error
 */
function validateTunnelConfig(tunnelConfig) {
  if (!tunnelConfig.tunnelId) {
    throw new Error('Tunnel ID is required');
  }
  
  if (!tunnelConfig.hostname) {
    throw new Error('Hostname is required');
  }
  
  if (!tunnelConfig.service) {
    throw new Error('Service URL is required');
  }
  
  // Ensure path starts with a slash
  if (tunnelConfig.path && !tunnelConfig.path.startsWith('/')) {
    tunnelConfig.path = '/' + tunnelConfig.path;
  }
  
  // Default path to / if not specified
  if (!tunnelConfig.path) {
    tunnelConfig.path = '/';
  }
  
  return tunnelConfig;
}

/**
 * Create a unique key for tracking a tunnel configuration
 * @param {string} provider - DNS provider name
 * @param {string} tunnelId - Tunnel ID
 * @param {string} hostname - Hostname
 * @returns {string} - Unique key
 */
function getTunnelKey(provider, tunnelId, hostname) {
  return `${provider}:tunnel:${tunnelId}:${hostname}`.toLowerCase();
}

module.exports = {
  extractTunnelConfigFromLabels,
  validateTunnelConfig,
  getTunnelKey
};