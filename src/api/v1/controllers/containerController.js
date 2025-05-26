/**
 * Container Controller
 * Handles container-related API requests
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');

/**
 * @desc    Get all containers
 * @route   GET /api/v1/containers
 * @access  Private
 */
const getContainers = asyncHandler(async (req, res) => {
  // Get DockerMonitor from global services
  const { DockerMonitor } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  try {
    // Check for query parameters
    const onlyWithLabels = req.query.withLabels === 'true';
    const labelFilter = req.query.labelPrefix || '';
    
    // Get containers from DockerMonitor
    let containers = [];
    
    // Check if DockerMonitor has a method to get containers
    if (typeof DockerMonitor.getContainers === 'function') {
      containers = await DockerMonitor.getContainers();
    } else if (DockerMonitor.docker) {
      // Use Docker API directly if available
      const dockerContainers = await DockerMonitor.docker.listContainers({
        all: req.query.onlyRunning === 'false'
      });
      containers = dockerContainers;
    } else if (DockerMonitor.containers) {
      // Fallback to containers map if available
      containers = Array.from(DockerMonitor.containers.values());
    }
    
    // Format container data for API response
    const formattedContainers = containers.map(container => {
      const labels = container.Labels || {};
      
      // Extract compose information if available
      const composeProject = labels['com.docker.compose.project'] || null;
      const composeService = labels['com.docker.compose.service'] || null;
      
      // Get hostnames from labels
      const hostnames = [];
      Object.keys(labels).forEach(key => {
        if (key.startsWith('traefik.http.routers.') && key.endsWith('.rule')) {
          const rule = labels[key];
          const hostnameMatch = rule.match(/Host\(`([^`]+)`\)/);
          if (hostnameMatch) {
            hostnames.push(hostnameMatch[1]);
          }
        }
      });
      
      return {
        id: container.Id,
        shortId: container.Id.substring(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        state: container.State,
        status: container.Status,
        image: container.Image,
        labels: labels,
        hostnames: hostnames,
        dnsRecords: [], // Will be populated if needed
        compose: {
          project: composeProject,
          service: composeService
        },
        created: new Date(container.Created * 1000).toISOString(),
        network: {
          mode: container.HostConfig?.NetworkMode || 'default'
        },
        ports: container.Ports || []
      };
    });
    
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    // Apply pagination
    const paginatedContainers = formattedContainers.slice(startIndex, endIndex);
    
    res.json({
      status: 'success',
      data: {
        containers: paginatedContainers,
        total: formattedContainers.length,
        page: page,
        limit: limit
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get container list: ${error.message}`,
      500,
      'CONTAINER_LIST_ERROR'
    );
  }
});

/**
 * @desc    Get a specific container
 * @route   GET /api/v1/containers/:id
 * @access  Private
 */
const getContainer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { DockerMonitor } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  try {
    // Get container details by ID or name
    const container = await DockerMonitor.client.getContainerDetails(id);
    
    if (!container) {
      throw new ApiError(`Container with ID or name ${id} not found`, 404, 'CONTAINER_NOT_FOUND');
    }
    
    // Get associated DNS records if any
    const associatedHostnames = await DockerMonitor.getContainerHostnames(id);
    
    // Format response with detailed information
    const response = {
      id: container.Id,
      shortId: container.Id.substring(0, 12),
      name: container.Name.replace(/^\//, ''),
      created: container.Created,
      state: container.State,
      image: container.Image,
      imageId: container.ImageID,
      command: container.Command,
      labels: container.Config.Labels || {},
      networkSettings: container.NetworkSettings,
      mounts: container.Mounts || [],
      hostConfig: {
        networkMode: container.HostConfig.NetworkMode,
        restartPolicy: container.HostConfig.RestartPolicy
      },
      dnsRecords: {
        hostnames: associatedHostnames,
        count: associatedHostnames.length
      }
    };
    
    res.json({
      status: 'success',
      data: response
    });
  } catch (error) {
    if (error.statusCode === 404) {
      throw error;
    }
    throw new ApiError(
      `Failed to get container details: ${error.message}`,
      500,
      'CONTAINER_DETAILS_ERROR'
    );
  }
});

/**
 * @desc    Get container labels
 * @route   GET /api/v1/containers/:id/labels
 * @access  Private
 */
const getContainerLabels = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { DockerMonitor } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  try {
    // Get container labels using the labelCache
    const labels = await DockerMonitor.labelCache.getContainerLabels(id);
    
    if (!labels) {
      throw new ApiError(`Container with ID or name ${id} not found`, 404, 'CONTAINER_NOT_FOUND');
    }
    
    // Filter by prefix if provided
    const prefix = req.query.prefix || '';
    const filteredLabels = prefix 
      ? Object.fromEntries(
          Object.entries(labels).filter(([key]) => key.startsWith(prefix))
        )
      : labels;
    
    res.json({
      status: 'success',
      data: {
        id,
        labels: filteredLabels,
        count: Object.keys(filteredLabels).length,
        filter: prefix || null
      }
    });
  } catch (error) {
    if (error.statusCode === 404) {
      throw error;
    }
    throw new ApiError(
      `Failed to get container labels: ${error.message}`,
      500,
      'CONTAINER_LABELS_ERROR'
    );
  }
});

/**
 * @desc    Get container hostnames (DNS records)
 * @route   GET /api/v1/containers/:id/hostnames
 * @access  Private
 */
const getContainerHostnames = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { DockerMonitor, DNSManager } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get container hostnames
    const hostnames = await DockerMonitor.getContainerHostnames(id);
    
    if (hostnames === null) {
      throw new ApiError(`Container with ID or name ${id} not found`, 404, 'CONTAINER_NOT_FOUND');
    }
    
    // Get DNS records for these hostnames
    const records = [];
    if (hostnames.length > 0) {
      const allRecords = await DNSManager.dnsProvider.getRecordsFromCache(true);
      
      for (const hostname of hostnames) {
        const matchingRecords = allRecords.filter(
          record => record.name === hostname || record.name.endsWith(`.${hostname}`)
        );
        
        if (matchingRecords.length > 0) {
          records.push(...matchingRecords);
        }
      }
    }
    
    res.json({
      status: 'success',
      data: {
        id,
        hostnames,
        records: records.map(record => ({
          id: record.id,
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl
        })),
        count: hostnames.length,
        recordCount: records.length
      }
    });
  } catch (error) {
    if (error.statusCode === 404) {
      throw error;
    }
    throw new ApiError(
      `Failed to get container hostnames: ${error.message}`,
      500,
      'CONTAINER_HOSTNAMES_ERROR'
    );
  }
});

