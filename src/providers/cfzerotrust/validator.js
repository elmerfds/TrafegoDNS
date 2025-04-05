/**
 * CloudFlare Zero Trust-specific record validation utilities
 */
const logger = require('../../utils/logger');

/**
 * Validate a CloudFlare Zero Trust hostname configuration
 * @param {Object} record - The record to validate
 * @throws {Error} - If validation fails
 */
function validateRecord(record) {
  logger.trace(`cfzerotrust.validator: Validating record ${record.name}`);
  
  // Common validations
  if (!record.name) {
    logger.trace(`cfzerotrust.validator: Hostname is missing`);
    throw new Error('Hostname is required for tunnel configurations');
  }
  
  if (!record.content) {
    logger.trace(`cfzerotrust.validator: Service target is missing`);
    throw new Error('Service target (content) is required for tunnel configurations');
  }
  
  // Validate service format
  validateServiceFormat(record.content);
  
  // Validate path if provided
  if (record.path) {
    if (!record.path.startsWith('/')) {
      logger.trace(`cfzerotrust.validator: Path must start with /`);
      throw new Error('Path must start with /', record.path);
    }
  }
  
  // Validate tunnelId if provided
  if (record.tunnelId && !record.tunnelId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    logger.trace(`cfzerotrust.validator: Invalid tunnel ID format: ${record.tunnelId}`);
    throw new Error(`Invalid tunnel ID format: ${record.tunnelId}`);
  }
  
  // Validate additional tunnel-specific parameters
  if (record.disableChunkedEncoding !== undefined && typeof record.disableChunkedEncoding !== 'boolean') {
    logger.trace(`cfzerotrust.validator: disableChunkedEncoding must be a boolean`);
    throw new Error('disableChunkedEncoding must be a boolean');
  }
  
  if (record.noTLSVerify !== undefined && typeof record.noTLSVerify !== 'boolean') {
    logger.trace(`cfzerotrust.validator: noTLSVerify must be a boolean`);
    throw new Error('noTLSVerify must be a boolean');
  }
  
  if (record.http2Origin !== undefined && typeof record.http2Origin !== 'boolean') {
    logger.trace(`cfzerotrust.validator: http2Origin must be a boolean`);
    throw new Error('http2Origin must be a boolean');
  }
  
  // Silently remove 'proxied' property if present since CloudFlare Tunnel doesn't use it
  if (record.proxied !== undefined) {
    delete record.proxied;
    logger.trace(`cfzerotrust.validator: Removed 'proxied' property as CloudFlare Tunnel doesn't support it`);
  }
  
  logger.trace(`cfzerotrust.validator: Record validation successful`);
}

/**
 * Validate service format
 * @param {string} service - The service target string
 * @throws {Error} - If service format is invalid
 */
function validateServiceFormat(service) {
  // Check for valid service formats
  // Examples: 
  // - http://internal.service:8080
  // - https://10.0.0.1:8443
  // - tcp://internal.database:5432
  // - unix:/path/to/socket
  // - http_status:404
  
  if (!service) {
    throw new Error('Service target cannot be empty');
  }
  
  // Special case: HTTP status services
  if (service.startsWith('http_status:')) {
    const statusCode = parseInt(service.split(':')[1], 10);
    if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new Error(`Invalid HTTP status code: ${service}`);
    }
    return;
  }
  
  // Special case: Hello world test service
  if (service === 'hello_world') {
    return;
  }
  
  // Check for proper scheme://target format
  const validSchemes = ['http', 'https', 'tcp', 'unix', 'ssh'];
  const parts = service.split('://');
  
  if (parts.length !== 2) {
    throw new Error(`Invalid service format: ${service} - must be scheme://target`);
  }
  
  const scheme = parts[0].toLowerCase();
  if (!validSchemes.includes(scheme)) {
    throw new Error(`Invalid service scheme: ${scheme} - must be one of ${validSchemes.join(', ')}`);
  }
  
  // Unix socket validation
  if (scheme === 'unix' && !parts[1].startsWith('/')) {
    throw new Error(`Invalid unix socket path: ${parts[1]} - must start with /`);
  }
  
  // Basic validation for HTTP/HTTPS endpoints
  if ((scheme === 'http' || scheme === 'https') && !parts[1].match(/^[a-zA-Z0-9.-]+(\:[0-9]+)?/)) {
    throw new Error(`Invalid ${scheme} service target: ${parts[1]}`);
  }
}

module.exports = {
  validateRecord
};