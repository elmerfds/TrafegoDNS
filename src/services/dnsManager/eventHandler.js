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
 */
function setupEventSubscriptions(eventBus, processHostnamesHandler) {
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
    // When a container is destroyed, it might be a good time to check for orphaned records
    // The processHostnamesHandler will be called on the next Traefik poll, which will update
    // the active hostnames list and then the scheduled cleanup timer will take care of the rest.
    
    // Log this event at debug level
    logger.debug(`Container destroyed: ${data?.name || 'unknown'}. Will check for orphaned records on next cleanup.`);
  });
  
  logger.debug('DNS Manager event subscriptions configured');
}

module.exports = {
  setupEventSubscriptions
};