/**
 * Event Bus for application-wide event handling
 * Implements a pub/sub pattern for decoupled communication with wildcard support
 */
const EventEmitter = require('events');
const logger = require('../utils/logger');
const EventTypes = require('./EventTypes');

class EventBus {
  constructor() {
    this.emitter = new EventEmitter();

    // Set higher limit for listeners to avoid warnings
    this.emitter.setMaxListeners(100);

    // Track number of subscribers for debugging
    this.subscriberCounts = {};

    // Track wildcard subscribers
    this.wildcardSubscribers = {};

    // Setup debug logging of events if in TRACE mode
    if (logger.level >= 4) { // TRACE level
      this.setupDebugLogging();
    }
  }

  /**
   * Subscribe to an event with support for wildcards
   * @param {string} eventType - Event type (can include wildcards like 'dns:*')
   * @param {Function} handler - Event handler function
   * @returns {Function} - Unsubscribe function for cleanup
   */
  subscribe(eventType, handler) {
    // Support exact matches via Node's EventEmitter
    if (!eventType.includes('*')) {
      this.emitter.on(eventType, handler);

      // Track subscriber counts
      this.subscriberCounts[eventType] = (this.subscriberCounts[eventType] || 0) + 1;
      logger.debug(`Subscribed to event ${eventType} (${this.subscriberCounts[eventType]} subscribers)`);

      // Return unsubscribe function for cleanup
      return () => {
        this.emitter.off(eventType, handler);
        this.subscriberCounts[eventType] = (this.subscriberCounts[eventType] || 1) - 1;
        logger.debug(`Unsubscribed from event ${eventType} (${this.subscriberCounts[eventType]} subscribers)`);
      };
    }

    // Handle wildcard subscriptions
    if (!this.wildcardSubscribers[eventType]) {
      this.wildcardSubscribers[eventType] = [];
    }

    this.wildcardSubscribers[eventType].push(handler);
    logger.debug(`Subscribed to wildcard event ${eventType} (${this.wildcardSubscribers[eventType].length} subscribers)`);

    // Return unsubscribe function for cleanup
    return () => {
      this.wildcardSubscribers[eventType] = this.wildcardSubscribers[eventType].filter(h => h !== handler);
      logger.debug(`Unsubscribed from wildcard event ${eventType} (${this.wildcardSubscribers[eventType].length} subscribers)`);
    };
  }

  /**
   * Emit an event (new preferred method name)
   * @param {string} eventType - Event type to emit
   * @param {Object} data - Event data
   */
  emit(eventType, data = {}) {
    this.publish(eventType, data);
  }

  /**
   * Publish an event (maintained for backward compatibility)
   * @param {string} eventType - Event type to publish
   * @param {Object} data - Event data
   */
  publish(eventType, data = {}) {
    // Add timestamp if not already present
    const eventData = {
      ...data,
      _timestamp: data._timestamp || new Date().toISOString(),
      _eventType: eventType
    };

    // Log for debugging
    if (process.env.DEBUG_MODE === 'true') {
      logger.debug(`Publishing event: ${eventType}`);
    }

    // Emit to exact subscribers
    this.emitter.emit(eventType, eventData);

    // Handle wildcard subscribers
    Object.keys(this.wildcardSubscribers).forEach(pattern => {
      const regex = this.wildcardToRegex(pattern);
      if (regex.test(eventType)) {
        this.wildcardSubscribers[pattern].forEach(handler => {
          try {
            handler(eventData);
          } catch (error) {
            logger.error(`Error in wildcard handler for pattern ${pattern} on event ${eventType}: ${error.message}`);
          }
        });
      }
    });

    // Always emit to '*' subscribers
    this.emitter.emit('*', {
      eventType,
      data: eventData
    });
  }

  /**
   * Convert wildcard pattern to regex for matching
   * @param {string} pattern - Wildcard pattern (e.g., 'dns:*', '*.created')
   * @returns {RegExp} - Regular expression for matching
   * @private
   */
  wildcardToRegex(pattern) {
    const escapedPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*'); // Replace * with regex .*

    return new RegExp(`^${escapedPattern}$`);
  }

  /**
   * Setup debug logging of all events
   * Only active in TRACE log level
   */
  setupDebugLogging() {
    // Subscribe to all events with wildcard
    this.subscribe('*', (data) => {
      logger.trace(`EVENT: ${data.eventType} - ${JSON.stringify(data.data)}`);
    });

    logger.debug('Event debug logging enabled');
  }
}

module.exports = { EventBus };