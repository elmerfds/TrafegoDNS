/**
 * CloudFlare Zero Trust record format converter utilities
 * Handles conversion between internal format and CloudFlare Zero Trust API format
 */
const logger = require('../../utils/logger');

/**
 * Convert standard record format to CloudFlare Zero Trust API format
 * @param {Object} record - Record in standard format
 * @returns {Object} - Record in CloudFlare Tunnel ingress rule format
 */
function convertToCFZeroTrustFormat(record) {
  logger.trace(`cfzerotrust.converter: Converting record to CloudFlare Zero Trust format: ${JSON.stringify(record)}`);
  
  // Basic tunnel ingress rule
  const tunnelIngressRule = {
    hostname: record.name,
    service: record.content // The service is the target (e.g., http://internal:8080)
  };
  
  // Add path if specified
  if (record.path) {
    tunnelIngressRule.path = record.path;
  }
  
  // Add additional tunnel-specific configurations if present
  // disableChunkedEncoding
  if (record.disableChunkedEncoding !== undefined) {
    tunnelIngressRule.disableChunkedEncoding = record.disableChunkedEncoding;
  }
  
  // originRequest settings
  if (record.originRequest) {
    tunnelIngressRule.originRequest = record.originRequest;
  }
  
  // Access policies
  if (record.accessPolicy) {
    tunnelIngressRule.access_policy = record.accessPolicy;
  }
  
  // Connection settings
  if (record.connectTimeout) {
    tunnelIngressRule.connectTimeout = record.connectTimeout;
  }
  
  // TLS settings
  if (record.noTLSVerify !== undefined) {
    tunnelIngressRule.noTLSVerify = record.noTLSVerify;
  }
  
  // HTTP2 Origin settings
  if (record.http2Origin !== undefined) {
    tunnelIngressRule.http2Origin = record.http2Origin;
  }
  
  logger.trace(`cfzerotrust.converter: Converted to CloudFlare Zero Trust format: ${JSON.stringify(tunnelIngressRule)}`);
  return tunnelIngressRule;
}

/**
 * Convert CloudFlare Zero Trust ingress rule format to standard format
 * @param {Object} tunnelRule - Record in CloudFlare Zero Trust format
 * @param {string} tunnelId - Tunnel ID the rule belongs to
 * @returns {Object} - Record in standard format
 */
function convertRecord(tunnelRule, tunnelId) {
  logger.trace(`cfzerotrust.converter: Converting from CloudFlare Zero Trust format: ${JSON.stringify(tunnelRule)}`);
  
  // Basic record format
  const standardRecord = {
    id: `${tunnelId}:${tunnelRule.hostname}`, // Composite ID with tunnel and hostname
    name: tunnelRule.hostname,
    type: 'CNAME', // Using CNAME as a placeholder type for consistency with interface
    content: tunnelRule.service, // The service is the target (e.g., http://internal:8080)
    path: tunnelRule.path || '',
    tunnelId: tunnelId,
    config: { ...tunnelRule } // Store the full tunnel rule for reference
  };
  
  // Add additional tunnel-specific configurations if present
  if (tunnelRule.disableChunkedEncoding !== undefined) {
    standardRecord.disableChunkedEncoding = tunnelRule.disableChunkedEncoding;
  }
  
  if (tunnelRule.originRequest) {
    standardRecord.originRequest = tunnelRule.originRequest;
  }
  
  if (tunnelRule.access_policy) {
    standardRecord.accessPolicy = tunnelRule.access_policy;
  }
  
  if (tunnelRule.noTLSVerify !== undefined) {
    standardRecord.noTLSVerify = tunnelRule.noTLSVerify;
  }
  
  if (tunnelRule.http2Origin !== undefined) {
    standardRecord.http2Origin = tunnelRule.http2Origin;
  }
  
  logger.trace(`cfzerotrust.converter: Converted to standard format: ${JSON.stringify(standardRecord)}`);
  return standardRecord;
}

module.exports = {
  convertToCFZeroTrustFormat,
  convertRecord
};