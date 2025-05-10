/**
 * Apex domain handling for DigitalOcean provider
 */
const logger = require('../../utils/logger');

/**
 * Special handler for apex domain records
 * This is needed because DigitalOcean has specific requirements for apex domains
 */
async function handleApexDomain(client, domain, record, recordCache, updateRecordInCache) {
  logger.debug(`Handling apex domain record: ${JSON.stringify(record)}`);
  
  if (record.type !== 'A' && record.type !== 'AAAA') {
    logger.warn(`Apex domain record of type ${record.type} may not be supported by DigitalOcean`);
  }
  
  // For apex domains, DigitalOcean requires the name to be '@'
  const apexRecord = {
    type: record.type,
    name: '@',
    data: record.content,
    ttl: record.ttl || 30
  };
  
  // First check if the record already exists
  logger.debug('Checking if apex domain record already exists...');
  
  try {
    // First try to get records directly from API to ensure fresh data
    const response = await client.get(`/domains/${domain}/records`, {
      params: { name: '@', type: record.type }
    });
    
    let existingRecords = response.data.domain_records || [];
    
    // If nothing from direct API, try our cache as backup
    if (existingRecords.length === 0) {
      existingRecords = recordCache.records.filter(r => 
        r.type === record.type && r.name === '@'
      );
    }
    
    if (existingRecords && existingRecords.length > 0) {
      const existing = existingRecords[0];
      logger.debug(`Found existing apex domain record: ${JSON.stringify(existing)}`);
      
      // Update cache to ensure we know about this record
      updateRecordInCache(existing);
      
      // Check if update is needed
      let needsUpdate = false;
      
      // Just compare the data directly - clearer than calling recordNeedsUpdate
      if (existing.data !== record.content) {
        logger.debug(`Content different: ${existing.data} vs ${record.content}`);
        needsUpdate = true;
      }
      
      if (existing.ttl !== record.ttl) {
        logger.debug(`TTL different: ${existing.ttl} vs ${record.ttl}`);
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        logger.info(`Updating existing apex domain record (${record.type} for ${domain})`);
        
        try {
          const response = await client.put(
            `/domains/${domain}/records/${existing.id}`,
            apexRecord
          );
          
          const updatedRecord = response.data.domain_record;
          logger.success(`Successfully updated apex domain record`);
          
          // Update the cache
          updateRecordInCache(updatedRecord);
          
          // Update stats counter if available
          if (global.statsCounter) {
            global.statsCounter.updated++;
          }
          
          return updatedRecord;
        } catch (updateError) {
          logger.error(`Failed to update apex domain record: ${updateError.message}`);
          if (updateError.response) {
            logger.debug(`Error details: ${JSON.stringify(updateError.response.data)}`);
          }
          throw updateError;
        }
      } else {
        logger.info(`Apex domain record is already up to date (${record.type} for ${domain})`);
        
        // Update stats counter if available
        if (global.statsCounter) {
          global.statsCounter.upToDate++;
        }
        
        return existing;
      }
    } else {
      // Need to create a new record
      logger.info(`Creating new apex domain record (${record.type} for ${domain})`);
      
      try {
        const response = await client.post(
          `/domains/${domain}/records`,
          apexRecord
        );
        
        const createdRecord = response.data.domain_record;
        logger.success(`Successfully created apex domain record`);
        
        // Update the cache
        updateRecordInCache(createdRecord);
        
        // Update stats counter if available
        if (global.statsCounter) {
          global.statsCounter.created++;
        }
        
        return createdRecord;
      } catch (createError) {
        logger.error(`Failed to create apex domain record: ${createError.message}`);
        if (createError.response) {
          logger.debug(`Error details: ${JSON.stringify(createError.response.data)}`);
        }
        throw createError;
      }
    }
  } catch (error) {
    logger.error(`Error handling apex domain: ${error.message}`);
    throw error;
  }
}

module.exports = {
  handleApexDomain
};