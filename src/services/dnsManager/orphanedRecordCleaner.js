/**
 * Orphaned Record Cleaner
 * Responsible for detecting and cleaning up orphaned DNS records
 */
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');

/**
 * Clean up orphaned DNS records
 * @param {Array<string>} activeHostnames - List of currently active hostnames
 * @param {Object} dnsProvider - DNS provider instance
 * @param {Object} recordTracker - Record tracker instance
 * @param {Object} config - Configuration manager instance
 * @param {Object} eventBus - Event bus for publishing events
 * @param {Set} loggedPreservedRecords - Set to track already logged preserved records
 */
async function cleanupOrphanedRecords(
  activeHostnames, 
  dnsProvider, 
  recordTracker, 
  config, 
  eventBus,
  loggedPreservedRecords
) {
  try {
    logger.debug('Checking for orphaned DNS records...');
    
    // Get all DNS records for our zone (from cache when possible)
    const allRecords = await dnsProvider.getRecordsFromCache(true); // Force refresh
    
    // Normalize active hostnames for comparison
    const normalizedActiveHostnames = new Set(activeHostnames.map(host => host.toLowerCase()));
    
    // Log all active hostnames in trace mode
    logger.trace(`Active hostnames: ${Array.from(normalizedActiveHostnames).join(', ')}`);
    
    // For tracking counts in this run
    let newlyOrphanedCount = 0;
    let readyForDeletionCount = 0;
    let reactivatedCount = 0;
    
    // Find records that were created by this tool but no longer exist in Traefik
    const domainSuffix = `.${config.getProviderDomain()}`;
    const domainName = config.getProviderDomain().toLowerCase();
    
    for (const record of allRecords) {
      // Skip apex domain/root records
      if (record.name === '@' || record.name === config.getProviderDomain()) {
        logger.debug(`Skipping apex record: ${record.name}`);
        continue;
      }
      
      // Skip records that aren't a subdomain of our managed domain
      if (record.type === 'NS' || record.type === 'SOA' || record.type === 'CAA') {
        logger.debug(`Skipping system record: ${record.name} (${record.type})`);
        continue;
      }
      
      // Check if this record is tracked by our tool
      if (!recordTracker.isTracked(record)) {
        // Support legacy records with comment for backward compatibility
        if (config.dnsProvider === 'cloudflare' && 
            (record.comment === 'Managed by Traefik DNS Manager' || 
             record.comment === 'Managed by TráfegoDNS')) {
          // This is a legacy record created before we implemented tracking
          logger.debug(`Found legacy managed record with comment: ${record.name} (${record.type})`);
          recordTracker.trackRecord(record);
        } else {
          // Not tracked and not a legacy record - skip it
          logger.debug(`Skipping non-managed record: ${record.name} (${record.type})`);
          continue;
        }
      }
      
      // Reconstruct the FQDN from record name format
      let recordFqdn;
      if (record.name === '@') {
        recordFqdn = domainName;
      } else {
        // Check if the record name already contains the domain
        const recordName = record.name.toLowerCase();
        if (recordName.endsWith(domainName)) {
          // Already has domain name, use as is
          recordFqdn = recordName;
        } else {
          // Need to append domain
          recordFqdn = `${recordName}${domainSuffix}`;
        }
      }
      
      // Check for domain duplication (e.g., example.com.example.com)
      const doublePattern = new RegExp(`${domainName}\\.${domainName}$`, 'i');
      if (doublePattern.test(recordFqdn)) {
        // Remove the duplicated domain part
        recordFqdn = recordFqdn.replace(doublePattern, domainName);
        logger.debug(`Fixed duplicated domain in record: ${recordFqdn}`);
      }
      
      // Log each record for debugging
      logger.debug(`Checking record FQDN: ${recordFqdn} (${record.type})`);
      
      // Check if this record should be preserved
      if (recordTracker.shouldPreserveHostname(recordFqdn)) {
        // Create a unique key for this record for tracking log messages
        const recordKey = `${recordFqdn}-${record.type}`;
        
        // If we haven't logged this record yet, log at INFO level
        if (!loggedPreservedRecords.has(recordKey)) {
          logger.info(`Preserving DNS record (in preserved list): ${recordFqdn} (${record.type})`);
          loggedPreservedRecords.add(recordKey);
        } else {
          // We've already logged this one, use DEBUG level to avoid spam
          logger.debug(`Preserving DNS record (in preserved list): ${recordFqdn} (${record.type})`);
        }
        
        continue;
      }
      
      // Also check if this record is in the managed hostnames list
      if (recordTracker.managedHostnames && 
          recordTracker.managedHostnames.some(h => h.hostname.toLowerCase() === recordFqdn.toLowerCase())) {
        // Create a unique key for this record for tracking log messages
        const recordKey = `${recordFqdn}-${record.type}-managed`;
        
        // If we haven't logged this record yet, log at INFO level
        if (!loggedPreservedRecords.has(recordKey)) {
          logger.info(`Preserving DNS record (in managed list): ${recordFqdn} (${record.type})`);
          loggedPreservedRecords.add(recordKey);
        } else {
          // We've already logged this one, use DEBUG level to avoid spam
          logger.debug(`Preserving DNS record (in managed list): ${recordFqdn} (${record.type})`);
        }
        
        continue;
      }
      
      // Check if this record is still active
      if (!normalizedActiveHostnames.has(recordFqdn)) {
        // Check if the record was already marked as orphaned
        if (recordTracker.isRecordOrphaned(record)) {
          // Check if grace period has elapsed
          const orphanedTime = recordTracker.getRecordOrphanedTime(record);
          const now = new Date();
          const elapsedMinutes = (now - orphanedTime) / (1000 * 60);
          
          if (elapsedMinutes >= config.cleanupGracePeriod) {
            // Grace period elapsed, we can delete the record
            readyForDeletionCount++;
            
            // Format the display name for better reporting
            const displayName = recordFqdn || 
                               (record.name === '@' ? config.getProviderDomain() 
                                                  : `${record.name}.${config.getProviderDomain()}`);
            
            logger.info(`🗑️ Grace period elapsed (${Math.floor(elapsedMinutes)} minutes), removing orphaned DNS record: ${displayName} (${record.type})`);
            
            try {
              await dnsProvider.deleteRecord(record.id);
              
              // Remove record from tracker
              recordTracker.untrackRecord(record);
              
              // Publish delete event
              eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
                name: displayName,
                type: record.type
              });
            } catch (error) {
              logger.error(`Error deleting orphaned record ${displayName}: ${error.message}`);
            }
          } else {
            // Grace period not elapsed yet, log the remaining time
            const remainingMinutes = Math.ceil(config.cleanupGracePeriod - elapsedMinutes);
            
            logger.debug(`Orphaned DNS record ${recordFqdn} (${record.type}) will be deleted in ${remainingMinutes} minutes`);
          }
        } else {
          // Record is newly orphaned, mark it
          logger.info(`🕒 Marking DNS record as orphaned (will be deleted after ${config.cleanupGracePeriod} minutes): ${recordFqdn} (${record.type})`);
          recordTracker.markRecordOrphaned(record);
          newlyOrphanedCount++;
        }
      } else {
        // Record is active again (found in active hostnames), unmark as orphaned if needed
        if (recordTracker.isRecordOrphaned(record)) {
          logger.info(`✅ DNS record is active again, removing orphaned mark: ${recordFqdn} (${record.type})`);
          recordTracker.unmarkRecordOrphaned(record);
          reactivatedCount++;
        }
      }
    }
    
    // Log summary of actions
    if (newlyOrphanedCount > 0 || readyForDeletionCount > 0 || reactivatedCount > 0) {
      logger.info(`Orphaned records: ${newlyOrphanedCount} newly marked, ${readyForDeletionCount} deleted after grace period, ${reactivatedCount} reactivated`);
    } else {
      logger.debug('No orphaned DNS records found');
    }
  } catch (error) {
    logger.error(`Error cleaning up orphaned records: ${error.message}`);
    if (eventBus) {
      eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DNSManager.cleanupOrphanedRecords',
        error: error.message
      });
    }
  }
}

module.exports = {
  cleanupOrphanedRecords
};