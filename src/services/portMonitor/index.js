/**
 * Port Monitor Service
 * Orchestrates port monitoring, conflict detection, and reservation management
 */
const logger = require('../../utils/logger');
const { EventBus } = require('../../events/EventBus');
const EventTypes = require('../../events/EventTypes');
const { cacheManager } = require('../../utils/cacheManager');
const PortAvailabilityChecker = require('./portAvailabilityChecker');
const PortReservationManager = require('./portReservationManager');
const PortConflictDetector = require('./portConflictDetector');
const PortSuggestionEngine = require('./portSuggestionEngine');
const DockerPortIntegration = require('./dockerPortIntegration');

class PortMonitor {
  constructor(config, database, eventBus) {
    this.config = config;
    this.database = database;
    this.eventBus = eventBus; // Use provided eventBus
    this.isInitialized = false;
    this.isRunning = false;
    
    // Initialize sub-modules
    this.availabilityChecker = new PortAvailabilityChecker(config);
    this.reservationManager = new PortReservationManager(database);
    this.conflictDetector = new PortConflictDetector(this.availabilityChecker, this.reservationManager);
    this.suggestionEngine = new PortSuggestionEngine(this.availabilityChecker, this.reservationManager, config);
    this.dockerIntegration = new DockerPortIntegration(this.conflictDetector, this.suggestionEngine, this.eventBus);
    
    // Configure host IP if provided in config
    if (config.hostIp) {
      logger.info(`🔧 Setting host IP for port monitoring: ${config.hostIp}`);
      this.availabilityChecker.setHostIp(config.hostIp, false); // Don't validate during initialization
    }
    
    // Register cache namespaces for port monitoring state
    cacheManager.registerCache('port_monitor_state', {
      ttl: 0, // No TTL for persistent state
      maxSize: 5000,
      invalidateOn: ['port:status_changed', 'monitoring:stopped'],
      keyPrefix: 'monitor'
    });
    
    cacheManager.registerCache('port_documentation', {
      ttl: 0, // No TTL for persistent documentation
      maxSize: 1000,
      invalidateOn: ['documentation:updated'],
      keyPrefix: 'docs'
    });
    
    // Initialize empty state in centralized cache and fallback properties
    try {
      cacheManager.set('port_monitor_state', 'monitoredPorts', new Map());
      cacheManager.set('port_monitor_state', 'portChanges', new Map());
    } catch (cacheError) {
      logger.warn(`Failed to initialize cache, using fallback properties: ${cacheError.message}`);
    }
    
    // Fallback properties in case cache fails
    this._monitoredPortsFallback = new Map();
    this._portChangesFallback = new Map();
    this.scanInterval = null;
    
    // Configuration
    this.scanIntervalMs = config.PORT_SCAN_INTERVAL || 30000; // 30 seconds
    this.enableRealTimeMonitoring = config.ENABLE_REAL_TIME_PORT_MONITORING !== 'false';
    this.portRanges = this._parsePortRanges(config.PORT_RANGES || '3000-9999');
    this.excludedPorts = this._parseExcludedPorts(config.EXCLUDED_PORTS || '22,80,443');
    
    this._bindEvents();
    
    logger.info('PortMonitor initialized with centralized cache');
  }

  // Helper methods for centralized cache operations with fallbacks
  _getMonitoredPorts() {
    try {
      return cacheManager.get('port_monitor_state', 'monitoredPorts') || new Map();
    } catch (error) {
      logger.warn(`Failed to get monitored ports from cache, using fallback: ${error.message}`);
      return this._monitoredPortsFallback || new Map();
    }
  }

  _setMonitoredPorts(ports) {
    try {
      cacheManager.set('port_monitor_state', 'monitoredPorts', ports);
    } catch (error) {
      logger.warn(`Failed to set monitored ports in cache, using fallback: ${error.message}`);
      this._monitoredPortsFallback = ports;
    }
  }

  _getPortChanges() {
    try {
      return cacheManager.get('port_monitor_state', 'portChanges') || new Map();
    } catch (error) {
      logger.warn(`Failed to get port changes from cache, using fallback: ${error.message}`);
      return this._portChangesFallback || new Map();
    }
  }

  _setPortChanges(changes) {
    try {
      cacheManager.set('port_monitor_state', 'portChanges', changes);
    } catch (error) {
      logger.warn(`Failed to set port changes in cache, using fallback: ${error.message}`);
      this._portChangesFallback = changes;
    }
  }

  _getPortDocumentation() {
    return cacheManager.get('port_documentation', 'portDocs') || new Map();
  }

