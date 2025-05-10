/**
 * Docker Client Module
 * Handles Docker API connections and basic operations
 */
const Docker = require('dockerode');
const logger = require('../../utils/logger');

/**
 * Initialize a Docker client
 * @param {string} socketPath - Path to the Docker socket
 * @returns {Docker} - Docker client instance
 */
function createClient(socketPath) {
  logger.debug(`Initializing Docker client with socket: ${socketPath}`);
  return new Docker({ socketPath });
}

/**
 * Test the Docker connection
 * @param {Docker} docker - Docker client instance
 * @returns {boolean} - Whether the connection is successful
 */
async function testConnection(docker) {
  try {
    logger.debug('Testing Docker connection...');
    const info = await docker.info();
    logger.debug(`Connected to Docker: ${info.Name} (${info.ServerVersion})`);
    return true;
  } catch (error) {
    logger.error(`Docker connection test failed: ${error.message}`);
    return false;
  }
}

/**
 * Get Docker events stream
 * @param {Docker} docker - Docker client instance
 * @returns {Object} - Docker event stream
 */
async function getEvents(docker) {
  logger.debug('Getting Docker event stream...');
  
  try {
    const events = await docker.getEvents({
      filters: JSON.stringify({
        type: ['container']
      })
    });
    
    logger.trace('Docker event stream obtained successfully');
    return events;
  } catch (error) {
    logger.error(`Failed to get Docker events: ${error.message}`);
    throw error;
  }
}

/**
 * List containers with filter options
 * @param {Docker} docker - Docker client instance
 * @param {Object} options - Filter options
 * @param {boolean} [options.onlyRunning=true] - Only list running containers
 * @param {boolean} [options.withLabels=false] - Only include containers with labels
 * @param {string} [options.labelPrefix=''] - Filter by label prefix
 * @returns {Array} - Array of container objects
 */
async function listContainers(docker, options = {}) {
  const { onlyRunning = true, withLabels = false, labelPrefix = '' } = options;
  logger.debug(`Listing Docker containers (onlyRunning=${onlyRunning}, withLabels=${withLabels}, labelPrefix=${labelPrefix})`);

  try {
    // Prepare filters
    const filters = {};

    if (onlyRunning) {
      filters.status = ['running'];
    }

    if (withLabels && labelPrefix) {
      // Filter containers with the specific label prefix
      filters.label = [`${labelPrefix}`];
    }

    const containers = await docker.listContainers({
      all: !onlyRunning,
      filters: Object.keys(filters).length > 0 ? filters : undefined
    });

    logger.debug(`Found ${containers.length} containers matching criteria`);
    return containers;
  } catch (error) {
    logger.error(`Failed to list containers: ${error.message}`);
    throw error;
  }
}

/**
 * Get a container by ID
 * @param {Docker} docker - Docker client instance
 * @param {string} id - Container ID
 * @returns {Object} - Container object
 */
async function getContainer(docker, id) {
  logger.trace(`Getting container details for ID: ${id}`);
  
  try {
    const container = docker.getContainer(id);
    const details = await container.inspect();
    return details;
  } catch (error) {
    logger.error(`Failed to get container ${id}: ${error.message}`);
    throw error;
  }
}

/**
 * Get container details by ID or name
 * @param {Docker} docker - Docker client instance
 * @param {string} idOrName - Container ID or name
 * @returns {Object} Container details or null if not found
 */
async function getContainerDetails(docker, idOrName) {
  logger.debug(`Getting container details for: ${idOrName}`);

  try {
    // First try to get container by ID directly
    try {
      const container = docker.getContainer(idOrName);
      const details = await container.inspect();
      return details;
    } catch (error) {
      // If that fails, it might be a name - list all containers and find by name
      if (error.statusCode === 404) {
        logger.debug(`Container with ID ${idOrName} not found, trying to find by name`);
        const containers = await docker.listContainers({ all: true });

        // Find container with matching name (removing leading slash)
        const matchingContainer = containers.find(c => {
          return c.Names.some(name => {
            const cleanName = name.replace(/^\//, '');
            return cleanName === idOrName || name === idOrName;
          });
        });

        if (matchingContainer) {
          const container = docker.getContainer(matchingContainer.Id);
          const details = await container.inspect();
          return details;
        }

        // Container not found by ID or name
        logger.error(`Container with ID or name ${idOrName} not found`);
        const notFoundError = new Error(`Container with ID or name ${idOrName} not found`);
        notFoundError.statusCode = 404;
        throw notFoundError;
      } else {
        // Other error
        throw error;
      }
    }
  } catch (error) {
    logger.error(`Failed to get container details for ${idOrName}: ${error.message}`);
    throw error;
  }
}

/**
 * Get all container labels
 * @param {Docker} docker - Docker client instance
 * @returns {Object} - Map of container IDs to their labels
 */
async function getAllContainerLabels(docker) {
  logger.debug('Getting all container labels');

  try {
    const containers = await docker.listContainers({ all: true });
    const labelMap = {};

    for (const container of containers) {
      labelMap[container.Id] = container.Labels || {};
    }

    return labelMap;
  } catch (error) {
    logger.error(`Failed to get all container labels: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createClient,
  testConnection,
  getEvents,
  listContainers,
  getContainer,
  getContainerDetails,
  getAllContainerLabels
};