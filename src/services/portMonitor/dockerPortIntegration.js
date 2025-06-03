/**
 * Docker Port Integration
 * Integrates port monitoring with Docker container lifecycle events
 */
const logger = require('../../utils/logger');
const { EventBus } = require('../../events/EventBus');
const EventTypes = require('../../events/EventTypes');

class DockerPortIntegration {
  constructor(conflictDetector, suggestionEngine, eventBus) {
    this.conflictDetector = conflictDetector;
    this.suggestionEngine = suggestionEngine;
    this.eventBus = eventBus || EventBus;
    this.isInitialized = false;
    
    // Container port mappings cache
    this.containerPorts = new Map();
    
    // Active monitoring sessions
    this.monitoringSessions = new Map();
    
    // Integration configuration
    this.config = {
      autoReservePorts: true,           // Automatically reserve ports for containers
      validateBeforeStart: true,       // Validate ports before container start
      suggestAlternatives: true,       // Suggest alternatives when conflicts found
      monitorRunningContainers: true,  // Monitor running containers for port changes
      releaseOnStop: true,             // Release reservations when container stops
      reservationDuration: 3600        // Default reservation duration (1 hour)
    };
  }

  /**
   * Initialize the Docker integration
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Docker Port Integration');

      // Bind to Docker events
      this._bindDockerEvents();

      this.isInitialized = true;
      logger.info('Docker Port Integration initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize Docker Port Integration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate container deployment before start
   * @param {Object} containerConfig - Container configuration
   * @returns {Promise<Object>}
   */
  async validateContainerDeployment(containerConfig) {
    try {
      const {
        id: containerId,
        name: containerName,
        Config: config = {},
        HostConfig: hostConfig = {},
        NetworkSettings: networkSettings = {}
      } = containerConfig;

      // Extract port information
      const portInfo = this._extractPortInformation(config, hostConfig, networkSettings);
      
      if (portInfo.exposedPorts.length === 0) {
        return {
          valid: true,
          message: 'No ports exposed by container',
          conflicts: [],
          suggestions: []
        };
      }

      logger.debug(`Validating container ${containerName} with ports: ${portInfo.exposedPorts.join(', ')}`);

      // Check for conflicts
      const conflicts = await this.conflictDetector.detectConflicts(
        portInfo.exposedPorts,
        'tcp', // TODO: Support UDP
        containerId
      );

      let suggestions = [];
      if (conflicts.length > 0 && this.config.suggestAlternatives) {
        const suggestionResult = await this.suggestionEngine.suggestAlternativePorts(
          portInfo.exposedPorts,
          'tcp'
        );
        suggestions = suggestionResult;
      }

      const result = {
        valid: conflicts.length === 0,
        containerId,
        containerName,
        ports: portInfo,
        conflicts,
        suggestions,
        message: conflicts.length === 0 
          ? 'Container deployment validation passed' 
          : `${conflicts.length} port conflicts detected`
      };

      // Emit validation event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'deployment_validated',
        containerId,
        containerName,
        result,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error(`Failed to validate container deployment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle container pre-start operations
   * @param {Object} containerInfo - Container information
   * @returns {Promise<Object>}
   */
  async handleContainerPreStart(containerInfo) {
    try {
      const { id: containerId, name: containerName } = containerInfo;

      // Validate deployment
      const validation = await this.validateContainerDeployment(containerInfo);
      
      if (!validation.valid) {
        logger.warn(`Container ${containerName} has port conflicts`);
        
        if (this.config.suggestAlternatives && validation.suggestions.length > 0) {
          return {
            proceed: false,
            reason: 'port_conflicts',
            validation,
            recommendedAction: 'use_alternative_ports'
          };
        } else {
          return {
            proceed: false,
            reason: 'port_conflicts',
            validation,
            recommendedAction: 'resolve_conflicts'
          };
        }
      }

      // Auto-reserve ports if enabled
      if (this.config.autoReservePorts && validation.ports.exposedPorts.length > 0) {
        await this._reserveContainerPorts(
          containerId,
          containerName,
          validation.ports.exposedPorts
        );
      }

      return {
        proceed: true,
        validation,
        message: 'Container pre-start validation passed'
      };
    } catch (error) {
      logger.error(`Failed to handle container pre-start: ${error.message}`);
      return {
        proceed: false,
        reason: 'validation_error',
        error: error.message
      };
    }
  }

  /**
   * Handle container start event
   * @param {Object} containerInfo - Container information
   * @returns {Promise<void>}
   */
  async handleContainerStart(containerInfo) {
    try {
      const { id: containerId, name: containerName } = containerInfo;

      logger.debug(`Handling container start: ${containerName} (${containerId})`);

      // Extract and cache port information
      const portInfo = this._extractPortInformation(
        containerInfo.Config || {},
        containerInfo.HostConfig || {},
        containerInfo.NetworkSettings || {}
      );

      this.containerPorts.set(containerId, {
        containerName,
        ports: portInfo,
        startTime: new Date().toISOString()
      });

      // Start monitoring if enabled
      if (this.config.monitorRunningContainers && portInfo.exposedPorts.length > 0) {
        this._startContainerPortMonitoring(containerId, containerName, portInfo.exposedPorts);
      }

      // Emit event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'container_started',
        containerId,
        containerName,
        ports: portInfo.exposedPorts,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Container ${containerName} started with ports: ${portInfo.exposedPorts.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to handle container start: ${error.message}`);
    }
  }

