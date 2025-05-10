/**
 * Container Label Cache Module
 * Manages caching and retrieval of container labels
 */
const logger = require('../../utils/logger');
const { getContainer } = require('./client');

/**
 * Create a new label cache
 * @returns {Object} - Label cache object
 */
function createLabelCache() {
  return {};
}

/**
 * Extract labels from container object
 * @param {Object} container - Container object from Docker API
 * @returns {Object} - Container labels
 */
function extractLabelsFromContainer(container) {
  // Check if container has Config and Labels
  if (!container || !container.Config || !container.Config.Labels) {
    return {};
  }
  
  return container.Config.Labels;
}

/**
 * Update labels in cache for a specific container
 * @param {Object} cache - Label cache object
 * @param {Object} container - Container object
 * @returns {Object} - Updated labels
 */
function updateLabelsForContainer(cache, container) {
  if (!container || !container.Id || !container.Config) {
    logger.warn('Invalid container provided to updateLabelsForContainer');
    return null;
  }
  
  const id = container.Id;
  const labels = extractLabelsFromContainer(container);
  
  cache[id] = labels;
  logger.trace(`Updated label cache for container ${id} with ${Object.keys(labels).length} labels`);
  
  return labels;
}

/**
 * Get labels for a container
 * @param {Object} cache - Label cache object
 * @param {string} id - Container ID
 * @returns {Object} - Container labels
 */
function getLabelsForContainer(cache, id) {
  if (!id) return {};

  return cache[id] || {};
}

/**
 * Get all labels from the cache
 * @param {Object} cache - Label cache object
 * @returns {Object} - All container labels
 */
function getAllLabels(cache) {
  // Create a flattened object of all labels
  const allLabels = {};

  Object.keys(cache).forEach(containerId => {
    const containerLabels = cache[containerId];
    Object.keys(containerLabels).forEach(labelKey => {
      // Store unique labels with their values
      allLabels[labelKey] = containerLabels[labelKey];
    });
  });

  return allLabels;
}

/**
 * Update the label cache from containers list
 * @param {Object} cache - Label cache object
 * @param {Docker} docker - Docker client
 * @param {Array} containers - List of containers
 */
async function updateLabelCacheFromContainers(cache, docker, containers) {
  logger.debug(`Updating label cache for ${containers.length} containers...`);
  
  let updateCount = 0;
  
  for (const containerSummary of containers) {
    try {
      const details = await getContainer(docker, containerSummary.Id);
      updateLabelsForContainer(cache, details);
      updateCount++;
    } catch (error) {
      logger.debug(`Failed to update labels for container ${containerSummary.Id}: ${error.message}`);
    }
  }
  
  logger.debug(`Updated labels for ${updateCount} containers in cache`);
}

module.exports = {
  createLabelCache,
  extractLabelsFromContainer,
  updateLabelsForContainer,
  getLabelsForContainer,
  getAllLabels,
  updateLabelCacheFromContainers
};