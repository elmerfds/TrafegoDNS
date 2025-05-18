/**
 * Orphaned Record Cleaner
 * Responsible for detecting and cleaning up orphaned DNS records
 */
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');
const {
  normalizeHostname,
  createHostnameMap,
  findMatchingHostname,
  isAppManagedRecord
} = require('../../utils/recordTracker/recordMatcher');

/**
 * Clean up orphaned DNS records
 * @param {Array<string>} activeHostnames - List of currently active hostnames
 * @param {Object} dnsProvider - DNS provider instance
 * @param {Object} recordTracker - Record tracker instance
 * @param {Object} config - Configuration manager instance
 * @param {Object} eventBus - Event bus for publishing events
 * @param {Set} loggedPreservedRecords - Set to track already logged preserved records
 * @param {boolean} forceImmediate - Whether to force immediate cleanup without grace period
 */
async function cleanupOrphanedRecords(
  activeHostnames,
  dnsProvider,
  recordTracker,
  config,
  eventBus,
  loggedPreservedRecords,
  forceImmediate = false
) {
  try {
    logger.debug('Checking for orphaned DNS records...');

    // Get all DNS records for our zone (from cache when possible)
    const allRecords = await dnsProvider.getRecordsFromCache(true); // Force refresh

    // Ensure activeHostnames is an array to avoid crashes
    const safeActiveHostnames = Array.isArray(activeHostnames) ? activeHostnames : [];
    
    // Create a map of active hostnames with variations for better matching
    const hostnameMap = createHostnameMap(safeActiveHostnames, config.getProviderDomain());

    // Normalize active hostnames for backward compatibility with existing code
    const normalizedActiveHostnames = new Set(safeActiveHostnames.map(host => normalizeHostname(host)));

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
          // Track it as app-managed (true)
          await recordTracker.trackRecord(record, true);
        } else {
          // Non-legacy records should be tracked but marked as NOT app-managed
          logger.debug(`Tracking non-app-managed record: ${record.name} (${record.type})`);
          // Track it as NOT app-managed (false)
          await recordTracker.trackRecord(record, false);
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
      
      // Check if this record is still active using improved matching
      const matchingHostname = findMatchingHostname(record, hostnameMap, config.getProviderDomain());

      // If no match found with improved algorithm, use the legacy check as fallback
      const isActive = matchingHostname !== null || normalizedActiveHostnames.has(recordFqdn);

      if (!isActive) {
        // Record is not active - check if it was already marked as orphaned
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
          
          // Check if grace period has elapsed or forceImmediate is true
          if (forceImmediate || elapsedMinutes >= config.cleanupGracePeriod) {
            // Grace period elapsed or forced immediate cleanup, we can delete the record
            readyForDeletionCount++;
            
            // Format the display name for better reporting
            const displayName = recordFqdn || 
                               (record.name === '@' ? config.getProviderDomain() 
                                                  : `${record.name}.${config.getProviderDomain()}`);
            
            if (forceImmediate) {
              logger.info(`🗑️ Forced immediate cleanup - removing orphaned DNS record: ${displayName} (${record.type})`);
            } else {
              logger.info(`🗑️ Grace period elapsed (${Math.floor(elapsedMinutes)} minutes), removing orphaned DNS record: ${displayName} (${record.type})`);
            }
            
            try {
              // IMPORTANT: Only delete records that were created by the app
              // Check if this record is app-managed
              const isAppManaged = await isAppManagedRecord(record, recordTracker, config.dnsProvider);

              // Get the first_seen timestamp if available (for enhanced logging)
              let firstSeenInfo = '';
              if (recordTracker.sqliteManager && recordTracker.sqliteManager.repository) {
                try {
                  const firstSeen = await recordTracker.sqliteManager.repository.getRecordFirstSeen(
                    config.dnsProvider, record.id
                  );
                  if (firstSeen) {
                    const firstSeenDate = new Date(firstSeen);
                    const now = new Date();
                    const daysSinceFirstSeen = Math.floor((now - firstSeenDate) / (1000 * 60 * 60 * 24));
                    firstSeenInfo = ` (first seen ${daysSinceFirstSeen} days ago)`;
                  }
                } catch (error) {
                  logger.debug(`Could not get first_seen info: ${error.message}`);
                }
              }

              // Only delete if we're sure this is a record created by the app
              if (isAppManaged) {
                logger.info(`🗑️ Deleting DNS record: ${displayName} (${record.type})${firstSeenInfo}
                - Reason: Orphaned for ${Math.floor(elapsedMinutes)} minutes (grace period elapsed)
                - App-managed: Yes (created by TrafegoDNS)
                - Orphaned since: ${new Date(parsedOrphanedTime).toISOString()}`);
                
                await dnsProvider.deleteRecord(record.id);

                // Remove record from tracker
                await recordTracker.untrackRecord(record);

                // Publish delete event
                eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
                  name: displayName,
                  type: record.type
                });
              } else {
                logger.info(`⚠️ Skipping deletion of non-app-managed record: ${displayName} (${record.type})
                - Reason: Record was not created by TrafegoDNS
                - App-managed: No (likely pre-existing or created externally)
                - Action: Preserving record and removing orphaned mark`);
                
                // Just unmark it as orphaned but keep tracking it
                await recordTracker.unmarkRecordOrphaned(record);
              }
            } catch (error) {
              logger.error(`Error deleting orphaned record ${displayName}: ${error.message}`);
            }
          } else {
            // Grace period not elapsed yet, log the remaining time
            const remainingMinutes = Math.ceil(config.cleanupGracePeriod - elapsedMinutes);
            
            logger.debug(`Orphaned DNS record ${recordFqdn} (${record.type}) will be deleted in ${remainingMinutes} minutes`);
          }
        } else {
          // Check if this record is app-managed before marking it as orphaned
          const isAppManaged = await isAppManagedRecord(record, recordTracker, config.dnsProvider);

          // Only mark as orphaned if it's a record created by the app
          if (isAppManaged) {
            // Get the first_seen timestamp if available (for enhanced logging)
            let firstSeenInfo = '';
            if (recordTracker.sqliteManager && recordTracker.sqliteManager.repository) {
              try {
                const firstSeen = await recordTracker.sqliteManager.repository.getRecordFirstSeen(
                  config.dnsProvider, record.id
                );
                if (firstSeen) {
                  const firstSeenDate = new Date(firstSeen);
                  const now = new Date();
                  const daysSinceFirstSeen = Math.floor((now - firstSeenDate) / (1000 * 60 * 60 * 24));
                  firstSeenInfo = ` (first seen ${daysSinceFirstSeen} days ago)`;
                }
              } catch (error) {
                logger.debug(`Could not get first_seen info: ${error.message}`);
              }
            }
            
            // Enhanced logging with reasoning for why we're marking this as orphaned
            logger.info(`🕒 Marking DNS record as orphaned: ${recordFqdn} (${record.type})${firstSeenInfo}
            - Reason: No matching active hostname in current containers/Traefik routes
            - App-managed: Yes (created by TrafegoDNS)
            - Grace period: Will be deleted after ${config.cleanupGracePeriod} minutes
            - Matching active hostname: None found among ${normalizedActiveHostnames.size} active hostnames`);
            
            await recordTracker.markRecordOrphaned(record);
            newlyOrphanedCount++;
          } else {
            logger.debug(`Skipping orphan marking for non-app-managed record: ${recordFqdn} (${record.type})
            - Reason: Record was not created by TrafegoDNS
            - App-managed: No (likely pre-existing or created externally)
            - Action: Preserving record`);
          }
        }
      } else {
        // Record is active again (found in active hostnames), unmark as orphaned if needed
        if (await recordTracker.isRecordOrphaned(record)) {
          // Find the matching active hostname for better logging
          const matchingHostname = findMatchingHostname(record, hostnameMap, config.getProviderDomain());
          
          logger.info(`✅ DNS record is active again, removing orphaned mark: ${recordFqdn} (${record.type})
          - Reason: Now matches an active hostname
          - Matching hostname: ${matchingHostname || '[Using legacy hostname match]'}
          - Action: Unmarking as orphaned to prevent deletion`);
          
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