  /**
   * Handle container stop event
   * @param {Object} containerInfo - Container information
   * @returns {Promise<void>}
   */
  async handleContainerStop(containerInfo) {
    try {
      const { id: containerId, name: containerName } = containerInfo;

      logger.debug(`Handling container stop: ${containerName} (${containerId})`);

      // Get cached port information
      const cachedInfo = this.containerPorts.get(containerId);
      
      // Stop monitoring
      this._stopContainerPortMonitoring(containerId);

      // Release reservations if enabled
      if (this.config.releaseOnStop && cachedInfo) {
        await this._releaseContainerPorts(containerId, cachedInfo.ports.exposedPorts);
      }

      // Clean up cache
      this.containerPorts.delete(containerId);

      // Emit event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'container_stopped',
        containerId,
        containerName,
        ports: cachedInfo ? cachedInfo.ports.exposedPorts : [],
        timestamp: new Date().toISOString()
      });

      logger.debug(`Container ${containerName} stopped, ports released`);
    } catch (error) {
      logger.error(`Failed to handle container stop: ${error.message}`);
    }
  }

  /**
   * Get port information for a container
   * @param {string} containerId - Container ID
   * @returns {Object|null}
   */
  getContainerPortInfo(containerId) {
    return this.containerPorts.get(containerId) || null;
  }

  /**
   * Get all monitored containers
   * @returns {Map}
   */
  getMonitoredContainers() {
    return new Map(this.containerPorts);
  }

  /**
   * Update integration configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Docker Port Integration configuration updated', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Stop the Docker integration
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      logger.info('Stopping Docker Port Integration');

      // Stop all monitoring sessions
      for (const [containerId, session] of this.monitoringSessions.entries()) {
        this.conflictDetector.stopConflictMonitoring(session);
      }
      this.monitoringSessions.clear();

      // Clear container cache
      this.containerPorts.clear();

      this.isInitialized = false;
      logger.info('Docker Port Integration stopped');
    } catch (error) {
      logger.error(`Error stopping Docker Port Integration: ${error.message}`);
    }
  }

  /**
   * Extract port information from container configuration
   * @param {Object} config - Container config
   * @param {Object} hostConfig - Host config
   * @param {Object} networkSettings - Network settings
   * @returns {Object}
   * @private
   */
  _extractPortInformation(config, hostConfig, networkSettings) {
    const exposedPorts = [];
    const portMappings = [];

    // Extract exposed ports from config
    if (config.ExposedPorts) {
      for (const portSpec in config.ExposedPorts) {
        const match = portSpec.match(/^(\d+)\/?(tcp|udp)?$/);
        if (match) {
          exposedPorts.push(parseInt(match[1]));
        }
      }
    }

    // Extract port mappings from host config
    if (hostConfig.PortBindings) {
      for (const [containerPort, hostBindings] of Object.entries(hostConfig.PortBindings)) {
        if (hostBindings) {
          const match = containerPort.match(/^(\d+)\/?(tcp|udp)?$/);
          if (match) {
            const port = parseInt(match[1]);
            const protocol = match[2] || 'tcp';
            
            hostBindings.forEach(binding => {
              if (binding.HostPort) {
                portMappings.push({
                  containerPort: port,
                  hostPort: parseInt(binding.HostPort),
                  hostIp: binding.HostIp || '0.0.0.0',
                  protocol
                });
              }
            });
          }
        }
      }
    }

    // Extract actual port mappings from network settings
    const actualMappings = [];
    if (networkSettings.Ports) {
      for (const [containerPort, hostBindings] of Object.entries(networkSettings.Ports)) {
        if (hostBindings) {
          const match = containerPort.match(/^(\d+)\/?(tcp|udp)?$/);
          if (match) {
            const port = parseInt(match[1]);
            const protocol = match[2] || 'tcp';
            
            hostBindings.forEach(binding => {
              if (binding.HostPort) {
                actualMappings.push({
                  containerPort: port,
                  hostPort: parseInt(binding.HostPort),
                  hostIp: binding.HostIp || '0.0.0.0',
                  protocol
                });
              }
            });
          }
        }
      }
    }

    // Collect all host ports that are actually bound
    const boundPorts = [
      ...portMappings.map(m => m.hostPort),
      ...actualMappings.map(m => m.hostPort)
    ];

    return {
      exposedPorts: [...new Set([...exposedPorts, ...boundPorts])],
      portMappings,
      actualMappings,
      boundPorts: [...new Set(boundPorts)]
    };
  }

  /**
   * Reserve ports for a container
   * @param {string} containerId - Container ID
   * @param {string} containerName - Container name
   * @param {Array<number>} ports - Ports to reserve
   * @private
   */
  async _reserveContainerPorts(containerId, containerName, ports) {
    try {
      // Note: This would call the reservation manager through the main PortMonitor
      // For now, we'll emit an event that the main service can handle
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'reservation_requested',
        containerId,
        containerName,
        ports,
        duration: this.config.reservationDuration,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Requested port reservations for container ${containerName}: ${ports.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to reserve ports for container ${containerName}: ${error.message}`);
    }
  }

  /**
   * Release ports for a container
   * @param {string} containerId - Container ID
   * @param {Array<number>} ports - Ports to release
   * @private
   */
  async _releaseContainerPorts(containerId, ports) {
    try {
      // Note: This would call the reservation manager through the main PortMonitor
      // For now, we'll emit an event that the main service can handle
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'release_requested',
        containerId,
        ports,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Requested port release for container ${containerId}: ${ports.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to release ports for container ${containerId}: ${error.message}`);
    }
  }

  /**
   * Start monitoring ports for a container
   * @param {string} containerId - Container ID
   * @param {string} containerName - Container name
   * @param {Array<number>} ports - Ports to monitor
   * @private
   */
  _startContainerPortMonitoring(containerId, containerName, ports) {
    if (ports.length === 0) return;

    try {
      const monitor = this.conflictDetector.startConflictMonitoring(
        ports,
        'tcp',
        (event) => {
          this._handlePortMonitoringEvent(containerId, containerName, event);
        }
      );

      this.monitoringSessions.set(containerId, monitor);
      logger.debug(`Started port monitoring for container ${containerName}: ${ports.join(', ')}`);
    } catch (error) {
      logger.error(`Failed to start port monitoring for container ${containerName}: ${error.message}`);
    }
  }

  /**
   * Stop monitoring ports for a container
   * @param {string} containerId - Container ID
   * @private
   */
  _stopContainerPortMonitoring(containerId) {
    const session = this.monitoringSessions.get(containerId);
    if (session) {
      this.conflictDetector.stopConflictMonitoring(session);
      this.monitoringSessions.delete(containerId);
      logger.debug(`Stopped port monitoring for container ${containerId}`);
    }
  }

  /**
   * Handle port monitoring events
   * @param {string} containerId - Container ID
   * @param {string} containerName - Container name
   * @param {Object} event - Monitoring event
   * @private
   */
  _handlePortMonitoringEvent(containerId, containerName, event) {
    try {
      logger.debug(`Port monitoring event for container ${containerName}:`, event);

      // Emit the event for other systems to handle
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'container_port_change',
        containerId,
        containerName,
        monitoringEvent: event,
        timestamp: new Date().toISOString()
      });

      // Check if we need to create alerts
      if (event.changes) {
        for (const change of event.changes) {
          if (change.type === 'conflict_detected') {
            this.eventBus.emit(EventTypes.PORT_ALERT_CREATED, {
              type: 'container_port_conflict',
              containerId,
              containerName,
              port: change.conflict.port,
              conflict: change.conflict,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to handle port monitoring event: ${error.message}`);
    }
  }

  /**
   * Bind to Docker events
   * @private
   */
  _bindDockerEvents() {
    // Listen for container lifecycle events
    this.eventBus.on(EventTypes.CONTAINER_STARTED, async (containerInfo) => {
      await this.handleContainerStart(containerInfo);
    });

    this.eventBus.on(EventTypes.CONTAINER_STOPPED, async (containerInfo) => {
      await this.handleContainerStop(containerInfo);
    });

    this.eventBus.on(EventTypes.CONTAINER_DESTROYED, async (containerInfo) => {
      await this.handleContainerStop(containerInfo);
    });

    // Listen for Docker events
    this.eventBus.on(EventTypes.DOCKER_CONTAINER_STARTED, async (event) => {
      if (event.containerInfo) {
        await this.handleContainerStart(event.containerInfo);
      }
    });

    this.eventBus.on(EventTypes.DOCKER_CONTAINER_STOPPED, async (event) => {
      if (event.containerInfo) {
        await this.handleContainerStop(event.containerInfo);
      }
    });

    logger.debug('Docker Port Integration event bindings configured');
  }
}

module.exports = DockerPortIntegration;