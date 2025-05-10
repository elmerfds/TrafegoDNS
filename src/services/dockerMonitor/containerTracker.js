/**
 * Container Tracker Module
 * Tracks container IDs, names, and state changes
 */
const logger = require('../../utils/logger');

/**
 * Create a new container tracker
 * @returns {Object} - Container tracker object
 */
function createContainerTracker() {
  return {
    // Map of container IDs to names
    containerIdToName: new Map()
  };
}

/**
 * Update container ID to name mapping
 * @param {Object} tracker - Container tracker object
 * @param {string} id - Container ID
 * @param {string} name - Container name
 */
function updateContainerMapping(tracker, id, name) {
  if (!id || !name) {
    logger.warn(`Invalid container mapping: ID=${id}, Name=${name}`);
    return;
  }
  
  // Clean up container name
  const cleanName = name.startsWith('/') ? name.substring(1) : name;
  
  // Update the mapping
  tracker.containerIdToName.set(id, cleanName);
  logger.trace(`Updated container mapping: ${id} → ${cleanName}`);
}

/**
 * Get container name by ID
 * @param {Object} tracker - Container tracker object
 * @param {string} id - Container ID
 * @returns {string|null} - Container name or null if not found
 */
function getContainerName(tracker, id) {
  if (!id) return null;
  
  // Handle short IDs
  if (id.length < 64) {
    // Find a matching ID that starts with this prefix
    for (const [containerId, name] of tracker.containerIdToName.entries()) {
      if (containerId.startsWith(id)) {
        logger.trace(`Resolved short ID ${id} to container "${name}"`);
        return name;
      }
    }
  }
  
  // Check for exact match
  return tracker.containerIdToName.get(id) || null;
}

/**
 * Update container tracker with data from containers
 * @param {Object} tracker - Container tracker object
 * @param {Array} containers - Array of container objects
 */
function updateFromContainerList(tracker, containers) {
  if (!containers || !Array.isArray(containers)) {
    logger.warn('Invalid container list provided to updateFromContainerList');
    return;
  }
  
  // Track how many mappings we add
  let count = 0;
  
  for (const container of containers) {
    if (container.Id && container.Names && container.Names.length > 0) {
      updateContainerMapping(tracker, container.Id, container.Names[0]);
      count++;
    }
  }
  
  logger.debug(`Updated ${count} container ID-to-name mappings`);
}

module.exports = {
  createContainerTracker,
  updateContainerMapping,
  getContainerName,
  updateFromContainerList
};