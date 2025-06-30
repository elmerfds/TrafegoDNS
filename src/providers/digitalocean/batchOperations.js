/**
 * Batch operations for DigitalOcean provider
 */
const logger = require('../../utils/logger');
const { validateRecord } = require('./validator');
const { findRecordInCache, recordNeedsUpdate } = require('./recordUtils');
const { handleApexDomain } = require('./apex');

/**
 * Batch process multiple DNS records at once
 */
async function batchEnsureRecords(client, domain, config, recordConfigs, recordCache, 
                                  updateRecordInCache, removeRecordFromCache, 
                                  createRecord, updateRecord) {
  if (!recordConfigs || recordConfigs.length === 0) {
    logger.trace('No record configs provided, skipping');
    return [];
  }
  
  logger.debug(`Batch processing ${recordConfigs.length} DNS records`);
  logger.trace(`Starting batch processing of ${recordConfigs.length} records`);
  
  try {
    // Process each record configuration
    const results = [];
    const pendingChanges = {
      create: [],
      update: [],
      unchanged: [],
      apex: [] // Special handling for apex domains
    };
    
    // Keep track of processed hostnames to avoid duplicates
    const processedHostnames = new Set();
    
    // First pass: examine all records and sort into categories
    logger.trace('First pass - examining records');
    
    for (const recordConfig of recordConfigs) {
      try {
        logger.trace(`Processing record ${recordConfig.name} (${recordConfig.type})`);
        
        // Check if we've already processed this hostname+type combination
        const recordKey = `${recordConfig.type}-${recordConfig.name}`;
        if (processedHostnames.has(recordKey)) {
          logger.debug(`Skipping duplicate record: ${recordConfig.name} (${recordConfig.type})`);
          continue;
        }
        
        // Mark this hostname+type as processed
        processedHostnames.add(recordKey);
        
        // Handle apex domains that need IP lookup
        if ((recordConfig.needsIpLookup || recordConfig.content === 'pending') && recordConfig.type === 'A') {
          logger.trace(`Record needs IP lookup: ${recordConfig.name}`);
          
          // Get public IP asynchronously
          const ip = await config.getPublicIP();
          if (ip) {
            logger.trace(`Retrieved IP address: ${ip}`);
            recordConfig.content = ip;
            logger.debug(`Retrieved public IP for apex domain ${recordConfig.name}: ${ip}`);
          } else {
            logger.trace(`Failed to retrieve IP address`);
            throw new Error(`Unable to determine public IP for apex domain A record: ${recordConfig.name}`);
          }
          // Remove the flag to avoid confusion
          delete recordConfig.needsIpLookup;
        }

        // Handle apex domains that need IPv6 lookup
        if ((recordConfig.needsIpLookup || recordConfig.content === 'pending') && recordConfig.type === 'AAAA') {
          logger.trace(`Record needs IPv6 lookup: ${recordConfig.name}`);
          
          // Get public IPv6 asynchronously
          const ipv6 = await config.getPublicIPv6();
          if (ipv6) {
            logger.trace(`Retrieved IPv6 address: ${ipv6}`);
            recordConfig.content = ipv6;
            logger.debug(`Retrieved public IPv6 for apex domain ${recordConfig.name}: ${ipv6}`);
          } else {
            logger.trace(`Failed to retrieve IPv6 address`);
            throw new Error(`Unable to determine public IPv6 for apex domain AAAA record: ${recordConfig.name}`);
          }
          // Remove the flag to avoid confusion
          delete recordConfig.needsIpLookup;
        }
        
        // Validate the record
        validateRecord(recordConfig);
        
        // Check if this is an apex domain
        const isApex = recordConfig.name === domain;
        
        if (isApex) {
          // Special handling for apex domains
          pendingChanges.apex.push({
            record: recordConfig
          });
          continue; // Skip the normal processing flow
        }
        
        // Find existing record in cache
        const existing = findRecordInCache(recordCache, recordConfig.type, recordConfig.name, domain);
        
        if (existing) {
          logger.trace(`Found existing record ID=${existing.id}`);
          
          // Check if update is needed
          const needsUpdate = recordNeedsUpdate(existing, recordConfig, domain);
          logger.trace(`Record ${recordConfig.name} needs update: ${needsUpdate}`);
          
          if (needsUpdate) {
            pendingChanges.update.push({
              id: existing.id,
              record: recordConfig,
              existing
            });
          } else {
            pendingChanges.unchanged.push({
              record: recordConfig,
              existing
            });
            
            // Update stats counter if available
            if (global.statsCounter) {
              global.statsCounter.upToDate++;
            }
          }
        } else {
          logger.trace(`No existing record found, needs creation`);
          
          // Need to create a new record
          pendingChanges.create.push({
            record: recordConfig
          });
        }
      } catch (error) {
        logger.error(`Error processing ${recordConfig.name}: ${error.message}`);
        logger.trace(`Error details: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
        }
      }
    }
    
    // Second pass: apply all changes
    logger.debug(`DNS changes: ${pendingChanges.create.length} to create, ${pendingChanges.update.length} to update, ${pendingChanges.unchanged.length} unchanged, ${pendingChanges.apex.length} apex domains`);
    logger.trace('Second pass - applying changes');
    
    // Handle apex domains first
    for (const { record } of pendingChanges.apex) {
      try {
        logger.trace(`Handling apex domain ${record.name} (${record.type})`);
        logger.info(`🌐 Processing apex domain record for ${record.name}`);
        const result = await handleApexDomain(client, domain, record, recordCache, updateRecordInCache);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to handle apex domain ${record.name}: ${error.message}`);
        logger.trace(`Apex domain error: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
        }
      }
    }
    
    // Create new records
    for (const { record } of pendingChanges.create) {
      try {
        logger.trace(`Creating record ${record.name} (${record.type})`);
        // Log at INFO level which record will be created
        logger.info(`✨ Creating ${record.type} record for ${record.name}`);
        const result = await createRecord(client, domain, record, updateRecordInCache);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to create ${record.type} record for ${record.name}: ${error.message}`);
        logger.trace(`Create error: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
        }
      }
    }
    
    // Update existing records
    for (const { id, record } of pendingChanges.update) {
      try {
        logger.trace(`Updating record ${record.name} (${record.type})`);
        // Log at INFO level which record will be updated
        logger.info(`📝 Updating ${record.type} record for ${record.name}`);
        const result = await updateRecord(client, domain, id, record, updateRecordInCache);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to update ${record.type} record for ${record.name}: ${error.message}`);
        logger.trace(`Update error: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
        }
      }
    }
    
    // Add unchanged records to results too
    for (const { existing } of pendingChanges.unchanged) {
      results.push(existing);
    }
    
    logger.trace(`Batch processing complete, returning ${results.length} results`);
    return results;
  } catch (error) {
    logger.error(`Failed to batch process DNS records: ${error.message}`);
    logger.trace(`Error details: ${error.message}`);
    throw error;
  }
}

module.exports = {
  batchEnsureRecords
};