  _setPortDocumentation(docs) {
    cacheManager.set('port_documentation', 'portDocs', docs);
  }

  _getPortLabels() {
    return cacheManager.get('port_documentation', 'portLabels') || new Map();
  }

  _setPortLabels(labels) {
    cacheManager.set('port_documentation', 'portLabels', labels);
  }

  // Property accessors for backward compatibility
  get monitoredPorts() {
    return this._getMonitoredPorts();
  }

  set monitoredPorts(value) {
    this._setMonitoredPorts(value);
  }

  get portChanges() {
    return this._getPortChanges();
  }

  set portChanges(value) {
    this._setPortChanges(value);
  }

  /**
   * Initialize the port monitor
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      logger.info('Initializing PortMonitor service');

      // Initialize sub-modules
      logger.debug('🔧 Initializing port reservation manager...');
      await this.reservationManager.initialize();
      logger.debug('✅ Port reservation manager initialized');

      logger.debug('🔧 Initializing Docker port integration...');
      await this.dockerIntegration.initialize();
      logger.debug('✅ Docker port integration initialized');

      // Perform initial port scan
      logger.debug('🔧 Performing initial port scan...');
      await this._performInitialScan();
      logger.debug('✅ Initial port scan completed');

      // Start real-time monitoring if enabled
      if (this.enableRealTimeMonitoring) {
        logger.debug('🔧 Starting real-time port monitoring...');
        this._startPortMonitoring();
        logger.debug('✅ Real-time port monitoring started');
      } else {
        logger.debug('📋 Real-time port monitoring is disabled');
      }

      this.isInitialized = true;
      this.isRunning = true;

      logger.info('PortMonitor service initialized successfully');
      this.eventBus.emit(EventTypes.PORT_SCAN_STARTED, {
        timestamp: new Date().toISOString(),
        ranges: this.portRanges,
        excluded: this.excludedPorts
      });

      return true;
    } catch (error) {
      logger.error(`Failed to initialize PortMonitor: ${error.message}`);
      logger.error(`PortMonitor initialization stack trace: ${error.stack}`);
      this.isInitialized = false;
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Check if specific ports are available
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol (tcp/udp)
   * @returns {Promise<Object>}
   */
  async checkPortsAvailability(ports, protocol = 'tcp') {
    try {
      const results = await this.availabilityChecker.checkMultiplePorts(ports, protocol);
      const reservations = await this.reservationManager.getActiveReservations(ports);
      
      // Combine availability and reservation status
      const portStatus = ports.map(port => {
        const isAvailable = results[port] || false;
        const reservation = reservations.find(r => r.port === port);
        
        return {
          port,
          available: isAvailable && !reservation,
          reserved: !!reservation,
          reservedBy: reservation ? reservation.container_id : null,
          reservedUntil: reservation ? reservation.expires_at : null,
          protocol
        };
      });

      return {
        success: true,
        ports: portStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to check port availability: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reserve ports for a container
   * @param {Array<number>} ports - Ports to reserve
   * @param {string} containerId - Container ID
   * @param {Object} options - Reservation options
   * @returns {Promise<Object>}
   */
  async reservePorts(ports, containerId, options = {}) {
    try {
      const {
        protocol = 'tcp',
        duration = 3600, // 1 hour default
        metadata = {}
      } = options;

      // Check for conflicts
      const conflicts = await this.conflictDetector.detectConflicts(ports, protocol);
      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          suggestions: await this.suggestionEngine.suggestAlternativePorts(ports, protocol)
        };
      }

      // Create reservations
      const reservations = await this.reservationManager.createReservations(
        ports,
        containerId,
        protocol,
        duration,
        metadata
      );

      // Emit event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'reserved',
        ports,
        containerId,
        protocol,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        reservations,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to reserve ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release port reservations
   * @param {Array<number>} ports - Ports to release
   * @param {string} containerId - Container ID
   * @returns {Promise<Object>}
   */
  async releasePorts(ports, containerId) {
    try {
      const released = await this.reservationManager.releaseReservations(ports, containerId);

      // Emit event
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'released',
        ports,
        containerId,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        released,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to release ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Suggest alternative ports
   * @param {Object|Array<number>} requestedPortsOrOptions - Requested ports array or options object
   * @param {string} protocol - Protocol (if first param is array)
   * @param {Object} options - Suggestion options (if first param is array)
   * @returns {Promise<Object>}
   */
  async suggestAlternativePorts(requestedPortsOrOptions, protocol = 'tcp', options = {}) {
    try {
      let requestedPorts, finalProtocol, finalOptions;
      
      // Handle both old signature (array, protocol, options) and new signature (options object)
      if (Array.isArray(requestedPortsOrOptions)) {
        // Old signature: suggestAlternativePorts(ports, protocol, options)
        requestedPorts = requestedPortsOrOptions;
        finalProtocol = protocol;
        finalOptions = options;
      } else if (typeof requestedPortsOrOptions === 'object' && requestedPortsOrOptions.ports) {
        // New signature: suggestAlternativePorts({ports, protocol, serviceType, ...})
        const {
          ports,
          protocol: optProtocol = 'tcp',
          serviceType = 'custom',
          maxSuggestions = 5,
          server = 'localhost',
          ...otherOptions
        } = requestedPortsOrOptions;
        
        requestedPorts = ports;
        finalProtocol = optProtocol;
        finalOptions = {
          serviceType,
          maxSuggestions,
          server,
          ...otherOptions
        };
      } else {
        throw new Error('Invalid parameters: expected ports array or options object with ports property');
      }
      
      if (!Array.isArray(requestedPorts) || requestedPorts.length === 0) {
        throw new Error('requestedPorts must be a non-empty array');
      }

      const suggestions = await this.suggestionEngine.suggestAlternativePorts(
        requestedPorts,
        finalProtocol,
        finalOptions
      );

      return {
        success: true,
        original: requestedPorts,
        suggestions,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to suggest alternative ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a deployment configuration
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {Promise<Object>}
   */
  async validateDeployment(deploymentConfig) {
    try {
      const {
        ports = [],
        containerId,
        protocol = 'tcp'
      } = deploymentConfig;

      if (!ports.length) {
        return {
          success: true,
          valid: true,
          message: 'No ports specified'
        };
      }

      // Check for conflicts
      const conflicts = await this.conflictDetector.detectConflicts(ports, protocol);
      const availability = await this.checkPortsAvailability(ports, protocol);

      const unavailablePorts = availability.ports.filter(p => !p.available);

      if (conflicts.length > 0 || unavailablePorts.length > 0) {
        const suggestions = await this.suggestAlternativePorts(ports, protocol);
        
        return {
          success: true,
          valid: false,
          conflicts,
          unavailable: unavailablePorts,
          suggestions: suggestions.suggestions,
          message: 'Port conflicts detected'
        };
      }

      return {
        success: true,
        valid: true,
        message: 'Deployment validation passed'
      };
    } catch (error) {
      logger.error(`Failed to validate deployment: ${error.message}`);
      throw error;
    }
  }


  /**
   * Stop the port monitor
   * @returns {Promise<void>}
   */
  async stop() {
    try {
      logger.info('Stopping PortMonitor service');

      this.isRunning = false;

      // Stop monitoring
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }

      // Cleanup reservations
      await this.reservationManager.cleanup();

      logger.info('PortMonitor service stopped');
    } catch (error) {
      logger.error(`Error stopping PortMonitor: ${error.message}`);
    }
  }

  /**
   * Perform initial port scan
   * @private
   */
  async _performInitialScan() {
    try {
      logger.info('Performing initial port scan');

      // First, get system ports in use and store them
      const systemPorts = await this.availabilityChecker.getSystemPortsInUse('localhost');
      logger.info(`Found ${systemPorts.length} system ports in use`);
      
      // Store system ports in database
      if (this.database.repositories?.port) {
        for (const portInfo of systemPorts) {
          try {
            await this.database.repositories.port.upsertPort({
              host: 'localhost',
              port: portInfo.port,
              protocol: portInfo.protocol || 'tcp',
              status: 'open',
              service_name: portInfo.service,
              description: `System port - ${portInfo.service}`,
              labels: { source: 'system' }
            });
          } catch (err) {
            logger.error(`Failed to store port ${portInfo.port}: ${err.message}`);
          }
        }
      }

      // Get Docker container ports
      try {
        const containerPorts = await this.dockerIntegration.getContainerPorts();
        logger.info(`Found ${containerPorts.length} Docker container ports`);
        
        // Store container ports in database
        if (this.database.repositories?.port) {
          for (const portInfo of containerPorts) {
            try {
              await this.database.repositories.port.upsertPort({
                host: 'localhost',
                port: portInfo.hostPort,
                protocol: portInfo.protocol || 'tcp',
                status: 'open',
                service_name: portInfo.service || 'docker',
                container_id: portInfo.containerId,
                container_name: portInfo.containerName,
                description: `Docker container port - ${portInfo.containerName}`,
                labels: { 
                  source: 'docker',
                  image: portInfo.image,
                  containerPort: portInfo.containerPort
                }
              });
            } catch (err) {
              logger.error(`Failed to store container port ${portInfo.hostPort}: ${err.message}`);
            }
          }
        }
      } catch (dockerError) {
        logger.warn(`Failed to get Docker container ports: ${dockerError.message}`);
      }

      // Scan all configured port ranges
      const allPorts = [];
      for (const range of this.portRanges) {
        for (let port = range.start; port <= range.end; port++) {
          if (!this.excludedPorts.includes(port)) {
            allPorts.push(port);
          }
        }
      }

      logger.info(`📊 Preparing to scan ${allPorts.length} ports in configured ranges`);

      // Pre-populate monitored ports with pending status to provide immediate statistics
      const currentTime = new Date().toISOString();
      for (const port of allPorts) {
        this.monitoredPorts.set(port, {
          available: true, // Assume available until checked
          lastChecked: null,
          status: 'pending'
        });
      }

      logger.info(`📊 Pre-populated ${this.monitoredPorts.size} ports for monitoring`);

      // Check availability in batches to avoid overwhelming the system
      const batchSize = 100;
      for (let i = 0; i < allPorts.length; i += batchSize) {
        const batch = allPorts.slice(i, i + batchSize);
        const results = await this.availabilityChecker.checkMultiplePorts(batch);
        
        // Update results
        for (const [port, available] of Object.entries(results)) {
          this.monitoredPorts.set(parseInt(port), {
            available,
            lastChecked: new Date().toISOString(),
            status: 'checked'
          });
        }
      }

      this.lastScanTime = new Date().toISOString();
      
      this.eventBus.emit(EventTypes.PORT_SCAN_COMPLETED, {
        portsScanned: allPorts.length,
        systemPorts: systemPorts.length,
        timestamp: this.lastScanTime
      });

      logger.info(`Initial port scan completed: ${allPorts.length} ports scanned, ${systemPorts.length} system ports stored`);
    } catch (error) {
      logger.error(`Initial port scan failed: ${error.message}`);
      this.eventBus.emit(EventTypes.PORT_SCAN_FAILED, {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Start continuous port monitoring
   * @private
   */
  _startPortMonitoring() {
    if (this.scanInterval) {
      return;
    }

    logger.info(`Starting continuous port monitoring (interval: ${this.scanIntervalMs}ms)`);

    this.scanInterval = setInterval(async () => {
      try {
        await this._performPeriodicScan();
      } catch (error) {
        logger.error(`Periodic port scan failed: ${error.message}`);
      }
    }, this.scanIntervalMs);
  }

  /**
   * Perform periodic port scan
   * @private
   */
  async _performPeriodicScan() {
    if (!this.isRunning) return;

    const portsToCheck = Array.from(this.monitoredPorts.keys());
    if (portsToCheck.length === 0) return;

    // Check a subset of ports each time for performance
    const batchSize = 50;
    const startIndex = Math.floor(Math.random() * Math.max(1, portsToCheck.length - batchSize));
    const batch = portsToCheck.slice(startIndex, startIndex + batchSize);

    const results = await this.availabilityChecker.checkMultiplePorts(batch);
    
    // Check for changes
    const changes = [];
    for (const [port, available] of Object.entries(results)) {
      const portNum = parseInt(port);
      const previous = this.monitoredPorts.get(portNum);
      
      if (previous && previous.available !== available) {
        changes.push({
          port: portNum,
          previous: previous.available,
          current: available,
          timestamp: new Date().toISOString()
        });

        // Update stored state
        this.monitoredPorts.set(portNum, {
          available,
          lastChecked: new Date().toISOString()
        });
      }
    }

    // Emit events for changes
    if (changes.length > 0) {
      this.eventBus.emit(EventTypes.PORT_CHANGED, {
        type: 'availability_changed',
        changes,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Port availability changes detected: ${changes.length} ports`);
    }

    this.lastScanTime = new Date().toISOString();
  }

  /**
   * Parse port ranges from configuration
   * @param {string} rangesStr - Port ranges string
   * @returns {Array<Object>}
   * @private
   */
  _parsePortRanges(rangesStr) {
    return rangesStr.split(',').map(range => {
      const parts = range.trim().split('-');
      if (parts.length === 2) {
        return {
          start: parseInt(parts[0]),
          end: parseInt(parts[1])
        };
      } else {
        const port = parseInt(parts[0]);
        return { start: port, end: port };
      }
    });
  }

  /**
   * Parse excluded ports from configuration
   * @param {string} portsStr - Excluded ports string
   * @returns {Array<number>}
   * @private
   */
  _parseExcludedPorts(portsStr) {
    return portsStr.split(',').map(port => parseInt(port.trim())).filter(port => !isNaN(port));
  }

  /**
   * Bind event handlers
   * @private
   */
  _bindEvents() {
    // Clean up expired reservations periodically
    setInterval(async () => {
      try {
        await this.reservationManager.cleanupExpiredReservations();
      } catch (error) {
        logger.error(`Failed to cleanup expired reservations: ${error.message}`);
      }
    }, 60000); // Every minute
  }

  /**
   * Get all ports currently in use on a server
   * @param {string} server - Server IP or hostname
   * @returns {Promise<Array>}
   */
  async getPortsInUse(server = 'localhost') {
    try {
      logger.info(`🔍 Getting ports in use for server: ${server}`);
      
      // Get system ports in use
      const systemPorts = await this.availabilityChecker.getSystemPortsInUse(server);
      logger.info(`📊 Found ${systemPorts.length} system ports`);
      
      // Log first few system ports for debugging
      if (systemPorts.length > 0) {
        logger.debug('Sample system ports:');
        systemPorts.slice(0, 5).forEach(p => {
          logger.debug(`  - Port ${p.port}/${p.protocol}: ${p.service}`);
        });
        
        // Check for port 80
        const port80 = systemPorts.find(p => p.port === 80);
        if (port80) {
          logger.info(`✅ Port 80 found in system ports: ${JSON.stringify(port80)}`);
        } else {
          logger.warn(`⚠️ Port 80 NOT found in system ports`);
        }
      }
      
      // Get Docker container ports if server is localhost
      let containerPorts = [];
      if (server === 'localhost' || server === '127.0.0.1') {
        try {
          containerPorts = await this.dockerIntegration.getContainerPorts();
          logger.info(`📊 Found ${containerPorts.length} container ports`);
        } catch (dockerError) {
          logger.warn(`Failed to get Docker container ports: ${dockerError.message}`);
          containerPorts = [];
        }
      }
      
      // Merge and format results
      const portsInUse = new Map();
      
      // Add system ports first (higher priority for service identification)
      for (const port of systemPorts) {
        try {
          const overrideLabel = await this.getPortServiceLabel(port.port, port.protocol, server);
          portsInUse.set(`${port.port}-${port.protocol}`, {
            port: port.port,
            protocol: port.protocol,
            service: overrideLabel || port.service || this.availabilityChecker._identifyService(port.port),
            isOverridden: !!overrideLabel,
            pid: port.pid,
            address: port.address,
            lastSeen: new Date().toISOString(),
            source: 'system'
          });
        } catch (err) {
          logger.debug(`Error processing system port ${port.port}: ${err.message}`);
        }
      }
      
      // Add or merge container ports
      for (const containerPort of containerPorts) {
        try {
          const key = `${containerPort.hostPort}-${containerPort.protocol || 'tcp'}`;
          const overrideLabel = await this.getPortServiceLabel(containerPort.hostPort, containerPort.protocol || 'tcp', server);
          const existing = portsInUse.get(key);
          
          if (existing) {
            // Merge container info with existing system port
            existing.containerId = containerPort.containerId;
            existing.containerName = containerPort.containerName;
            existing.image = containerPort.image;
            existing.imageId = containerPort.imageId;
            existing.status = containerPort.status;
            existing.labels = containerPort.labels;
            existing.created = containerPort.created;
            existing.started = containerPort.started;
            existing.source = 'system+docker';
            if (overrideLabel) {
              existing.service = overrideLabel;
              existing.isOverridden = true;
            } else if (!existing.service || existing.service === 'System') {
              // Use container service if system service is generic
              existing.service = containerPort.service || 'docker';
            }
          } else {
            // Add new container port
            portsInUse.set(key, {
              port: containerPort.hostPort,
              protocol: containerPort.protocol || 'tcp',
              containerId: containerPort.containerId,
              containerName: containerPort.containerName,
              service: overrideLabel || containerPort.service || 'docker',
              isOverridden: !!overrideLabel,
              image: containerPort.image,
              imageId: containerPort.imageId,
              status: containerPort.status,
              labels: containerPort.labels,
              created: containerPort.created,
              started: containerPort.started,
              lastSeen: new Date().toISOString(),
              source: 'docker'
            });
          }
        } catch (err) {
          logger.debug(`Error processing container port ${containerPort.hostPort}: ${err.message}`);
        }
      }
      
      // Get port documentation from database
      try {
        const portDocs = await this.database.repositories?.portDocumentation?.getAll() || [];
        for (const doc of portDocs) {
          const key = `${doc.port}-${doc.protocol}`;
          const port = portsInUse.get(key);
          if (port) {
            port.documentation = doc.documentation;
          }
        }
      } catch (docsError) {
        logger.debug(`Failed to load port documentation: ${docsError.message}`);
      }
      
      const result = Array.from(portsInUse.values());
      logger.info(`📤 Returning ${result.length} total ports in use (${systemPorts.length} system + ${containerPorts.length} container)`);
      
      return result;
    } catch (error) {
      logger.error(`Failed to get ports in use: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check port availability with protocol awareness
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol (tcp, udp, both)
   * @param {string} server - Server to check
   * @returns {Promise<Object>}
   */
  async checkPortsAvailability(ports, protocol = 'both', server = 'localhost') {
    try {
      const results = {
        ports: []
      };
      
      for (const port of ports) {
        if (protocol === 'both') {
          // Check both TCP and UDP
          const tcpAvailable = await this.availabilityChecker.checkPort(port, 'tcp', server);
          const udpAvailable = await this.availabilityChecker.checkPort(port, 'udp', server);
          
          // Port is only available if BOTH protocols are available
          const available = tcpAvailable && udpAvailable;
          
          results.ports.push({
            port,
            available,
            reserved: await this.reservationManager.isPortReserved(port),
            protocol: 'both',
            details: {
              tcp: tcpAvailable,
              udp: udpAvailable
            }
          });
        } else {
          const available = await this.availabilityChecker.checkPort(port, protocol, server);
          const reserved = await this.reservationManager.isPortReserved(port, protocol);
          
          results.ports.push({
            port,
            available,
            reserved,
            protocol,
            reservedBy: reserved ? await this.reservationManager.getReservationInfo(port, protocol) : null
          });
        }
      }
      
      return results;
    } catch (error) {
      logger.error(`Failed to check port availability: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reserve ports with enhanced options
   * @param {Object} options - Reservation options
   * @returns {Promise<Object>}
   */
  async reservePorts(options) {
    const { ports, containerId, protocol = 'tcp', duration = 3600, metadata = {}, server = 'localhost' } = options;
    
    try {
      const results = {
        reserved: [],
        conflicts: [],
        suggestions: []
      };
      
      // Check each port
      for (const port of ports) {
        const available = await this.availabilityChecker.checkPort(port, protocol, server);
        
        if (!available) {
          const conflict = {
            port,
            protocol,
            reason: 'Port already in use'
          };
          results.conflicts.push(conflict);
          
          // Get suggestions
          const alternatives = await this.suggestionEngine.suggestAlternatives(port, protocol);
          results.suggestions.push({
            originalPort: port,
            alternatives: alternatives.slice(0, 3)
          });
        } else {
          // Reserve the port
          const reservation = await this.reservationManager.reservePort({
            port,
            containerId,
            protocol,
            duration,
            metadata,
            server
          });
          results.reserved.push(reservation);
        }
      }
      
      return results;
    } catch (error) {
      logger.error(`Failed to reserve ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release ports for a container
   * @param {string} containerId - Container ID
   * @param {Array<number>} ports - Specific ports to release (optional)
   * @returns {Promise<Object>}
   */
  async releasePorts(containerId, ports = null) {
    try {
      const released = await this.reservationManager.releasePortsForContainer(containerId, ports);
      return {
        released,
        count: released.length
      };
    } catch (error) {
      logger.error(`Failed to release ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update port documentation
   * @param {number} port - Port number
   * @param {string} documentation - Documentation text
   * @param {string} server - Server IP
   * @returns {Promise<void>}
   */
  async updatePortDocumentation(port, documentation, server = 'localhost') {
    try {
      // Store in database
      if (!this.database.repositories?.portDocumentation) {
        // Create simple storage if repository doesn't exist
        const portDocs = this.portDocumentation || new Map();
        portDocs.set(`${port}-${server}`, {
          port,
          server,
          documentation,
          updatedAt: new Date().toISOString()
        });
        this.portDocumentation = portDocs;
      } else {
        await this.database.repositories.portDocumentation.upsert({
          port,
          server,
          documentation,
          protocol: 'tcp', // Default protocol
          updatedAt: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error(`Failed to update port documentation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update port service label override
   * @param {number} port - Port number
   * @param {string} serviceLabel - Custom service label
   * @param {string} server - Server IP
   * @param {string} protocol - Protocol
   * @returns {Promise<void>}
   */
  async updatePortServiceLabel(port, serviceLabel, server = 'localhost', protocol = 'tcp') {
    try {
      // Store in database or memory
      if (!this.database.repositories?.portLabels) {
        // Create simple storage if repository doesn't exist
        const portLabels = this.portLabels || new Map();
        portLabels.set(`${port}-${protocol}-${server}`, {
          port,
          server,
          protocol,
          serviceLabel,
          updatedAt: new Date().toISOString()
        });
        this.portLabels = portLabels;
      } else {
        await this.database.repositories.portLabels.upsert({
          port,
          server,
          protocol,
          serviceLabel,
          updatedAt: new Date().toISOString()
        });
      }
      
      logger.info(`Updated service label for port ${port}/${protocol} to "${serviceLabel}"`);
    } catch (error) {
      logger.error(`Failed to update port service label: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get port service label override
   * @param {number} port - Port number
   * @param {string} protocol - Protocol
   * @param {string} server - Server IP
   * @returns {Promise<string|null>}
   */
  async getPortServiceLabel(port, protocol = 'tcp', server = 'localhost') {
    try {
      if (!this.database.repositories?.portLabels) {
        const portLabels = this.portLabels || new Map();
        const label = portLabels.get(`${port}-${protocol}-${server}`);
        return label?.serviceLabel || null;
      } else {
        const label = await this.database.repositories.portLabels.findOne({
          port,
          server,
          protocol
        });
        return label?.serviceLabel || null;
      }
    } catch (error) {
      logger.error(`Failed to get port service label: ${error.message}`);
      return null;
    }
  }

  /**
   * Get port statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    try {
      const reservations = await this.reservationManager.getActiveReservations();
      const monitoredPorts = this.monitoredPorts.size;
      
      let availablePortsInRange = 0;
      let systemPortsInUse = 0;
      
      if (monitoredPorts > 0) {
        // If we have monitored ports data, use it
        availablePortsInRange = await this._countAvailablePorts();
      } else {
        // If no monitored ports yet, try to get basic system port info
        try {
          const systemPorts = await this.availabilityChecker.getSystemPortsInUse('localhost');
          systemPortsInUse = systemPorts.length;
          
          // Calculate estimated available ports in range based on system ports
          const totalPortsInRange = this.portRanges.reduce((total, range) => {
            return total + (range.end - range.start + 1) - this.excludedPorts.filter(p => p >= range.start && p <= range.end).length;
          }, 0);
          
          // Rough estimate: assume most ports in range are available
          const systemPortsInRange = systemPorts.filter(p => {
            return this.portRanges.some(range => p.port >= range.start && p.port <= range.end) && 
                   !this.excludedPorts.includes(p.port);
          }).length;
          
          availablePortsInRange = Math.max(0, totalPortsInRange - systemPortsInRange);
        } catch (error) {
          logger.debug(`Could not get system ports for statistics: ${error.message}`);
        }
      }
      
      // Calculate port status breakdown
      const portStatusBreakdown = {
        open: monitoredPorts,
        closed: availablePortsInRange,
        total: monitoredPorts + availablePortsInRange
      };

      const stats = {
        // Legacy flat structure for backward compatibility
        totalMonitoredPorts: monitoredPorts,
        activeReservations: reservations.length,
        availablePortsInRange: availablePortsInRange,
        conflictsDetected: this.conflictDetector.getRecentConflictsCount(),
        lastScanTime: this.lastScanTime || null,
        monitoringEnabled: this.enableRealTimeMonitoring,
        portRanges: this.portRanges,
        excludedPorts: this.excludedPorts,
        isInitialized: this.isInitialized,
        isRunning: this.isRunning,
        systemPortsInUse: systemPortsInUse,
        
        // New nested structure for frontend compatibility
        ports: {
          byStatus: {
            open: monitoredPorts,
            closed: availablePortsInRange,
            filtered: 0,
            unknown: 0
          },
          byProtocol: {
            tcp: Math.floor(monitoredPorts * 0.8), // Estimate TCP ports
            udp: Math.floor(monitoredPorts * 0.2)  // Estimate UDP ports
          },
          topServices: [],
          topHosts: [],
          recentActivity: systemPortsInUse
        },
        alerts: {
          total: this.conflictDetector.getRecentConflictsCount(),
          unacknowledged: this.conflictDetector.getRecentConflictsCount(),
          bySeverity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
          },
          byType: {},
          recent: this.conflictDetector.getRecentConflictsCount()
        },
        scans: {
          total: 0,
          byStatus: {
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0
          },
          byType: {
            manual: 0,
            scheduled: 0,
            container: 0
          },
          recentScans: 0,
          averageDuration: 0
        }
      };
      
      logger.debug(`📊 Port statistics: monitored=${stats.totalMonitoredPorts}, available=${stats.availablePortsInRange}, reservations=${stats.activeReservations}, system=${stats.systemPortsInUse}, initialized=${stats.isInitialized}, running=${stats.isRunning}`);
      
      // Add diagnostic info if all stats are zero
      if (stats.totalMonitoredPorts === 0 && stats.activeReservations === 0 && stats.availablePortsInRange === 0) {
        logger.warn(`📊 All port statistics are zero - this may indicate: 1) Initial scan not completed yet, 2) No port monitoring configured, or 3) Service initialization issue`);
        logger.info(`📊 Port ranges configured: ${JSON.stringify(stats.portRanges)}, Excluded: ${JSON.stringify(stats.excludedPorts)}`);
      }
      
      return stats;
    } catch (error) {
      logger.error(`Failed to get statistics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get reservations with filters
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>}
   */
  async getReservations(filters = {}) {
    try {
      return await this.reservationManager.getReservations(filters);
    } catch (error) {
      logger.error(`Failed to get reservations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scan port range
   * @param {number} startPort - Start port
   * @param {number} endPort - End port
   * @param {string} protocol - Protocol
   * @param {string} server - Server
   * @returns {Promise<Object>}
   */
  async scanPortRange(startPort, endPort, protocol = 'tcp', server = 'localhost') {
    try {
      logger.info(`🔍 Scanning port range ${startPort}-${endPort} (protocol: ${protocol}, server: ${server})`);
      
      const results = {};
      const batchSize = 50;
      let totalPorts = endPort - startPort + 1;
      let processedPorts = 0;
      
      for (let port = startPort; port <= endPort; port += batchSize) {
        const batch = [];
        for (let p = port; p < Math.min(port + batchSize, endPort + 1); p++) {
          batch.push(p);
        }
        
        logger.debug(`📊 Scanning batch: ports ${batch[0]}-${batch[batch.length-1]} (${batch.length} ports)`);
        
        if (protocol === 'both') {
          // For troubleshooting: temporarily use TCP only for 'both' protocol to see if basic TCP checking works
          logger.debug(`🔍 Checking batch TCP on server: ${server} (temporarily using TCP only for 'both' protocol)`);
          const tcpResults = await this.availabilityChecker.checkMultiplePorts(batch, 'tcp', server);
          
          for (const port of batch) {
            const tcpAvailable = tcpResults[port];
            results[port] = tcpAvailable;
            logger.debug(`🔍 Port ${port}: TCP=${tcpAvailable}, final=${results[port]}`);
          }
        } else {
          try {
            const batchResults = await this.availabilityChecker.checkMultiplePorts(batch, protocol, server);
            Object.assign(results, batchResults);
            
            // Log some sample results for debugging
            const samplePorts = batch.slice(0, 3);
            for (const port of samplePorts) {
              logger.debug(`🔍 Port ${port} ${protocol}: ${batchResults[port] ? 'available' : 'in use'}`);
            }
          } catch (batchError) {
            logger.error(`Failed to check batch ${batch[0]}-${batch[batch.length-1]}: ${batchError.message}`);
            // Mark all ports in failed batch as unavailable
            for (const port of batch) {
              results[port] = false;
            }
          }
        }
        
        processedPorts += batch.length;
        const progress = Math.round((processedPorts / totalPorts) * 100);
        logger.debug(`📊 Progress: ${processedPorts}/${totalPorts} ports scanned (${progress}%)`);
      }
      
      // Count results for summary
      const availableCount = Object.values(results).filter(available => available).length;
      const unavailableCount = totalPorts - availableCount;
      
      logger.info(`📊 Port range scan complete: ${availableCount}/${totalPorts} ports available, ${unavailableCount} in use`);
      
      this.lastScanTime = new Date().toISOString();
      return results;
    } catch (error) {
      logger.error(`Failed to scan port range: ${error.message}`);
      throw error;
    }
  }

  /**
   * Count available ports in configured ranges
   * @private
   * @returns {Promise<number>}
   */
  async _countAvailablePorts() {
    let count = 0;
    for (const range of this.portRanges) {
      for (let port = range.start; port <= range.end; port++) {
        if (!this.excludedPorts.includes(port)) {
          const status = this.monitoredPorts.get(port);
          if (status && status.available) {
            count++;
          }
        }
      }
    }
    return count;
  }
}

module.exports = PortMonitor;