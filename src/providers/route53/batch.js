/**
 * Batch operations for Route53 provider
 */
const { ChangeResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const logger = require('../../utils/logger');
const { validateRecord } = require('./validator');
const { convertToRoute53Format } = require('./converter');
const { analyzeBatchError } = require('./errorUtils');

/**
 * Batch process multiple DNS records at once
 * Route53 supports batching changes in a single API call, which is more efficient
 */
async function batchEnsureRecords(
  route53, 
  zoneId, 
  zone, 
  config, 
  recordConfigs, 
  refreshRecordCache, 
  findRecordInCache, 
  createRecord, 
  updateRecord
) {
  if (!recordConfigs || recordConfigs.length === 0) {
    logger.trace('Route53Provider.batchEnsureRecords: No record configs provided, skipping');
    return [];
  }
  
  logger.debug(`Batch processing ${recordConfigs.length} DNS records`);
  logger.trace(`Route53Provider.batchEnsureRecords: Starting batch processing of ${recordConfigs.length} records`);
  
  try {
    // Process each record configuration
    const results = [];
    const pendingChanges = {
      create: [],
      update: [],
      unchanged: []
    };
    
    // First pass: examine all records and sort into categories
    logger.trace('Route53Provider.batchEnsureRecords: First pass - examining records');
    
    for (const recordConfig of recordConfigs) {
      try {
        logger.trace(`Route53Provider.batchEnsureRecords: Processing record ${recordConfig.name} (${recordConfig.type})`);
        
        // Skip records with proxied flag (Route53 doesn't support proxying)
        if (recordConfig.proxied !== undefined) {
          logger.debug(`Route53 doesn't support proxying, ignoring proxied flag for ${recordConfig.name}`);
          delete recordConfig.proxied;
        }
        
        // Handle apex domains that need IP lookup
        if ((recordConfig.needsIpLookup || recordConfig.content === 'pending') && recordConfig.type === 'A') {
          logger.trace(`Route53Provider.batchEnsureRecords: Record needs IP lookup: ${recordConfig.name}`);
          
          // Get public IP asynchronously
          const ip = await config.getPublicIP();
          if (ip) {
            logger.trace(`Route53Provider.batchEnsureRecords: Retrieved IP address: ${ip}`);
            recordConfig.content = ip;
            logger.debug(`Retrieved public IP for apex domain ${recordConfig.name}: ${ip}`);
          } else {
            logger.trace(`Route53Provider.batchEnsureRecords: Failed to retrieve IP address`);
            throw new Error(`Unable to determine public IP for apex domain A record: ${recordConfig.name}`);
          }
          // Remove the flag to avoid confusion
          delete recordConfig.needsIpLookup;
        }

        // Handle apex domains that need IPv6 lookup
        if ((recordConfig.needsIpLookup || recordConfig.content === 'pending') && recordConfig.type === 'AAAA') {
          logger.trace(`Route53Provider.batchEnsureRecords: Record needs IPv6 lookup: ${recordConfig.name}`);
          
          // Get public IPv6 asynchronously
          const ipv6 = await config.getPublicIPv6();
          if (ipv6) {
            logger.trace(`Route53Provider.batchEnsureRecords: Retrieved IPv6 address: ${ipv6}`);
            recordConfig.content = ipv6;
            logger.debug(`Retrieved public IPv6 for apex domain ${recordConfig.name}: ${ipv6}`);
          } else {
            logger.trace(`Route53Provider.batchEnsureRecords: Failed to retrieve IPv6 address`);
            throw new Error(`Unable to determine public IPv6 for apex domain AAAA record: ${recordConfig.name}`);
          }
          // Remove the flag to avoid confusion
          delete recordConfig.needsIpLookup;
        }
        
        // Validate the record
        validateRecord(recordConfig);
        
        // Ensure record name is properly formatted for Route53 (always ends with dot)
        if (!recordConfig.name.endsWith('.')) {
          // Append the zone name if not already present
          if (!recordConfig.name.endsWith(zone)) {
            // For apex domain
            if (recordConfig.name === zone.replace(/\.$/, '')) {
              recordConfig.name = zone.endsWith('.') ? zone : `${zone}.`;
            } else {
              // For subdomains
              const zoneName = zone.endsWith('.') ? zone : `${zone}.`;
              recordConfig.name = `${recordConfig.name}.${zoneName}`;
            }
          } else {
            // Already has the zone but missing the trailing dot
            recordConfig.name = `${recordConfig.name}.`;
          }
        }
        
        // Find existing record in cache
        const existing = findRecordInCache(recordConfig.type, recordConfig.name);
        
        if (existing) {
          logger.trace(`Route53Provider.batchEnsureRecords: Found existing record name=${existing.name}`);
          
          // Check if update is needed
          const needsUpdate = recordNeedsUpdate(existing, recordConfig);
          logger.trace(`Route53Provider.batchEnsureRecords: Record ${recordConfig.name} needs update: ${needsUpdate}`);
          
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
              logger.trace(`Route53Provider.batchEnsureRecords: Incremented global.statsCounter.upToDate to ${global.statsCounter.upToDate}`);
            }
          }
        } else {
          logger.trace(`Route53Provider.batchEnsureRecords: No existing record found, needs creation`);
          
          // Need to create a new record
          pendingChanges.create.push({
            record: recordConfig
          });
        }
      } catch (error) {
        logger.error(`Error processing ${recordConfig.name}: ${error.message}`);
        logger.trace(`Route53Provider.batchEnsureRecords: Error details: ${error.message}`);
        
        if (global.statsCounter) {
          global.statsCounter.errors++;
          logger.trace(`Route53Provider.batchEnsureRecords: Incremented global.statsCounter.errors to ${global.statsCounter.errors}`);
        }
      }
    }
    
    // Second pass: apply all changes
    logger.debug(`DNS changes: ${pendingChanges.create.length} to create, ${pendingChanges.update.length} to update, ${pendingChanges.unchanged.length} unchanged`);
    logger.trace('Route53Provider.batchEnsureRecords: Second pass - applying changes');
    
    let batchSucceeded = true;
    
    // For Route53, we can batch multiple changes in a single API call
    // But we need to be careful not to exceed AWS API limits (max 1000 changes per batch)
    const MAX_CHANGES_PER_BATCH = 100; // Set conservatively below Route53's limit
    
    // Process creates and updates in batches
    if (pendingChanges.create.length > 0 || pendingChanges.update.length > 0) {
      // Combine all creates and updates into a single array of changes
      const allChanges = [];
      
      // Add creates
      for (const { record } of pendingChanges.create) {
        allChanges.push({
          Action: 'CREATE',
          ResourceRecordSet: convertToRoute53Format(record, zone)
        });
      }

      // Add updates (which are DELETE + CREATE in Route53)
      for (const { existing, record } of pendingChanges.update) {
        // Need to delete the old record first
        allChanges.push({
          Action: 'DELETE',
          ResourceRecordSet: convertToRoute53Format(existing, zone)
        });
        
        // Then create the new version
        allChanges.push({
          Action: 'CREATE',
          ResourceRecordSet: convertToRoute53Format(record, zone)
        });
      }

      // Split changes into batches
      const changeBatches = [];
      for (let i = 0; i < allChanges.length; i += MAX_CHANGES_PER_BATCH) {
        changeBatches.push(allChanges.slice(i, i + MAX_CHANGES_PER_BATCH));
      }

      logger.debug(`Splitting ${allChanges.length} Route53 changes into ${changeBatches.length} batches`);

      // Process each batch
      for (let i = 0; i < changeBatches.length; i++) {
        const changes = changeBatches[i];
        logger.debug(`Processing Route53 change batch ${i+1}/${changeBatches.length} with ${changes.length} changes`);
        
        const params = {
          HostedZoneId: zoneId,
          ChangeBatch: {
            Comment: 'Batch update by TráfegoDNS',
            Changes: changes
          }
        };
        
        try {
          const command = new ChangeResourceRecordSetsCommand(params);
          await route53.send(command);
          logger.debug(`Successfully submitted batch ${i+1}/${changeBatches.length}`);
        } catch (error) {
          // Analyze the error
          const errorAnalysis = analyzeBatchError(error);
          
          // Log the error at the appropriate level
          const logMethod = errorAnalysis.logLevel === 'debug' ? logger.debug : 
                          errorAnalysis.logLevel === 'warn' ? logger.warn : logger.error;
          
          logMethod.call(logger, `Route53 batch ${i+1} error (${errorAnalysis.category}): ${errorAnalysis.message}`);
          
          if (errorAnalysis.affectedRecords.length > 0) {
            logger.debug(`Affected records: ${errorAnalysis.affectedRecords.map(r => `${r.type} ${r.name}`).join(', ')}`);
          }
          
          // Determine if we should fall back to individual processing
          if (errorAnalysis.shouldRetryIndividually) {
            logger.debug('Falling back to individual record processing');
            batchSucceeded = false;
            
            // Break the loop to fall back to individual processing
            break;
          } else if (errorAnalysis.category === 'RECORD_EXISTS') {
            // For records that already exist, we can just refresh our cache
            logger.debug('Records already exist, refreshing cache to get current state');
            await refreshRecordCache();
            continue;
          } else {
            // For auth errors or other serious issues, propagate the error
            throw error;
          }
        }
      }
    }

    // Track which records we've successfully processed to avoid duplicates
    const processedRecords = new Map();
    
    // If batch processing succeeded, we're done
    if (batchSucceeded) {
      // Collect all records to return in results
      // For creates and updates, we need to refresh the cache to get the latest records
      if (pendingChanges.create.length > 0 || pendingChanges.update.length > 0) {
        await refreshRecordCache();
        
        // Add created records to results
        for (const { record } of pendingChanges.create) {
          const createdRecord = findRecordInCache(record.type, record.name);
          if (createdRecord) {
            results.push(createdRecord);
          }
        }
        
        // Add updated records to results
        for (const { record } of pendingChanges.update) {
          const updatedRecord = findRecordInCache(record.type, record.name);
          if (updatedRecord) {
            results.push(updatedRecord);
          }
        }
      }
      
      // Add unchanged records to results
      for (const { existing } of pendingChanges.unchanged) {
        results.push(existing);
      }
    } else {
      // Fallback to individual processing if batch processing fails
      
      // Refresh the cache to get latest state after partial batch operations
      await refreshRecordCache();
      
      // Create new records
      for (const { record } of pendingChanges.create) {
        try {
          // Check if this record already exists in the updated cache
          // This is the key fix - avoid trying to create records that might have been
          // created by a partially successful batch
          const recordKey = `${record.type}:${record.name}`;
          if (processedRecords.has(recordKey)) {
            logger.debug(`Skipping already processed record: ${record.name} (${record.type})`);
            continue;
          }
          
          // Check if the record already exists in the cache (might have been created in a batch)
          const existingInCache = findRecordInCache(record.type, record.name);
          if (existingInCache) {
            logger.debug(`Record ${record.name} (${record.type}) already exists, no need to create`);
            results.push(existingInCache);
            processedRecords.set(recordKey, true);
            continue;
          }
          
          logger.trace(`Route53Provider.batchEnsureRecords: Creating record ${record.name} (${record.type})`);
          // Log at INFO level which record will be created
          logger.info(`✨ Creating ${record.type} record for ${record.name}`);
          const result = await createRecord(record);
          results.push(result);
          processedRecords.set(recordKey, true);
        } catch (error) {
          // Analyze the individual error
          const errorAnalysis = analyzeBatchError(error);
          
          // Check if the error is because the record already exists
          if (errorAnalysis.category === 'RECORD_EXISTS') {
            const recordKey = `${record.type}:${record.name}`;
            processedRecords.set(recordKey, true);
            
            // Refresh the cache and get the existing record
            await refreshRecordCache();
            const existingRecord = findRecordInCache(record.type, record.name);
            if (existingRecord) {
              results.push(existingRecord);
              logger.debug(`Record ${record.name} (${record.type}) already exists, added to results`);
            } else {
              logger.warn(`Record ${record.name} (${record.type}) reported as existing but not found in cache`);
            }
          } else {
            // Log at the appropriate level based on the error analysis
            const logMethod = errorAnalysis.logLevel === 'debug' ? logger.debug : 
                            errorAnalysis.logLevel === 'warn' ? logger.warn : logger.error;
                            
            logMethod.call(logger, `Failed to create ${record.type} record for ${record.name}: ${error.message}`);
            logger.trace(`Route53Provider.batchEnsureRecords: Create error: ${error.message}`);
            
            if (global.statsCounter) {
              global.statsCounter.errors++;
            }
          }
        }
      }

      // Update existing records
      for (const { id, record } of pendingChanges.update) {
        try {
          const recordKey = `${record.type}:${record.name}`;
          if (processedRecords.has(recordKey)) {
            logger.debug(`Skipping already processed record: ${record.name} (${record.type})`);
            continue;
          }
          
          logger.trace(`Route53Provider.batchEnsureRecords: Updating record ${record.name} (${record.type})`);
          // Log at INFO level which record will be updated
          logger.info(`📝 Updating ${record.type} record for ${record.name}`);
          const result = await updateRecord(id, record);
          results.push(result);
          processedRecords.set(recordKey, true);
        } catch (error) {
          // Analyze the individual error
          const errorAnalysis = analyzeBatchError(error);
          
          // Log at the appropriate level based on the error analysis
          const logMethod = errorAnalysis.logLevel === 'debug' ? logger.debug : 
                          errorAnalysis.logLevel === 'warn' ? logger.warn : logger.error;
                          
          logMethod.call(logger, `Failed to update ${record.type} record for ${record.name}: ${error.message}`);
          logger.trace(`Route53Provider.batchEnsureRecords: Update error: ${error.message}`);
          
          if (global.statsCounter) {
            global.statsCounter.errors++;
          }
        }
      }

      // Add unchanged records to results too
      for (const { existing } of pendingChanges.unchanged) {
        results.push(existing);
      }
    }
    
    logger.trace(`Route53Provider.batchEnsureRecords: Batch processing complete, returning ${results.length} results`);
    return results;
  } catch (error) {
    logger.error(`Failed to batch process DNS records: ${error.message}`);
    logger.trace(`Route53Provider.batchEnsureRecords: Error details: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a record needs to be updated
 */
function recordNeedsUpdate(existing, newRecord) {
  // Skip the implementation here as it would be quite specific to Route53
  // The actual implementation should compare the existing record with the new one
  // and determine if an update is needed based on content, TTL, or other properties
  return false; // Placeholder implementation
}

module.exports = {
  batchEnsureRecords,
  recordNeedsUpdate
};