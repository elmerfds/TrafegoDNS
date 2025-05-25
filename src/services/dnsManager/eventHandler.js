/**
 * DNS Manager Event Handler
 * Handles event subscriptions and publishing for DNS operations
 */
const EventTypes = require('../../events/EventTypes');
const logger = require('../../utils/logger');

/**
 * Set up event subscriptions for DNS Manager
 * @param {Object} eventBus - Event bus instance
 * @param {Function} processHostnamesHandler - Function to handle hostname processing
 * @param {Object} dnsManager - DNS Manager instance for cleanup operations
 */
function setupEventSubscriptions(eventBus, processHostnamesHandler, dnsManager) {
  if (!eventBus) {
    logger.warn('No event bus provided for DNS Manager, events will not be subscribed');
    return;
  }
  
  // Subscribe to Traefik router updates
  eventBus.subscribe(EventTypes.TRAEFIK_ROUTERS_UPDATED, async (data) => {
    if (!data) {
      logger.warn('Received TRAEFIK_ROUTERS_UPDATED event with no data');
      return;
    }
    const { hostnames, containerLabels } = data;
    await processHostnamesHandler(hostnames, containerLabels);
  });

  // Subscribe to Docker container events for tracking removed containers
  eventBus.subscribe(EventTypes.CONTAINER_DESTROYED, async (data) => {
    logger.debug(`Container destroyed: ${data?.name || 'unknown'}`);
    
    // If dnsManager is available, trigger immediate orphaned cleanup
    if (dnsManager && dnsManager.cleanupOrphanedRecordsWithLastHostnames) {
      try {
        // Wait a short moment for any pending DNS updates to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.debug('Running orphaned record cleanup after container destruction');
        await dnsManager.cleanupOrphanedRecordsWithLastHostnames();
      } catch (error) {
        logger.error(`Failed to run immediate orphaned cleanup after container destruction: ${error.message}`);
      }
    }
  });

  // Also subscribe to container stopped events
  eventBus.subscribe(EventTypes.CONTAINER_STOPPED, async (data) => {
    logger.debug(`Container stopped: ${data?.name || 'unknown'}`);
    
    // If dnsManager is available, trigger immediate orphaned cleanup
    if (dnsManager && dnsManager.cleanupOrphanedRecordsWithLastHostnames) {
      try {
        // Wait a short moment for any pending DNS updates to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        logger.debug('Running orphaned record cleanup after container stop');
        await dnsManager.cleanupOrphanedRecordsWithLastHostnames();
      } catch (error) {
        logger.error(`Failed to run immediate orphaned cleanup after container stop: ${error.message}`);
      }
    }
  });
  
  logger.debug('DNS Manager event subscriptions configured');
}

module.exports = {
  setupEventSubscriptions
};