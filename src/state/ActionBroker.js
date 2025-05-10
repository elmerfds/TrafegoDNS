/**
 * ActionBroker - Manages state mutations through a controlled action dispatch system
 * All state changes must go through this broker to ensure consistency
 */
const logger = require('../utils/logger');

class ActionBroker {
  constructor(stateStore, eventBus) {
    this.stateStore = stateStore;
    this.eventBus = eventBus;
    this.middleware = [];
    this.actionHandlers = {};
  }

  /**
   * Register middleware function to process actions before they're handled
   * @param {Function} middleware - Function(action, next) that processes actions
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middleware.push(middleware);
  }

  /**
   * Register an action handler
   * @param {string} actionType - Type of action this handler responds to
   * @param {Function} handler - Function to handle this action type
   */
  registerHandler(actionType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Action handler must be a function');
    }
    this.actionHandlers[actionType] = handler;
  }

  /**
   * Process an action through middleware and dispatch to appropriate handler
   * @param {Object} action - Action object with type and payload
   * @returns {Promise<*>} - Result of the action
   */
  async dispatch(action) {
    if (!action || !action.type) {
      throw new Error('Actions must have a type');
    }

    try {
      // Add default metadata if not provided
      action.metadata = action.metadata || {
        timestamp: new Date().toISOString(),
        source: 'unknown'
      };

      // Process through middleware
      let processedAction = { ...action };
      for (const middleware of this.middleware) {
        processedAction = await middleware(processedAction, this.dispatch.bind(this));
        if (!processedAction) {
          // Middleware cancelled the action
          return null;
        }
      }

      // Find handler for this action type
      const handler = this.actionHandlers[processedAction.type];
      if (!handler) {
        logger.warn(`No handler registered for action type: ${processedAction.type}`);
        return null;
      }

      // Dispatch to handler
      const result = await handler(processedAction, this);
      
      // Emit action completed event
      this.eventBus.emit('action:completed', {
        type: processedAction.type,
        metadata: processedAction.metadata,
        success: true,
        payload: processedAction.payload
      });

      return result;
    } catch (error) {
      logger.error(`Error processing action ${action.type}: ${error.message}`);
      logger.debug(error.stack);
      
      // Emit action error event
      this.eventBus.emit('action:error', {
        type: action.type,
        metadata: action.metadata,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Helper to update state and emit events in one operation
   * @param {string} statePath - Path to the state to update
   * @param {*} value - New value
   * @param {Object} action - Original action that triggered this update
   * @param {string} eventType - Event to emit after update
   */
  updateState(statePath, value, action, eventType) {
    // Update the state
    const newState = this.stateStore._updateState(statePath, value, action.metadata);
    
    // Emit specific event if provided
    if (eventType) {
      this.eventBus.emit(eventType, {
        value,
        action: action.type,
        metadata: action.metadata
      });
    }
    
    // Always emit the generic state change event
    this.eventBus.emit('state:changed', {
      path: statePath,
      action: action.type,
      value,
      metadata: action.metadata
    });
    
    return newState;
  }
}

module.exports = ActionBroker;