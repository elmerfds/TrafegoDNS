/**
 * CRUD operations for DigitalOcean provider
 */
const logger = require('../../utils/logger');
const { convertToDigitalOceanFormat } = require('./converter');
const { validateRecord } = require('./validator');
const { prepareRecordForCreation } = require('./recordUtils');

/**
 * Create a new DNS record
 */
async function createRecord(client, domain, record, updateRecordInCache) {
  logger.trace(`Creating record type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Validate the record first
    validateRecord(record);
    
    // Convert name format for DO - extract subdomain part
    const recordData = prepareRecordForCreation(record, domain);
    
    // First check if record already exists to avoid duplicates
    logger.debug(`Checking if record ${recordData.name} (${recordData.type}) already exists...`);
    
    try {
      // Try searching by name and type directly from API
      const response = await client.get(`/domains/${domain}/records`, {
        params: { name: recordData.name, type: recordData.type }
      });
      
      const existingRecords = response.data.domain_records || [];
      
      if (existingRecords.length > 0) {
        const existing = existingRecords[0];
        logger.info(`Found existing ${record.type} record for ${record.name}, no need to create`);
        
        // Update the cache
        updateRecordInCache(existing);
        
        // Check if it needs to be updated
        if (existing.data !== recordData.data || existing.ttl !== recordData.ttl) {
          logger.info(`Updating existing ${record.type} record for ${record.name}`);
          return await updateRecord(client, domain, existing.id, record, updateRecordInCache);
        }
        
        // Record is already up to date
        if (global.statsCounter) {
          global.statsCounter.upToDate++;
        }
        
        return existing;
      }
    } catch (searchError) {
      // If search fails, continue with creation attempt
      logger.debug(`Error searching for existing record: ${searchError.message}`);
    }
    
    // Convert to DigitalOcean format
    const doRecord = convertToDigitalOceanFormat(recordData);
    
    logger.trace(`Sending create request to DigitalOcean API: ${JSON.stringify(doRecord)}`);
    
    try {
      const response = await client.post(
        `/domains/${domain}/records`,
        doRecord
      );
      
      const createdRecord = response.data.domain_record;
      logger.trace(`Record created successfully, ID=${createdRecord.id}`);
      
      // Update the cache with the new record
      updateRecordInCache(createdRecord);
      
      // Log at INFO level which record was created
      logger.info(`✨ Created ${record.type} record for ${record.name}`);
      logger.success(`Created ${record.type} record for ${record.name}`);
      
      // Update stats counter if available
      if (global.statsCounter) {
        global.statsCounter.created++;
      }
      
      return createdRecord;
    } catch (apiError) {
      // Enhanced error handling for API errors
      if (apiError.response) {
        const statusCode = apiError.response.status;
        const responseData = apiError.response.data || {};
        
        // Special handling for 422 errors (validation failures)
        if (statusCode === 422) {
          logger.error(`DigitalOcean API validation error: ${JSON.stringify(responseData)}`);
          
          // Check for "CNAME records cannot share a name with other records" error
          if (responseData.message && responseData.message.includes("CNAME records cannot share a name")) {
            logger.warn(`Record ${record.name} already exists with a different type. Skipping creation.`);
            
            // Try to find the existing record of any type for this name
            try {
              const allRecordsResponse = await client.get(`/domains/${domain}/records`, {
                params: { name: recordData.name }
              });
              
              const allExistingRecords = allRecordsResponse.data.domain_records || [];
              
              if (allExistingRecords.length > 0) {
                const existingRecord = allExistingRecords[0];
                logger.info(`Found existing record for ${record.name} of type ${existingRecord.type}`);
                
                // Update stats
                if (global.statsCounter) {
                  global.statsCounter.upToDate++;
                }
                
                // Update the cache
                updateRecordInCache(existingRecord);
                
                return existingRecord;
              }
            } catch (findError) {
              logger.debug(`Error finding existing records: ${findError.message}`);
            }
          }
          
          // Check for common errors
          const isApexDomain = record.name === domain || recordData.name === '@';
          if (isApexDomain) {
            logger.debug('This appears to be an apex domain record issue.');
            
            // For apex domains we often need to check if the record already exists
            logger.debug('Checking if record already exists...');
            
            try {
              // Use the listRecords method to find matching records
              const existingRecordsResponse = await client.get(`/domains/${domain}/records`, {
                params: { type: record.type, name: isApexDomain ? '@' : recordData.name }
              });
              
              const existingRecords = existingRecordsResponse.data.domain_records || [];
              
              if (existingRecords && existingRecords.length > 0) {
                logger.info(`Found existing record for ${record.name}, no need to create`);
                return existingRecords[0]; // Return the existing record
              }
            } catch (listError) {
              logger.error(`Error checking for existing records: ${listError.message}`);
            }
            
            // If we're here, the record doesn't exist but creation failed
            if (record.type === 'A') {
              // For A records, try using the name '@' directly
              try {
                const manualRecord = {
                  type: 'A',
                  name: '@',
                  data: record.content,
                  ttl: record.ttl || 30
                };
                
                logger.debug(`Trying direct creation with: ${JSON.stringify(manualRecord)}`);
                
                const response = await client.post(
                  `/domains/${domain}/records`,
                  manualRecord
                );
                
                const createdRecord = response.data.domain_record;
                logger.success(`Successfully created apex domain record using direct method`);
                
                // Update the cache
                updateRecordInCache(createdRecord);
                
                return createdRecord;
              } catch (manualError) {
                logger.error(`Manual creation also failed: ${manualError.message}`);
                if (manualError.response) {
                  logger.debug(`Error details: ${JSON.stringify(manualError.response.data)}`);
                }
              }
            }
          }
        }
        
        // Log comprehensive error details
        logger.error(`API error ${statusCode}: ${responseData.message || 'Unknown error'}`);
        if (responseData.error) {
          logger.debug(`Error details: ${JSON.stringify(responseData.error)}`);
        }
      }
      
      throw apiError; // Re-throw after logging details
    }
  } catch (error) {
    logger.error(`Failed to create ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Create error details: ${JSON.stringify(error.response?.data || error.message)}`);
    throw error;
  }
}

/**
 * Update an existing DNS record
 */
async function updateRecord(client, domain, id, record, updateRecordInCache) {
  logger.trace(`Updating record ID=${id}, type=${record.type}, name=${record.name}, content=${record.content}`);
  
  try {
    // Validate the record first
    validateRecord(record);
    
    // Convert name format for DO - extract subdomain part
    const recordData = prepareRecordForCreation(record, domain);
    
    // Convert to DigitalOcean format
    const doRecord = convertToDigitalOceanFormat(recordData);
    
    logger.trace(`Sending update request to DigitalOcean API: ${JSON.stringify(doRecord)}`);
    
    try {
      const response = await client.put(
        `/domains/${domain}/records/${id}`,
        doRecord
      );
      
      const updatedRecord = response.data.domain_record;
      logger.trace(`Record updated successfully, ID=${updatedRecord.id}`);
      
      // Update the cache
      updateRecordInCache(updatedRecord);
      
      // Log at INFO level which record was updated
      logger.info(`📝 Updated ${record.type} record for ${record.name}`);
      logger.success(`Updated ${record.type} record for ${record.name}`);
      
      // Update stats counter if available
      if (global.statsCounter) {
        global.statsCounter.updated++;
      }
      
      return updatedRecord;
    } catch (apiError) {
      // Enhanced error handling for API-specific errors
      if (apiError.response && apiError.response.status === 422) {
        const errorData = apiError.response.data;
        const errorMessage = errorData.message || 'Validation failed';
        const errorDetails = JSON.stringify(errorData);
        
        logger.error(`Failed to update ${record.type} record for ${record.name}: ${errorMessage}`);
        logger.debug(`DigitalOcean API error details: ${errorDetails}`);
        
        // Check for common issues
        if (doRecord.data && doRecord.data.includes('.') && !doRecord.data.endsWith('.')) {
          logger.warn(`The record content "${doRecord.data}" may be invalid. For ${record.type} records, DigitalOcean may require a fully qualified domain name ending with a period.`);
          
          // Try to fix the record by adding a trailing period and retry
          if (['CNAME', 'MX', 'SRV', 'NS'].includes(record.type)) {
            logger.info(`Attempting to fix ${record.type} record by adding trailing period to ${doRecord.data}`);
            doRecord.data = `${doRecord.data}.`;
            
            try {
              const retryResponse = await client.put(
                `/domains/${domain}/records/${id}`,
                doRecord
              );
              
              const updatedRecord = retryResponse.data.domain_record;
              logger.success(`Successfully updated ${record.type} record for ${record.name} with fixed content`);
              
              // Update the cache
              updateRecordInCache(updatedRecord);
              
              // Update stats counter if available
              if (global.statsCounter) {
                global.statsCounter.updated++;
              }
              
              return updatedRecord;
            } catch (retryError) {
              throw new Error(`Failed to update record even with trailing period: ${retryError.message}`);
            }
          }
        }
        
        throw new Error(`${errorMessage} - ${errorDetails}`);
      }
      
      throw apiError;
    }
  } catch (error) {
    logger.error(`Failed to update ${record.type} record for ${record.name}: ${error.message}`);
    logger.trace(`Update error details: ${JSON.stringify(error.response?.data || error.message)}`);
    throw error;
  }
}

/**
 * Delete a DNS record
 */
async function deleteRecord(client, domain, id, recordCache, removeRecordFromCache) {
  logger.trace(`Deleting record ID=${id}`);
  
  try {
    // Find the record in cache before deleting to log info
    const recordToDelete = recordCache.records.find(r => r.id === id);
    if (recordToDelete) {
      // Format the name to display the full domain
      const displayName = recordToDelete.name === '@' 
        ? domain 
        : `${recordToDelete.name}.${domain}`;
      logger.info(`🗑️ Deleting DNS record: ${displayName} (${recordToDelete.type})`);
    }
    
    logger.trace(`Sending delete request to DigitalOcean API`);
    await client.delete(`/domains/${domain}/records/${id}`);
    
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