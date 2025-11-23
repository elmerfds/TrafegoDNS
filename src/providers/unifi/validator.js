/**
 * UniFi-specific record validation utilities
 * Based on UniFi Network Application DNS capabilities
 */
const logger = require('../../utils/logger');

/**
 * Validate a UniFi DNS record configuration
 * @param {Object} record - The record to validate
 * @throws {Error} - If validation fails
 */
function validateRecord(record) {
  logger.trace(`unifi.validator: Validating record ${record.name} (${record.type})`);

  // Common validations
  if (!record.type) {
    logger.trace(`unifi.validator: Record type is missing`);
    throw new Error('Record type is required');
  }

  if (!record.name) {
    logger.trace(`unifi.validator: Record name is missing`);
    throw new Error('Record name is required');
  }

  // UniFi supported record types: A, AAAA, CNAME, MX, NS, SRV, TXT
  const supportedTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'SRV', 'TXT'];
  if (!supportedTypes.includes(record.type)) {
    logger.trace(`unifi.validator: Unsupported record type: ${record.type}`);
    throw new Error(`Record type ${record.type} is not supported by UniFi. Supported types: ${supportedTypes.join(', ')}`);
  }

  // Type-specific validations
  switch (record.type) {
    case 'A':
      if (!record.content) {
        logger.trace(`unifi.validator: IP address is missing for A record`);
        throw new Error('IP address is required for A records');
      }

      // Simple IPv4 validation
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(record.content)) {
        logger.trace(`unifi.validator: Invalid IPv4 format: ${record.content}`);
        throw new Error(`Invalid IPv4 address format: ${record.content}`);
      }
      break;

    case 'AAAA':
      if (!record.content) {
        logger.trace(`unifi.validator: IPv6 address is missing for AAAA record`);
        throw new Error('IPv6 address is required for AAAA records');
      }
      // Basic IPv6 format check
      if (!/^[0-9a-fA-F:]+$/.test(record.content)) {
        logger.trace(`unifi.validator: Invalid IPv6 format: ${record.content}`);
        throw new Error(`Invalid IPv6 address format: ${record.content}`);
      }
      break;

    case 'CNAME':
      if (!record.content) {
        logger.trace(`unifi.validator: Target is missing for CNAME record`);
        throw new Error('Target is required for CNAME records');
      }
      // Ensure CNAME target ends with a dot if it's a FQDN
      if (!record.content.endsWith('.') && record.content.includes('.')) {
        logger.trace(`unifi.validator: Adding trailing dot to CNAME target: ${record.content}`);
        record.content += '.';
      }
      break;

    case 'MX':
      if (!record.content) {
        logger.trace(`unifi.validator: Mail server is missing for MX record`);
        throw new Error('Mail server is required for MX records');
      }
      // Set default priority if missing
      if (record.priority === undefined) {
        logger.trace(`unifi.validator: Setting default priority (10) for MX record`);
        record.priority = 10;
      }
      // Ensure MX target ends with a dot
      if (!record.content.endsWith('.')) {
        logger.trace(`unifi.validator: Adding trailing dot to MX target: ${record.content}`);
        record.content += '.';
      }
      break;

    case 'NS':
      if (!record.content) {
        logger.trace(`unifi.validator: Nameserver is missing for NS record`);
        throw new Error('Nameserver is required for NS records');
      }
      // Ensure NS target ends with a dot
      if (!record.content.endsWith('.')) {
        logger.trace(`unifi.validator: Adding trailing dot to NS target: ${record.content}`);
        record.content += '.';
      }
      break;

    case 'SRV':
      if (!record.content) {
        logger.trace(`unifi.validator: Target is missing for SRV record`);
        throw new Error('Target is required for SRV records');
      }
      // Set defaults for SRV fields
      if (record.priority === undefined) {
        logger.trace(`unifi.validator: Setting default priority (1) for SRV record`);
        record.priority = 1;
      }
      if (record.weight === undefined) {
        logger.trace(`unifi.validator: Setting default weight (1) for SRV record`);
        record.weight = 1;
      }
      if (record.port === undefined) {
        logger.trace(`unifi.validator: Port is missing for SRV record`);
        throw new Error('Port is required for SRV records');
      }
      break;

    case 'TXT':
      if (!record.content) {
        logger.trace(`unifi.validator: Content is missing for TXT record`);
        throw new Error('Content is required for TXT records');
      }
      break;

    default:
      logger.warn(`Record type ${record.type} validation not implemented`);
      logger.trace(`unifi.validator: Unknown record type: ${record.type}`);
  }

  // UniFi-specific validations

  // TTL defaults - UniFi uses dnsmasq which respects TTL
  if (record.ttl === undefined) {
    logger.trace(`unifi.validator: Setting default TTL (300) for record`);
    record.ttl = 300; // 5 minutes default
  } else if (record.ttl < 60) {
    logger.warn(`TTL value ${record.ttl} is too low for UniFi. Setting to 60 seconds.`);
    logger.trace(`unifi.validator: Adjusting TTL from ${record.ttl} to 60 (minimum)`);
    record.ttl = 60;
  }

  // UniFi doesn't support proxied records (that's a Cloudflare feature)
  if (record.proxied !== undefined) {
    logger.trace(`unifi.validator: Removing unsupported 'proxied' property`);
    delete record.proxied;
  }

  logger.trace(`unifi.validator: Record validation successful`);
}

module.exports = {
  validateRecord
};
