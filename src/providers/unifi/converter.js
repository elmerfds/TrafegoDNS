/**
 * UniFi record format converter utilities
 * Handles conversion between internal format and UniFi API format
 * Based on UniFi Network Application DNS API structure
 */
const logger = require('../../utils/logger');

/**
 * Convert standard record format to UniFi API format
 * @param {Object} record - Record in standard format
 * @returns {Object} - Record in UniFi format
 */
function convertToUnifiFormat(record) {
  logger.trace(`unifi.converter: Converting record to UniFi format: ${JSON.stringify(record)}`);

  // UniFi DNS API uses this structure:
  // {
  //   enabled: boolean,
  //   key: string (hostname),
  //   record_type: string,
  //   value: string,
  //   ttl: number,
  //   port: number (optional - for SRV),
  //   priority: number (optional - for MX/SRV),
  //   weight: number (optional - for SRV)
  // }

  const unifiRecord = {
    enabled: true,
    key: record.name,
    record_type: record.type,
    value: record.content,
    ttl: record.ttl || 300
  };

  // Type-specific fields
  switch (record.type) {
    case 'MX':
      unifiRecord.priority = record.priority || 10;
      break;

    case 'SRV':
      unifiRecord.priority = record.priority || 1;
      unifiRecord.weight = record.weight || 1;
      unifiRecord.port = record.port || 80;
      break;
  }

  // Include ID if updating an existing record
  if (record.id) {
    unifiRecord._id = record.id;
  }

  logger.trace(`unifi.converter: Converted to UniFi format: ${JSON.stringify(unifiRecord)}`);
  return unifiRecord;
}

/**
 * Convert UniFi record format to standard format
 * @param {Object} unifiRecord - Record in UniFi format
 * @returns {Object} - Record in standard format
 */
function convertRecord(unifiRecord) {
  logger.trace(`unifi.converter: Converting from UniFi format: ${JSON.stringify(unifiRecord)}`);

  // Basic record format
  const standardRecord = {
    id: unifiRecord._id,
    type: unifiRecord.record_type,
    name: unifiRecord.key,
    content: unifiRecord.value,
    ttl: unifiRecord.ttl || 300,
    enabled: unifiRecord.enabled !== false
  };

  // Type-specific fields
  switch (unifiRecord.record_type) {
    case 'MX':
      if (unifiRecord.priority !== undefined) {
        standardRecord.priority = unifiRecord.priority;
      }
      break;

    case 'SRV':
      if (unifiRecord.priority !== undefined) {
        standardRecord.priority = unifiRecord.priority;
      }
      if (unifiRecord.weight !== undefined) {
        standardRecord.weight = unifiRecord.weight;
      }
      if (unifiRecord.port !== undefined) {
        standardRecord.port = unifiRecord.port;
      }
      break;
  }

  logger.trace(`unifi.converter: Converted to standard format: ${JSON.stringify(standardRecord)}`);
  return standardRecord;
}

module.exports = {
  convertRecord,
  convertToUnifiFormat
};
