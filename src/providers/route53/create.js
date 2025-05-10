/**
 * Create operations for Route53 provider
 */
const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const logger = require('../../utils/logger');
const { convertToRoute53Format } = require('./converter');
const { validateRecord } = require('./validator');
const { analyzeBatchError } = require('./errorUtils');

/**
 * Create a new DNS record
 */
async function createRecord(route53, zoneId, zone, record, updateRecordInCache, refreshRecordCache, findRecordInCache) {
  logger.trace(`Route53Provider.createRecord: Creating record type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Validate the record first
    validateRecord(record);
    
    // Convert to Route53 format
    const changeData = convertToRoute53Format(record, zone);
    
    // Create the change batch
    const params = {
      HostedZoneId: zoneId,
      ChangeBatch: {
        Comment: 'Created by TráfegoDNS',
        Changes: [
          {
            Action: 'CREATE',
            ResourceRecordSet: changeData
          }
        ]
      }
    };
    
    logger.trace(`Route53Provider.createRecord: Sending change request to Route53: ${JSON.stringify(params)}`);
    
    // Submit the change
    const command = new ChangeResourceRecordSetsCommand(params);
    await route53.send(command);
    
    // Create a standardized record for caching
    const createdRecord = {
      id: `${record.name}:${record.type}`,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl
    };
    
    // Add type-specific fields
    if (record.type === 'MX') {
      createdRecord.priority = record.priority;
    } else if (record.type === 'SRV') {
      createdRecord.priority = record.priority;
      createdRecord.weight = record.weight;
      createdRecord.port = record.port;
    } else if (record.type === 'CAA') {
      createdRecord.flags = record.flags;
      createdRecord.tag = record.tag;
    }
    
    // Update the cache with the new record
    updateRecordInCache(createdRecord);
    
    // Log at INFO level which record was created
    logger.info(`✨ Created ${record.type} record for ${record.name}`);
    logger.success(`Created ${record.type} record for ${record.name}`);
    
    // Update stats counter if available
    if (global.statsCounter) {
      global.statsCounter.created++;
      logger.trace(`Route53Provider.createRecord: Incremented global.statsCounter.created to ${global.statsCounter.created}`);
    }
    
    return createdRecord;
  } catch (error) {
    // Analyze the error
    const errorAnalysis = analyzeBatchError(error);
    
    // If record already exists, this isn't a true error
    if (errorAnalysis.category === 'RECORD_EXISTS') {
      logger.debug(`${record.type} record for ${record.name} already exists, fetching from cache`);
      
      // Refresh the cache and get the existing record
      await refreshRecordCache();
      const existingRecord = findRecordInCache(record.type, record.name);
      
      if (existingRecord) {
        return existingRecord;
      }
    }
    
    logger.error(`Failed to create ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Route53Provider.createRecord: Error details: ${JSON.stringify(error)}`);
    throw error;
  }
}

module.exports = {
  createRecord
};