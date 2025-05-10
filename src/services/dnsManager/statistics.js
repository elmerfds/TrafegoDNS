/**
 * Statistics Manager for DNS operations
 * Tracks and logs statistics about DNS records
 */
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');

/**
 * Create new statistics tracking object
 */
function createStats() {
  return {
    created: 0,
    updated: 0,
    upToDate: 0,
    errors: 0,
    total: 0
  };
}

/**
 * Reset previous statistics tracking
 */
function createPreviousStats() {
  return {
    upToDateCount: 0,
    hostnameCount: 0
  };
}

/**
 * Log statistics about processed DNS records
 * @param {Object} stats - Current statistics object
 * @param {Object} previousStats - Previous statistics for comparison
 * @param {Object} eventBus - Event bus for publishing events
 */
function logStats(stats, previousStats, eventBus) {
  if (stats.total > 0) {
    if (stats.created > 0) {
      logger.success(`Created ${stats.created} new DNS records`);
      
      // Publish event for each creation (for metrics/monitoring)
      if (eventBus) {
        eventBus.publish(EventTypes.DNS_RECORD_CREATED, {
          count: stats.created
        });
      }
    }
    
    if (stats.updated > 0) {
      logger.success(`Updated ${stats.updated} existing DNS records`);
      
      // Publish event for each update
      if (eventBus) {
        eventBus.publish(EventTypes.DNS_RECORD_UPDATED, {
          count: stats.updated
        });
      }
    }
    
    // Only log "up to date" records if the count has changed
    if (stats.upToDate > 0) {
      const hasUpToDateChanged = previousStats.upToDateCount !== stats.upToDate;
      
      if (hasUpToDateChanged) {
        logger.info(`${stats.upToDate} DNS records are up to date`);
      } else {
        // Log at debug level instead of info when nothing has changed
        logger.debug(`${stats.upToDate} DNS records are up to date`);
      }
      
      // Update for next comparison
      previousStats.upToDateCount = stats.upToDate;
    }
    
    if (stats.errors > 0) {
      logger.warn(`Encountered ${stats.errors} errors processing DNS records`);
    }
  }
}

module.exports = {
  createStats,
  createPreviousStats,
  logStats
};