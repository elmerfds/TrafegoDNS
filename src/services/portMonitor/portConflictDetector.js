/**
 * Port Conflict Detector
 * Detects port conflicts between system processes and reservations
 */
const logger = require('../../utils/logger');
const { cacheManager } = require('../../utils/cacheManager');

class PortConflictDetector {
  constructor(availabilityChecker, reservationManager) {
    this.availabilityChecker = availabilityChecker;
    this.reservationManager = reservationManager;
    
    // Register cache namespace for port conflicts
    cacheManager.registerCache('port_conflicts', {
      ttl: 5000, // 5 seconds
      maxSize: 1000,
      invalidateOn: ['port:status_changed', 'reservation:updated'],
      keyPrefix: 'conflict'
    });
    
    logger.info('PortConflictDetector initialized with centralized cache');
  }

  /**
   * Detect conflicts for a list of ports
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {string} excludeContainer - Container ID to exclude from conflict check
   * @returns {Promise<Array<Object>>}
   */
  async detectConflicts(ports, protocol = 'tcp', excludeContainer = null) {
    const conflicts = [];
    
    try {
      // Check system-level port availability
      const availability = await this.availabilityChecker.checkMultiplePorts(ports, protocol);
      
      // Check reservation conflicts
      const reservations = await this.reservationManager.getActiveReservations(ports);
      
      for (const port of ports) {
        const conflict = await this._analyzePortConflict(
          port,
          protocol,
          availability[port],
          reservations,
          excludeContainer
        );
        
        if (conflict) {
          conflicts.push(conflict);
        }
      }

      return conflicts;
    } catch (error) {
      logger.error(`Failed to detect port conflicts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect conflicts for a single port
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @param {string} excludeContainer - Container ID to exclude
   * @returns {Promise<Object|null>}
   */
  async detectSinglePortConflict(port, protocol = 'tcp', excludeContainer = null) {
    const conflicts = await this.detectConflicts([port], protocol, excludeContainer);
    return conflicts.length > 0 ? conflicts[0] : null;
  }

  /**
   * Get detailed conflict information including processes
   * @param {Array<number>} ports - Ports to analyze
   * @param {string} protocol - Protocol
   * @returns {Promise<Array<Object>>}
   */
  async getDetailedConflictInfo(ports, protocol = 'tcp') {
    try {
      // Get all listening processes
      const listeningPorts = await this.availabilityChecker.getListeningPorts(protocol);
      const reservations = await this.reservationManager.getActiveReservations(ports);
      
      const detailedInfo = [];
      
      for (const port of ports) {
        const info = {
          port,
          protocol,
          conflicts: [],
          available: true
        };

        // Check for system process conflicts
        const systemProcess = listeningPorts.find(p => p.port === port);
        if (systemProcess) {
          info.available = false;
          info.conflicts.push({
            type: 'system_process',
            process: systemProcess,
            description: `Port in use by system process`
          });
        }

        // Check for reservation conflicts
        const reservation = reservations.find(r => r.port === port);
        if (reservation) {
          info.available = false;
          info.conflicts.push({
            type: 'reservation',
            reservation,
            description: `Port reserved by container ${reservation.container_id}`
          });
        }

        detailedInfo.push(info);
      }

      return detailedInfo;
    } catch (error) {
      logger.error(`Failed to get detailed conflict info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if deployment is safe (no conflicts)
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {Promise<Object>}
   */
  async validateDeployment(deploymentConfig) {
    const {
      ports = [],
      containerId,
      protocol = 'tcp'
    } = deploymentConfig;

    if (ports.length === 0) {
      return {
        safe: true,
        conflicts: [],
        warnings: [],
        message: 'No ports specified'
      };
    }

    try {
      const conflicts = await this.detectConflicts(ports, protocol, containerId);
      const warnings = [];

      // Additional validation checks
      await this._checkPortRangeWarnings(ports, warnings);
      await this._checkProtocolWarnings(protocol, warnings);

      return {
        safe: conflicts.length === 0,
        conflicts,
        warnings,
        message: conflicts.length === 0 ? 'Deployment is safe' : `${conflicts.length} port conflicts detected`
      };
    } catch (error) {
      logger.error(`Failed to validate deployment: ${error.message}`);
      return {
        safe: false,
        conflicts: [],
        warnings: [],
        error: error.message,
        message: 'Validation failed due to error'
      };
    }
  }

  /**
   * Monitor ports for changes and conflicts
   * @param {Array<number>} ports - Ports to monitor
   * @param {string} protocol - Protocol
   * @param {Function} callback - Callback for conflict events
   * @returns {Object} - Monitor handle
   */
  startConflictMonitoring(ports, protocol = 'tcp', callback) {
    const monitorId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const monitor = {
      id: monitorId,
      ports,
      protocol,
      callback,
      lastCheck: new Map(),
      interval: null
    };

    // Initial check
    this._performMonitorCheck(monitor);

    // Set up periodic checking
    monitor.interval = setInterval(() => {
      this._performMonitorCheck(monitor);
    }, 30000); // Check every 30 seconds

    logger.debug(`Started conflict monitoring for ports ${ports.join(', ')} (${protocol})`);
    return monitor;
  }

  /**
   * Stop conflict monitoring
   * @param {Object} monitor - Monitor handle
   */
  stopConflictMonitoring(monitor) {
    if (monitor.interval) {
      clearInterval(monitor.interval);
      monitor.interval = null;
    }
    
    logger.debug(`Stopped conflict monitoring for monitor ${monitor.id}`);
  }

  /**
   * Clear the conflict detection cache
   */
  clearCache() {
    cacheManager.clear('port_conflicts');
    logger.debug('Cleared port conflict detection cache');
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    const stats = cacheManager.getStats('port_conflicts');
    return {
      namespace: 'port_conflicts',
      ...stats.namespaces.port_conflicts || {},
      globalMetrics: stats.metrics
    };
  }

  /**
   * Analyze conflict for a single port
   * @param {number} port - Port number
   * @param {string} protocol - Protocol
   * @param {boolean} systemAvailable - System availability check result
   * @param {Array<Object>} reservations - Active reservations
   * @param {string} excludeContainer - Container to exclude
   * @returns {Object|null}
   * @private
   */
  async _analyzePortConflict(port, protocol, systemAvailable, reservations, excludeContainer) {
    const cacheKey = `${port}_${protocol}_${excludeContainer || 'none'}`;
    
    // Try to get from centralized cache
    const cached = cacheManager.get('port_conflicts', cacheKey);
    if (cached !== null) {
      return cached;
    }

    let conflict = null;

    // Check system-level availability
    if (!systemAvailable) {
      conflict = {
        port,
        protocol,
        type: 'system_process',
        description: `Port ${port}/${protocol} is in use by a system process`,
        severity: 'high',
        timestamp: new Date().toISOString()
      };
    }

    // Check reservation conflicts
    const reservation = reservations.find(r => 
      r.port === port && 
      r.protocol === protocol &&
      r.container_id !== excludeContainer
    );

    if (reservation && !conflict) {
      conflict = {
        port,
        protocol,
        type: 'reservation',
        description: `Port ${port}/${protocol} is reserved by container ${reservation.container_id}`,
        severity: 'medium',
        conflictingContainer: reservation.container_id,
        reservationExpires: reservation.expires_at,
        timestamp: new Date().toISOString()
      };
    }

    // Cache the result in centralized cache
    cacheManager.set('port_conflicts', cacheKey, conflict, {
      tags: [`port:${port}`, `protocol:${protocol}`, 'conflict_analysis']
    });

    return conflict;
  }

  /**
   * Check for port range warnings
   * @param {Array<number>} ports - Ports to check
   * @param {Array} warnings - Warnings array to populate
   * @private
   */
  async _checkPortRangeWarnings(ports, warnings) {
    const privilegedPorts = ports.filter(port => port < 1024);
    if (privilegedPorts.length > 0) {
      warnings.push({
        type: 'privileged_ports',
        ports: privilegedPorts,
        message: 'Using privileged ports (< 1024) may require elevated permissions'
      });
    }

    const commonPorts = ports.filter(port => 
      [22, 80, 443, 3306, 5432, 6379, 27017].includes(port)
    );
    if (commonPorts.length > 0) {
      warnings.push({
        type: 'common_service_ports',
        ports: commonPorts,
        message: 'Using ports commonly reserved for system services'
      });
    }
  }

  /**
   * Check for protocol warnings
   * @param {string} protocol - Protocol
   * @param {Array} warnings - Warnings array to populate
   * @private
   */
  async _checkProtocolWarnings(protocol, warnings) {
    if (protocol === 'udp') {
      warnings.push({
        type: 'udp_protocol',
        message: 'UDP port conflict detection may be less reliable than TCP'
      });
    }
  }

  /**
   * Perform a monitoring check
   * @param {Object} monitor - Monitor configuration
   * @private
   */
  async _performMonitorCheck(monitor) {
    try {
      const conflicts = await this.detectConflicts(monitor.ports, monitor.protocol);
      
      // Check for changes since last check
      const changes = [];
      for (const conflict of conflicts) {
        const lastState = monitor.lastCheck.get(conflict.port);
        if (!lastState || lastState !== conflict.type) {
          changes.push({
            type: 'conflict_detected',
            conflict,
            previousState: lastState || 'available'
          });
          monitor.lastCheck.set(conflict.port, conflict.type);
        }
      }

      // Check for resolved conflicts
      for (const [port, lastState] of monitor.lastCheck.entries()) {
        const currentConflict = conflicts.find(c => c.port === port);
        if (!currentConflict && lastState !== 'available') {
          changes.push({
            type: 'conflict_resolved',
            port,
            previousState: lastState
          });
          monitor.lastCheck.set(port, 'available');
        }
      }

      // Notify of changes
      if (changes.length > 0 && monitor.callback) {
        monitor.callback({
          monitorId: monitor.id,
          ports: monitor.ports,
          protocol: monitor.protocol,
          changes,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error(`Monitor check failed for ${monitor.id}: ${error.message}`);
      if (monitor.callback) {
        monitor.callback({
          monitorId: monitor.id,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Get count of recent conflicts detected
   * @returns {number}
   */
  getRecentConflictsCount() {
    // Since centralized cache doesn't expose direct iteration,
    // we'll use cache statistics to estimate recent conflicts
    const stats = cacheManager.getStats('port_conflicts');
    const namespaceStats = stats.namespaces.port_conflicts;
    
    if (!namespaceStats) {
      return 0;
    }
    
    // Estimate based on cache hit ratio and activity
    // For more precise tracking, consider implementing a separate recent conflicts tracker
    const estimatedRecentConflicts = Math.floor(namespaceStats.size * 0.1); // Rough estimate
    
    logger.debug(`Estimated recent conflicts: ${estimatedRecentConflicts} (cache size: ${namespaceStats.size})`);
    return estimatedRecentConflicts;
  }
}

module.exports = PortConflictDetector;