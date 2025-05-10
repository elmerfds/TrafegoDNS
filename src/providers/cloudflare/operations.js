/**
 * CRUD operations for Cloudflare provider
 */
const logger = require('../../utils/logger');
const { convertToCloudflareFormat } = require('./converter');
const { validateRecord } = require('./validator');

/**
 * Create a new DNS record
 */
async function createRecord(client, zoneId, record, updateRecordInCache) {
  logger.trace(`Creating record type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Validate the record first
    validateRecord(record);
    
    // Add management comment
    const recordWithComment = {
      ...record,
      comment: 'Managed by TráfegoDNS'
    };
    
    // Convert to Cloudflare format if needed
    const cloudflareRecord = convertToCloudflareFormat(recordWithComment);
    
    logger.trace(`Sending create request to Cloudflare API: ${JSON.stringify(cloudflareRecord)}`);
    
    const response = await client.post(
      `/zones/${zoneId}/dns_records`,
      cloudflareRecord
    );
    
    const createdRecord = response.data.result;
    logger.trace(`Record created successfully, ID=${createdRecord.id}`);
    
    // Update the cache with the new record
    updateRecordInCache(createdRecord);
    
    // Log at INFO level which record was created
    logger.info(`✨ Created ${record.type} record for ${record.name}`);
    logger.success(`Created ${record.type} record for ${record.name}`);
    
    // Update stats counter if available
    if (global.statsCounter) {
      global.statsCounter.created++;
      logger.trace(`Incremented global.statsCounter.created to ${global.statsCounter.created}`);
    }
    
    return createdRecord;
  } catch (error) {
    logger.error(`Failed to create ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Create error details: ${JSON.stringify(error.response?.data || error.message)}`);
    throw error;
  }
}

/**
 * Update an existing DNS record
 */
async function updateRecord(client, zoneId, id, record, updateRecordInCache) {
  logger.trace(`Updating record ID=${id}, type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Validate the record first
    validateRecord(record);
    
    // Add management comment
    const recordWithComment = {
      ...record,
      comment: 'Managed by TráfegoDNS'
    };
    
    // Convert to Cloudflare format if needed
    const cloudflareRecord = convertToCloudflareFormat(recordWithComment);
    
    logger.trace(`Sending update request to Cloudflare API: ${JSON.stringify(cloudflareRecord)}`);
    
    const response = await client.put(
      `/zones/${zoneId}/dns_records/${id}`,
      cloudflareRecord
    );
    
    const updatedRecord = response.data.result;
    logger.trace(`Record updated successfully, ID=${updatedRecord.id}`);
    
    // Update the cache
    updateRecordInCache(updatedRecord);
    
    // Log at INFO level which record was updated
    logger.info(`📝 Updated ${record.type} record for ${record.name}`);
    logger.success(`Updated ${record.type} record for ${record.name}`);
    
    // Update stats counter if available
    if (global.statsCounter) {
      global.statsCounter.updated++;
      logger.trace(`Incremented global.statsCounter.updated to ${global.statsCounter.updated}`);
    }
    
    return updatedRecord;
  } catch (error) {
    logger.error(`Failed to update ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Update error details: ${JSON.stringify(error.response?.data || error.message)}`);
    throw error;
  }
}

/**
 * Delete a DNS record
 */
async function deleteRecord(client, zoneId, id, recordCache, removeRecordFromCache) {
  logger.trace(`Deleting record ID=${id}`);
  
  try {
    // Find the record in cache before deleting to log info
    const recordToDelete = recordCache.records.find(r => r.id === id);
    if (recordToDelete) {
      logger.info(`🗑️ Deleting DNS record: ${recordToDelete.name} (${recordToDelete.type})`);
    }
    
    logger.trace(`Sending delete request to Cloudflare API`);
    await client.delete(`/zones/${zoneId}/dns_records/${id}`);
    
    // Update the cache
    removeRecordFromCache(id);
    
    logger.debug(`Deleted DNS record with ID ${id}`);
    logger.trace(`Record deletion successful`);
    
    return true;
  } catch (error) {
    logger.error(`Failed to delete DNS record with ID ${id}: ${error.message}`);
    logger.trace(`Delete error details: ${JSON.stringify(error.response?.data || error.message)}`);
    throw error;
  }
}

module.exports = {
  createRecord,
  updateRecord,
  deleteRecord
};