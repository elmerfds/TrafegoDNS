/**
 * Central State Management System for TrafegoDNS
 * Initializes and connects the state management components
 */
const StateStore = require('./StateStore');
const ActionBroker = require('./ActionBroker');
const { registerDnsActions } = require('./actions/dnsActions');
const { registerConfigActions } = require('./actions/configActions');
const { registerOrphanedActions } = require('./actions/orphanedActions');
const logger = require('../utils/logger');

/**
 * Initialize the state management system
 * @param {EventBus} eventBus - Application event bus
 * @param {Object} services - Core application services
 * @returns {Object} - The state management components
 */
function initializeStateManagement(eventBus, services) {
  logger.info('Initializing state management system');

  // Create state store
  const stateStore = new StateStore();

  // Create action broker
  const actionBroker = new ActionBroker(stateStore, eventBus);

  // Register logging middleware
  actionBroker.use(async (action, next) => {
    if (process.env.DEBUG_MODE === 'true') {
      logger.debug(`Action dispatched: ${action.type}`);
    }
    return action;
  });

  // Register validation middleware
  actionBroker.use(async (action, next) => {
    // Validate action based on type
    switch (action.type) {
      case 'DNS_RECORD_CREATE':
        if (!action.payload?.type || !action.payload?.name || !action.payload?.content) {
          throw new Error('DNS record creation requires type, name, and content');
        }
        break;

      case 'DNS_RECORD_UPDATE':
        if (!action.payload?.id) {
          throw new Error('DNS record update requires an ID');
        }
        if (!action.payload?.content && !action.payload?.ttl && action.payload?.proxied === undefined) {
          throw new Error('DNS record update requires at least one field to update');
        }
        break;

      case 'DNS_RECORD_DELETE':
        if (!action.payload?.id) {
          throw new Error('DNS record deletion requires an ID');
        }
        break;
    }

    return action;
  });

  // Register action handlers
  registerDnsActions(actionBroker, services);
  registerConfigActions(actionBroker, services);
  registerOrphanedActions(actionBroker, services);

  // Subscribe to system events
  eventBus.subscribe('system:startup', () => {
    stateStore._updateState('system.status', 'running', { source: 'system' });
  });

  eventBus.subscribe('system:shutdown', () => {
    stateStore._updateState('system.status', 'stopping', { source: 'system' });
  });

  // Initialize the state
  actionBroker.dispatch({
    type: 'CONFIG_INITIALIZE',
    metadata: { source: 'system' }
  }).catch(err => {
    logger.error(`Failed to initialize config in state: ${err.message}`);
  });

  // Fetch initial DNS records
  actionBroker.dispatch({
    type: 'DNS_RECORDS_FETCH',
    metadata: { source: 'system' }
  }).catch(err => {
    logger.error(`Failed to fetch initial DNS records: ${err.message}`);
  });

  // Update orphaned records state
  actionBroker.dispatch({
    type: 'DNS_ORPHANED_UPDATE',
    metadata: { source: 'system' }
  }).catch(err => {
    logger.error(`Failed to update orphaned records: ${err.message}`);
  });

  // Setup periodic orphaned records update (every 5 minutes)
  setInterval(() => {
    actionBroker.dispatch({
      type: 'DNS_ORPHANED_UPDATE',
      metadata: { source: 'system:timer' }
    }).catch(err => {
      logger.debug(`Periodic orphaned records update failed: ${err.message}`);
    });
  }, 5 * 60 * 1000);

  return {
    stateStore,
    actionBroker
  };
}

module.exports = { initializeStateManagement };