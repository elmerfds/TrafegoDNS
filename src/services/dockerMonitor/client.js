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
 * List all running containers
 * @param {Docker} docker - Docker client instance
 * @returns {Array} - Array of container objects
 */
async function listContainers(docker) {
  logger.debug('Listing Docker containers...');
  
  try {
    const containers = await docker.listContainers();
    logger.debug(`Found ${containers.length} running containers`);
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

module.exports = {
  createClient,
  testConnection,
  getEvents,
  listContainers,
  getContainer
};