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

    // Track preserved records for batch logging
    const newlyPreservedList = [];
    const newlyPreservedManaged = [];
    
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
      if (!(await recordTracker.isTracked(record))) {
        // Support legacy records with comment for backward compatibility
        if (config.dnsProvider === 'cloudflare' &&
            (record.comment === 'Managed by Traefik DNS Manager' ||
             record.comment === 'Managed by TráfegoDNS')) {
          // This is a legacy record created before we implemented tracking
          logger.debug(`Found legacy managed record with comment: ${record.name} (${record.type})`);
          await recordTracker.trackRecord(record);
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

        // If we haven't logged this record yet, collect it for batch logging
        if (!loggedPreservedRecords.has(recordKey)) {
          newlyPreservedList.push(`${recordFqdn} (${record.type})`);
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

        // If we haven't logged this record yet, collect it for batch logging
        if (!loggedPreservedRecords.has(recordKey)) {
          newlyPreservedManaged.push(`${recordFqdn} (${record.type})`);
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
        if (await recordTracker.isRecordOrphaned(record)) {
          // Check if grace period has elapsed
          const orphanedTime = await recordTracker.getRecordOrphanedTime(record);

          // Handle potential formats of orphaned time
          let parsedOrphanedTime;
          if (!orphanedTime) {
            // If no orphaned time, use current time as fallback
            parsedOrphanedTime = new Date();
            logger.warn(`No orphaned time found for record ${recordFqdn}, using current time`);
          } else if (typeof orphanedTime === 'string') {
            // Parse ISO string to Date
            parsedOrphanedTime = new Date(orphanedTime);
          } else if (orphanedTime instanceof Date) {
            // Already a Date object
            parsedOrphanedTime = orphanedTime;
          } else {
            // Try to convert to a Date
            try {
              parsedOrphanedTime = new Date(orphanedTime);
            } catch (e) {
              logger.warn(`Failed to parse orphaned time for record ${recordFqdn}: ${e.message}`);
              parsedOrphanedTime = new Date(); // Fallback to current time
            }
          }

          const now = new Date();
          const elapsedMinutes = (now - parsedOrphanedTime) / (1000 * 60);
          
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
              await recordTracker.untrackRecord(record);
              
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
          await recordTracker.markRecordOrphaned(record);
          newlyOrphanedCount++;
        }
      } else {
        // Record is active again (found in active hostnames), unmark as orphaned if needed
        if (await recordTracker.isRecordOrphaned(record)) {
          logger.info(`✅ DNS record is active again, removing orphaned mark: ${recordFqdn} (${record.type})`);
          await recordTracker.unmarkRecordOrphaned(record);
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

    // Log consolidated preserved records if any new ones were found
    if (newlyPreservedList.length > 0) {
      logger.info(`Preserving DNS records (in preserved list): ${newlyPreservedList.join(', ')}`);
    }

    if (newlyPreservedManaged.length > 0) {
      logger.info(`Preserving DNS records (in managed list): ${newlyPreservedManaged.join(', ')}`);
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