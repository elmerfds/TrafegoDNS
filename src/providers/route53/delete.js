/**
 * Delete operations for Route53 provider
 */
const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const logger = require('../../utils/logger');
const { convertToRoute53Format } = require('./converter');

/**
 * Delete a DNS record
 */
async function deleteRecord(route53, zoneId, zone, id, findRecordInCache, removeRecordFromCache) {
  logger.trace(`Route53Provider.deleteRecord: Deleting record ID=${id}`);
  
  try {
    // Parse the id to get name and type
    let recordName, recordType;
    
    if (id.includes(':')) {
      [recordName, recordType] = id.split(':');
    } else {
      // If id is not in expected format, try to find record in cache
      const record = recordCache.records.find(r => r.id === id);
      if (record) {
        recordName = record.name;
        recordType = record.type;
      } else {
        throw new Error(`Record with ID ${id} not found for deletion`);
      }
    }
    
    // Find the existing record to delete
    const existing = findRecordInCache(recordType, recordName);
    
    if (!existing) {
      throw new Error(`Record ${recordName} (${recordType}) not found for deletion`);
    }
    
    // Find the record in cache before deleting to log info
    const recordToDelete = existing;
    if (recordToDelete) {
      logger.info(`🗑️ Deleting DNS record: ${recordToDelete.name} (${recordToDelete.type})`);
    }
    
    // Convert to Route53 format
    const route53Record = convertToRoute53Format(existing, zone);
    
    // Create the change batch
    const params = {
      HostedZoneId: zoneId,
      ChangeBatch: {
        Comment: 'Deleted by TráfegoDNS',
        Changes: [
          {
            Action: 'DELETE',
            ResourceRecordSet: route53Record
          }
        ]
      }
    };
    
    logger.trace(`Route53Provider.deleteRecord: Sending delete request to Route53: ${JSON.stringify(params)}`);
    
    // Submit the change
    const command = new ChangeResourceRecordSetsCommand(params);
    await route53.send(command);
    
    // Update the cache
    removeRecordFromCache(recordName, recordType);
    
    logger.debug(`Deleted DNS record: ${recordName} (${recordType})`);
    logger.trace(`Route53Provider.deleteRecord: Record deletion successful`);
    
    return true;
  } catch (error) {
    logger.error(`Failed to delete DNS record with ID ${id}: ${error.message}`);
    logger.trace(`Route53Provider.deleteRecord: Error details: ${JSON.stringify(error)}`);
    throw error;
  }
}

module.exports = {
  deleteRecord
};