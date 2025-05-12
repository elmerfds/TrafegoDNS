/**
 * Orphaned DNS Records Actions
 * Action handlers for managing orphaned DNS records
 */
const logger = require('../../utils/logger');

/**
 * Register orphaned record action handlers
 * @param {ActionBroker} broker - The action broker
 * @param {Object} services - Application services
 */
function registerOrphanedActions(broker, services) {
  // Update orphaned records state
  broker.registerHandler('DNS_ORPHANED_UPDATE', async (action, broker) => {
    const { DNSManager } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    try {
      // Get all records
      const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
      
      // Filter to only orphaned records
      const orphanedRecords = records.filter(record => 
        DNSManager.recordTracker.isTracked(record) && 
        DNSManager.recordTracker.isRecordOrphaned(record)
      );
      
      // Enhance with orphaned time data
      const enhancedOrphanedRecords = await Promise.all(orphanedRecords.map(async record => {
        const orphanedTime = await DNSManager.recordTracker.getRecordOrphanedTime(record);

        // Handle all possible formats of orphanedTime to ensure we always have a proper ISO string or null
        let orphanedSince = null;

        if (orphanedTime) {
          if (typeof orphanedTime === 'string') {
            orphanedSince = orphanedTime; // Already a string, assume it's ISO format
          } else if (orphanedTime instanceof Date) {
            orphanedSince = orphanedTime.toISOString(); // Convert Date to ISO string
          } else {
            try {
              // Try to convert to a Date object if it's something else
              orphanedSince = new Date(orphanedTime).toISOString();
            } catch (e) {
              logger.warn(`Could not format orphaned time for record ${record.id}: ${e.message}`);
            }
          }
        }

        return {
          ...record,
          orphanedSince
        };
      }));
      
      // Update state
      broker.updateState('dns.orphaned', enhancedOrphanedRecords, action, 'dns:orphaned:updated');
      return enhancedOrphanedRecords;
    } catch (error) {
      logger.error(`Failed to update orphaned records: ${error.message}`);
      throw error;
    }
  });

  // Cleanup orphaned records
  broker.registerHandler('DNS_ORPHANED_CLEANUP', async (action, broker) => {
    const { DNSManager, DockerMonitor } = services;
    if (!DNSManager) {
      throw new Error('DNS Manager not initialized');
    }

    try {
      // Get active hostnames from Docker containers
      const activeHostnames = DockerMonitor && DockerMonitor.isConnected() 
        ? DockerMonitor.getActiveHostnames() 
        : [];
      
      // Force immediate cleanup
      const cleanupResult = await DNSManager.cleanupOrphanedRecords(activeHostnames);
      
      // After cleanup, update orphaned records state
      await broker.dispatch({
        type: 'DNS_ORPHANED_UPDATE',
        metadata: { source: action.metadata.source || 'system' }
      });
      
      // Also refresh general DNS records
      await broker.dispatch({
        type: 'DNS_RECORDS_FETCH',
        metadata: { source: action.metadata.source || 'system' }
      });
      
      return cleanupResult;
    } catch (error) {
      logger.error(`Failed to cleanup orphaned records: ${error.message}`);
      throw error;
    }
  });
}

module.exports = { registerOrphanedActions };