/**
 * Docker Event Processor Module
 * Processes Docker events and translates them to application events
 */
const logger = require('../../utils/logger');
const EventTypes = require('../../events/EventTypes');
const { getContainer } = require('./client');
const { updateContainerMapping, removeContainerMapping } = require('./containerTracker');
const { updateLabelsForContainer } = require('./labelCache');

/**
 * Setup Docker event handlers
 * @param {Stream} events - Docker events stream
 * @param {Object} docker - Docker client
 * @param {Object} containerTracker - Container tracker object
 * @param {Object} labelCache - Label cache object
 * @param {Object} eventBus - Application event bus
 */
function setupEventListeners(events, docker, containerTracker, labelCache, eventBus) {
  if (!events) {
    logger.error('Cannot setup event listeners: No event stream provided');
    return;
  }
  
  logger.debug('Setting up Docker event listeners...');
  
  // Handle stream data events
  events.on('data', async (buffer) => {
    try {
      // Parse the event data
      const eventData = JSON.parse(buffer.toString());
      logger.trace(`Docker event received: ${eventData.Action} ${eventData.Type} ${eventData.Actor?.Attributes?.name || eventData.id}`);
      
      // Only handle container events
      if (eventData.Type !== 'container') {
        return;
      }
      
      // Get container ID
      const containerId = eventData.Actor?.ID || eventData.id;
      if (!containerId) {
        logger.warn('Received container event without ID');
        return;
      }
      
      // Process based on action type
      switch (eventData.Action) {
        case 'start':
          await handleContainerStart(containerId, eventData, docker, containerTracker, labelCache, eventBus);
          break;
          
        case 'die':
        case 'stop':
        case 'kill':
          handleContainerStop(containerId, eventData, containerTracker, labelCache, eventBus);
          break;
          
        case 'destroy':
          handleContainerDestroy(containerId, eventData, containerTracker, labelCache, eventBus);
          break;
          
        default:
          // Ignore other event types
          break;
      }
    } catch (error) {
      logger.error(`Error processing Docker event: ${error.message}`);
    }
  });
  
  // Handle stream errors
  events.on('error', (error) => {
    logger.error(`Docker event stream error: ${error.message}`);
    
    // Publish event
    if (eventBus) {
      eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DockerMonitor.events',
        error: error.message
      });
    }
  });
  
  // Handle stream end
  events.on('end', () => {
    logger.warn('Docker event stream ended');
    
    // Publish event
    if (eventBus) {
      eventBus.publish(EventTypes.DOCKER_EVENTS_DISCONNECTED, {
        message: 'Docker event stream ended unexpectedly'
      });
    }
  });
  
  logger.debug('Docker event listeners configured successfully');
}

/**
 * Handle container start event
 */
async function handleContainerStart(containerId, eventData, docker, containerTracker, labelCache, eventBus) {
  logger.debug(`Container started: ${containerId}`);
  
  try {
    // Get container details
    const container = await getContainer(docker, containerId);
    
    // Update container name mapping
    const name = container.Name || container.Config?.Name;
    if (name) {
      updateContainerMapping(containerTracker, containerId, name);
    }
    
    // Update label cache
    updateLabelsForContainer(labelCache, container);
    
    // Publish container start event
    if (eventBus) {
      eventBus.publish(EventTypes.CONTAINER_STARTED, {
        id: containerId,
        name: name,
        labels: container.Config?.Labels || {}
      });
    }
  } catch (error) {
    logger.error(`Failed to process container start for ${containerId}: ${error.message}`);
  }
}

/**
 * Handle container stop event
 */
function handleContainerStop(containerId, eventData, containerTracker, labelCache, eventBus) {
  // Extract container name from event data
  const containerName = eventData.Actor?.Attributes?.name || containerId.substring(0, 12);
  logger.debug(`Container stopped: ${containerName}`);
  
  // Remove container from tracker
  removeContainerMapping(containerTracker, containerId);
  
  // Remove from label cache
  if (labelCache && labelCache.labels) {
    labelCache.labels.delete(containerId);
  }
  
  // Publish container stop event
  if (eventBus) {
    eventBus.publish(EventTypes.CONTAINER_STOPPED, {
      id: containerId,
      name: containerName
    });
  }
}

/**
 * Handle container destroy event
 */
function handleContainerDestroy(containerId, eventData, containerTracker, labelCache, eventBus) {
  // Extract container name from event data
  const containerName = eventData.Actor?.Attributes?.name || containerId.substring(0, 12);
  logger.debug(`Container destroyed: ${containerName}`);
  
  // Remove container from tracker
  removeContainerMapping(containerTracker, containerId);
  
  // Remove from label cache
  if (labelCache && labelCache.labels) {
    labelCache.labels.delete(containerId);
  }
  
  // Publish container destroy event
  if (eventBus) {
    eventBus.publish(EventTypes.CONTAINER_DESTROYED, {
      id: containerId,
      name: containerName
    });
  }
}

module.exports = {
  setupEventListeners
};