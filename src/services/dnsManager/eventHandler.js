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
    const { hostnames, containerLabels } = data;
    await processHostnamesHandler(hostnames, containerLabels);
  });
  
  logger.debug('DNS Manager event subscriptions configured');
}

module.exports = {
  setupEventSubscriptions
};