/**
 * @desc    Get containers by compose project
 * @route   GET /api/v1/containers/compose/:project
 * @access  Private
 */
const getContainersByComposeProject = asyncHandler(async (req, res) => {
  const { project } = req.params;
  const { DockerMonitor } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  try {
    // Get all containers
    const allContainers = await DockerMonitor.client.getContainers({ onlyRunning: false });
    
    // Filter by compose project
    const projectContainers = allContainers.filter(container => {
      const labels = container.Labels || {};
      return labels['com.docker.compose.project'] === project;
    });
    
    if (projectContainers.length === 0) {
      throw new ApiError(`No containers found for compose project ${project}`, 404, 'COMPOSE_PROJECT_NOT_FOUND');
    }
    
    // Group by service
    const serviceGroups = {};
    projectContainers.forEach(container => {
      const labels = container.Labels || {};
      const service = labels['com.docker.compose.service'] || 'unknown';
      
      if (!serviceGroups[service]) {
        serviceGroups[service] = [];
      }
      
      serviceGroups[service].push({
        id: container.Id,
        shortId: container.Id.substring(0, 12),
        name: container.Names[0].replace(/^\//, ''),
        state: container.State,
        status: container.Status
      });
    });
    
    res.json({
      status: 'success',
      data: {
        project,
        services: serviceGroups,
        containerCount: projectContainers.length,
        serviceCount: Object.keys(serviceGroups).length
      }
    });
  } catch (error) {
    if (error.statusCode === 404) {
      throw error;
    }
    throw new ApiError(
      `Failed to get compose project containers: ${error.message}`,
      500,
      'COMPOSE_PROJECT_ERROR'
    );
  }
});

/**
 * @desc    Get Docker monitor status
 * @route   GET /api/v1/containers/status
 * @access  Private
 */
const getDockerStatus = asyncHandler(async (req, res) => {
  const { DockerMonitor } = global.services || {};
  
  if (!DockerMonitor) {
    throw new ApiError('Docker monitor not initialized', 500, 'DOCKER_MONITOR_NOT_INITIALIZED');
  }
  
  try {
    const isConnected = DockerMonitor.isConnected();
    const socketPath = DockerMonitor.config.dockerSocket;
    
    // Get container counts
    let containerCount = 0;
    let runningCount = 0;
    
    if (isConnected) {
      const allContainers = await DockerMonitor.client.getContainers({ onlyRunning: false });
      containerCount = allContainers.length;
      
      const runningContainers = await DockerMonitor.client.getContainers({ onlyRunning: true });
      runningCount = runningContainers.length;
    }
    
    // Get label statistics
    const labelStats = {
      total: 0,
      traefik: 0,
      trafegodns: 0,
      compose: 0
    };

    if (isConnected) {
      const labels = await DockerMonitor.getAllUniqueLabels();
      labelStats.total = Object.keys(labels).length;
      labelStats.traefik = Object.keys(labels).filter(key => key.startsWith('traefik.')).length;
      labelStats.trafegodns = Object.keys(labels).filter(key => key.startsWith('trafegodns.')).length;
      labelStats.compose = Object.keys(labels).filter(key => key.startsWith('com.docker.compose')).length;
    }
    
    res.json({
      status: 'success',
      data: {
        connection: {
          connected: isConnected,
          socketPath,
          error: isConnected ? null : DockerMonitor.lastError || 'Unknown error'
        },
        containers: {
          total: containerCount,
          running: runningCount,
          stopped: containerCount - runningCount
        },
        labels: labelStats,
        monitoring: {
          enabled: DockerMonitor.config.enabled,
          pollInterval: DockerMonitor.config.pollInterval
        }
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get Docker status: ${error.message}`,
      500,
      'DOCKER_STATUS_ERROR'
    );
  }
});

module.exports = {
  getContainers,
  getContainer,
  getContainerLabels,
  getContainerHostnames,
  getContainersByComposeProject,
  getDockerStatus
};