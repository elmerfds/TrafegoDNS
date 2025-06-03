/**
 * Port Monitor Service
 * Orchestrates port monitoring, conflict detection, and reservation management
 */
const logger = require('../../utils/logger');
const { EventBus } = require('../../events/EventBus');
const EventTypes = require('../../events/EventTypes');
const PortAvailabilityChecker = require('./portAvailabilityChecker');
const PortReservationManager = require('./portReservationManager');
const PortConflictDetector = require('./portConflictDetector');
const PortSuggestionEngine = require('./portSuggestionEngine');
const DockerPortIntegration = require('./dockerPortIntegration');

class PortMonitor {
  constructor(config, database, eventBus) {
    this.config = config;
    this.database = database;
    this.eventBus = eventBus || EventBus; // Use provided eventBus or fallback to EventBus class
    this.isInitialized = false;
    this.isRunning = false;
    
    // Initialize sub-modules
    this.availabilityChecker = new PortAvailabilityChecker(config);
    this.reservationManager = new PortReservationManager(database);
    this.conflictDetector = new PortConflictDetector(this.availabilityChecker, this.reservationManager);
    this.suggestionEngine = new PortSuggestionEngine(this.availabilityChecker, this.reservationManager, config);
    this.dockerIntegration = new DockerPortIntegration(this.conflictDetector, this.suggestionEngine, this.eventBus);
    
    // Port monitoring state
    this.monitoredPorts = new Map();
    this.portChanges = new Map();
    this.scanInterval = null;
    
    // Configuration
    this.scanIntervalMs = config.PORT_SCAN_INTERVAL || 30000; // 30 seconds
    this.enableRealTimeMonitoring = config.ENABLE_REAL_TIME_PORT_MONITORING !== 'false';
    this.portRanges = this._parsePortRanges(config.PORT_RANGES || '3000-9999');
    this.excludedPorts = this._parseExcludedPorts(config.EXCLUDED_PORTS || '22,80,443');
    
    this._bindEvents();
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
      await this.reservationManager.initialize();
      await this.dockerIntegration.initialize();

      // Perform initial port scan
      await this._performInitialScan();

      // Start real-time monitoring if enabled
      if (this.enableRealTimeMonitoring) {
        this._startPortMonitoring();
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
   * @param {Array<number>} requestedPorts - Requested ports
   * @param {string} protocol - Protocol
   * @param {Object} options - Suggestion options
   * @returns {Promise<Object>}
   */
  async suggestAlternativePorts(requestedPorts, protocol = 'tcp', options = {}) {
    try {
      const suggestions = await this.suggestionEngine.suggestAlternativePorts(
        requestedPorts,
        protocol,
        options
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
   * Get port monitoring statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    try {
      const stats = {
        totalMonitoredPorts: this.monitoredPorts.size,
        activeReservations: await this.reservationManager.getActiveReservationCount(),
        availablePortsInRange: 0,
        conflictsDetected: this.portChanges.size,
        lastScanTime: this.lastScanTime,
        monitoringEnabled: this.enableRealTimeMonitoring,
        portRanges: this.portRanges,
        excludedPorts: this.excludedPorts
      };

      // Calculate available ports in range
      for (const range of this.portRanges) {
        const portCount = range.end - range.start + 1;
        stats.availablePortsInRange += portCount;
      }
      stats.availablePortsInRange -= this.excludedPorts.length;

      return stats;
    } catch (error) {
      logger.error(`Failed to get port statistics: ${error.message}`);
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

      // Scan all configured port ranges
      const allPorts = [];
      for (const range of this.portRanges) {
        for (let port = range.start; port <= range.end; port++) {
          if (!this.excludedPorts.includes(port)) {
            allPorts.push(port);
          }
        }
      }

      // Check availability in batches to avoid overwhelming the system
      const batchSize = 100;
      for (let i = 0; i < allPorts.length; i += batchSize) {
        const batch = allPorts.slice(i, i + batchSize);
        const results = await this.availabilityChecker.checkMultiplePorts(batch);
        
        // Store results
        for (const [port, available] of Object.entries(results)) {
          this.monitoredPorts.set(parseInt(port), {
            available,
            lastChecked: new Date().toISOString()
          });
        }
      }

      this.lastScanTime = new Date().toISOString();
      
      this.eventBus.emit(EventTypes.PORT_SCAN_COMPLETED, {
        portsScanned: allPorts.length,
        timestamp: this.lastScanTime
      });

      logger.info(`Initial port scan completed: ${allPorts.length} ports scanned`);
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
}

module.exports = PortMonitor;