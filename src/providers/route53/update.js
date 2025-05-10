/**
 * Update operations for Route53 provider
 */
const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const logger = require('../../utils/logger');
const { convertToRoute53Format } = require('./converter');
const { validateRecord } = require('./validator');

/**
 * Update an existing DNS record
 * Note: Route53 doesn't have a direct update method, we have to delete and create
 */
async function updateRecord(route53, zoneId, zone, id, record, findRecordInCache, updateRecordInCache) {
  logger.trace(`Route53Provider.updateRecord: Updating record ID=${id}, type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Parse the id to get name and type (Route53 has no actual record IDs)
    let recordName, recordType;
    
    if (id.includes(':')) {
      // If ID is in our composite format "name:type"
      [recordName, recordType] = id.split(':');
    } else {
      // Otherwise assume id is just name and type comes from record
      recordName = id;
      recordType = record.type;
    }
    
    // Validate the record first
    validateRecord(record);
    
    // First, find the existing record to delete
    const existing = findRecordInCache(recordType, recordName);
    
    if (!existing) {
      throw new Error(`Record ${recordName} (${recordType}) not found for update`);
    }
    
    // Convert to Route53 format for both the old and new record
    const oldRecord = convertToRoute53Format(existing, zone);
    const newRecord = convertToRoute53Format(record, zone);
    
    // Create the change batch for deleting old and creating new
    const params = {
      HostedZoneId: zoneId,
      ChangeBatch: {
        Comment: 'Updated by TráfegoDNS',
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: oldRecord
          },
          {
            Action: 'CREATE',
            ResourceRecordSet: newRecord
          }
        ]
      }
    };
    
    logger.trace(`Route53Provider.updateRecord: Sending change request to Route53: ${JSON.stringify(params)}`);
    
    // Submit the change
    const command = new ChangeResourceRecordSetsCommand(params);
    await route53.send(command);
    
    // Create a standardized record for caching
    const updatedRecord = {
      id: `${record.name}:${record.type}`,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl
    };
    
    // Add type-specific fields
    if (record.type === 'MX') {
      updatedRecord.priority = record.priority;
    } else if (record.type === 'SRV') {
      updatedRecord.priority = record.priority;
      updatedRecord.weight = record.weight;
      updatedRecord.port = record.port;
    } else if (record.type === 'CAA') {
      updatedRecord.flags = record.flags;
      updatedRecord.tag = record.tag;
    }
    
    // Update the cache
    updateRecordInCache(updatedRecord);
    
    // Log at INFO level which record was updated
    logger.info(`📝 Updated ${record.type} record for ${record.name}`);
    logger.success(`Updated ${record.type} record for ${record.name}`);
    
    // Update stats counter if available
    if (global.statsCounter) {
      global.statsCounter.updated++;
      logger.trace(`Route53Provider.updateRecord: Incremented global.statsCounter.updated to ${global.statsCounter.updated}`);
    }
    
    return updatedRecord;
  } catch (error) {
    logger.error(`Failed to update ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Route53Provider.updateRecord: Error details: ${JSON.stringify(error)}`);
    throw error;
  }
}

module.exports = {
  updateRecord
};