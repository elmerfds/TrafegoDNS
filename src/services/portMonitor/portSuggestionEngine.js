/**
 * Port Suggestion Engine
 * Suggests alternative ports when conflicts are detected
 */
const logger = require('../../utils/logger');

class PortSuggestionEngine {
  constructor(availabilityChecker, reservationManager, config) {
    this.availabilityChecker = availabilityChecker;
    this.reservationManager = reservationManager;
    this.config = config;
    
    // Suggestion configuration
    this.suggestionRules = {
      nearbyRange: 100,           // Look for ports within +/- 100 of original
      maxSuggestions: 10,         // Maximum number of suggestions per port
      preferSequential: true,     // Prefer sequential ports for multiple port requests
      avoidWellKnownPorts: true,  // Avoid well-known service ports
      respectPortRanges: true,    // Stay within configured port ranges
      allowHigherPorts: true      // Allow suggesting ports higher than original
    };

    // Well-known ports to avoid
    this.wellKnownPorts = new Set([
      20, 21, 22, 23, 25, 53, 67, 68, 69, 70, 79, 80, 88, 110, 123, 135, 137, 138, 139,
      143, 161, 162, 179, 194, 389, 443, 445, 465, 514, 515, 530, 543, 544, 547, 993,
      995, 1433, 1521, 1723, 3306, 3389, 5432, 5900, 6379, 27017
    ]);

    // Port ranges from config
    this.portRanges = this._parsePortRanges(config.PORT_RANGES || '3000-9999');
    this.excludedPorts = this._parseExcludedPorts(config.EXCLUDED_PORTS || '22,80,443');
  }

  /**
   * Suggest alternative ports for a list of requested ports
   * @param {Array<number>} requestedPorts - Originally requested ports
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {Object} options - Suggestion options
   * @returns {Promise<Array<Object>>}
   */
  async suggestAlternativePorts(requestedPorts, protocol = 'tcp', options = {}) {
    const suggestions = [];
    
    try {
      const {
        preferSequential = this.suggestionRules.preferSequential,
        maxSuggestions = this.suggestionRules.maxSuggestions,
        nearbyRange = this.suggestionRules.nearbyRange,
        avoidWellKnown = this.suggestionRules.avoidWellKnownPorts
      } = options;

      if (preferSequential && requestedPorts.length > 1) {
        // Try to find sequential port blocks
        const sequentialSuggestions = await this._findSequentialPorts(
          requestedPorts,
          protocol,
          maxSuggestions,
          nearbyRange,
          avoidWellKnown
        );
        suggestions.push(...sequentialSuggestions);
      } else {
        // Find individual port alternatives
        for (const port of requestedPorts) {
          const portSuggestions = await this._findAlternativePortsForSingle(
            port,
            protocol,
            maxSuggestions,
            nearbyRange,
            avoidWellKnown
          );
          
          suggestions.push({
            originalPort: port,
            alternatives: portSuggestions
          });
        }
      }

      return suggestions;
    } catch (error) {
      logger.error(`Failed to suggest alternative ports: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find the next available port starting from a given port
   * @param {number} startPort - Starting port
   * @param {string} protocol - Protocol
   * @param {Object} options - Search options
   * @returns {Promise<number|null>}
   */
  async findNextAvailablePort(startPort, protocol = 'tcp', options = {}) {
    const {
      maxRange = 1000,
      avoidWellKnown = true,
      respectRanges = true
    } = options;

    try {
      for (let port = startPort; port <= startPort + maxRange; port++) {
        if (await this._isPortSuitable(port, protocol, avoidWellKnown, respectRanges)) {
          return port;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to find next available port: ${error.message}`);
      return null;
    }
  }

  /**
   * Find available ports in a specific range
   * @param {number} startPort - Start of range
   * @param {number} endPort - End of range
   * @param {number} count - Number of ports needed
   * @param {string} protocol - Protocol
   * @returns {Promise<Array<number>>}
   */
  async findAvailablePortsInRange(startPort, endPort, count, protocol = 'tcp') {
    try {
      const availablePorts = [];
      
      for (let port = startPort; port <= endPort && availablePorts.length < count; port++) {
        if (await this._isPortSuitable(port, protocol, true, false)) {
          availablePorts.push(port);
        }
      }

      return availablePorts;
    } catch (error) {
      logger.error(`Failed to find available ports in range: ${error.message}`);
      return [];
    }
  }

  /**
   * Suggest ports based on service type
   * @param {string} serviceType - Type of service (web, database, cache, etc.)
   * @param {number} count - Number of ports needed
   * @param {string} protocol - Protocol
   * @returns {Promise<Array<number>>}
   */
  async suggestPortsForService(serviceType, count = 1, protocol = 'tcp') {
    const servicePortRanges = {
      web: { start: 8000, end: 8999 },
      api: { start: 3000, end: 3999 },
      database: { start: 5000, end: 5999 },
      cache: { start: 6000, end: 6999 },
      monitoring: { start: 9000, end: 9999 },
      development: { start: 4000, end: 4999 },
      custom: { start: 7000, end: 7999 }
    };

    const range = servicePortRanges[serviceType] || servicePortRanges.custom;
    
    return await this.findAvailablePortsInRange(
      range.start,
      range.end,
      count,
      protocol
    );
  }

  /**
   * Get comprehensive port recommendations
   * @param {Object} deploymentInfo - Deployment information
   * @returns {Promise<Object>}
   */
  async getPortRecommendations(deploymentInfo) {
    const {
      requestedPorts = [],
      serviceType = 'custom',
      protocol = 'tcp',
      preferredRange = null,
      containerName = null
    } = deploymentInfo;

    try {
      const recommendations = {
        requested: requestedPorts,
        alternatives: [],
        serviceTypeSuggestions: [],
        rangeSuggestions: [],
        bestRecommendation: null
      };

      // Check requested ports availability
      if (requestedPorts.length > 0) {
        const conflicts = await this._checkPortConflicts(requestedPorts, protocol);
        if (conflicts.length > 0) {
          recommendations.alternatives = await this.suggestAlternativePorts(
            requestedPorts,
            protocol
          );
        }
      }

      // Service-based suggestions
      if (serviceType) {
        recommendations.serviceTypeSuggestions = await this.suggestPortsForService(
          serviceType,
          requestedPorts.length || 1,
          protocol
        );
      }

      // Range-based suggestions
      if (preferredRange) {
        const { start, end } = preferredRange;
        recommendations.rangeSuggestions = await this.findAvailablePortsInRange(
          start,
          end,
          requestedPorts.length || 1,
          protocol
        );
      }

      // Determine best recommendation
      recommendations.bestRecommendation = this._selectBestRecommendation(
        recommendations,
        deploymentInfo
      );

      return recommendations;
    } catch (error) {
      logger.error(`Failed to get port recommendations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update suggestion rules
   * @param {Object} newRules - New suggestion rules
   */
  updateSuggestionRules(newRules) {
    this.suggestionRules = { ...this.suggestionRules, ...newRules };
    logger.debug('Port suggestion rules updated', this.suggestionRules);
  }

  /**
   * Get current suggestion rules
   * @returns {Object}
   */
  getSuggestionRules() {
    return { ...this.suggestionRules };
  }

  /**
   * Find sequential available ports
   * @param {Array<number>} requestedPorts - Requested ports
   * @param {string} protocol - Protocol
   * @param {number} maxSuggestions - Maximum suggestions
   * @param {number} nearbyRange - Nearby range
   * @param {boolean} avoidWellKnown - Avoid well-known ports
   * @returns {Promise<Array<Object>>}
   * @private
   */
  async _findSequentialPorts(requestedPorts, protocol, maxSuggestions, nearbyRange, avoidWellKnown) {
    const portCount = requestedPorts.length;
    const suggestions = [];
    const basePort = Math.min(...requestedPorts);

    // Try different starting points around the base port
    const searchRanges = [
      { start: basePort, end: basePort + nearbyRange },
      { start: Math.max(1024, basePort - nearbyRange), end: basePort },
      { start: basePort + nearbyRange, end: basePort + nearbyRange * 2 }
    ];

    for (const range of searchRanges) {
      if (suggestions.length >= maxSuggestions) break;

      for (let startPort = range.start; startPort <= range.end - portCount + 1; startPort++) {
        if (suggestions.length >= maxSuggestions) break;

        const sequence = [];
        let isSequenceValid = true;

        // Check if we can get a valid sequence starting from this port
        for (let i = 0; i < portCount; i++) {
          const port = startPort + i;
          
          if (!(await this._isPortSuitable(port, protocol, avoidWellKnown, true))) {
            isSequenceValid = false;
            break;
          }
          
          sequence.push(port);
        }

        if (isSequenceValid) {
          suggestions.push({
            type: 'sequential',
            originalPorts: requestedPorts,
            suggestedPorts: sequence,
            startPort: startPort,
            reason: `Sequential ports starting at ${startPort}`
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Find alternative ports for a single port
   * @param {number} originalPort - Original port
   * @param {string} protocol - Protocol
   * @param {number} maxSuggestions - Maximum suggestions
   * @param {number} nearbyRange - Nearby range
   * @param {boolean} avoidWellKnown - Avoid well-known ports
   * @returns {Promise<Array<number>>}
   * @private
   */
  async _findAlternativePortsForSingle(originalPort, protocol, maxSuggestions, nearbyRange, avoidWellKnown) {
    const alternatives = [];
    const searchOrder = [];

    // Create search order: nearby ports first
    for (let offset = 1; offset <= nearbyRange && alternatives.length < maxSuggestions; offset++) {
      if (originalPort + offset <= 65535) {
        searchOrder.push(originalPort + offset);
      }
      if (originalPort - offset >= 1024) {
        searchOrder.push(originalPort - offset);
      }
    }

    // Check each port in search order
    for (const port of searchOrder) {
      if (alternatives.length >= maxSuggestions) break;

      if (await this._isPortSuitable(port, protocol, avoidWellKnown, true)) {
        alternatives.push(port);
      }
    }

    // If we don't have enough suggestions, look in configured ranges
    if (alternatives.length < maxSuggestions) {
      for (const range of this.portRanges) {
        if (alternatives.length >= maxSuggestions) break;

        for (let port = range.start; port <= range.end; port++) {
          if (alternatives.length >= maxSuggestions) break;
          
          if (!alternatives.includes(port) && 
              await this._isPortSuitable(port, protocol, avoidWellKnown, false)) {
            alternatives.push(port);
          }
        }
      }
    }

    return alternatives;
  }

  /**
   * Check if a port is suitable for suggestion
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @param {boolean} avoidWellKnown - Avoid well-known ports
   * @param {boolean} respectRanges - Respect configured ranges
   * @returns {Promise<boolean>}
   * @private
   */
  async _isPortSuitable(port, protocol, avoidWellKnown, respectRanges) {
    // Check basic port validity
    if (port < 1024 || port > 65535) return false;

    // Check excluded ports
    if (this.excludedPorts.includes(port)) return false;

    // Check well-known ports
    if (avoidWellKnown && this.wellKnownPorts.has(port)) return false;

    // Check configured ranges
    if (respectRanges && !this._isPortInConfiguredRanges(port)) return false;

    // Check system availability
    const isAvailable = await this.availabilityChecker.checkSinglePort(port, protocol);
    if (!isAvailable) return false;

    // Check reservations
    const reservation = await this.reservationManager.getPortReservation(port, protocol);
    if (reservation) return false;

    return true;
  }

  /**
   * Check if port is in configured ranges
   * @param {number} port - Port to check
   * @returns {boolean}
   * @private
   */
  _isPortInConfiguredRanges(port) {
    return this.portRanges.some(range => port >= range.start && port <= range.end);
  }

  /**
   * Check for port conflicts
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol
   * @returns {Promise<Array>}
   * @private
   */
  async _checkPortConflicts(ports, protocol) {
    const conflicts = [];
    
    for (const port of ports) {
      const isAvailable = await this.availabilityChecker.checkSinglePort(port, protocol);
      const reservation = await this.reservationManager.getPortReservation(port, protocol);
      
      if (!isAvailable || reservation) {
        conflicts.push({
          port,
          protocol,
          systemConflict: !isAvailable,
          reservationConflict: !!reservation
        });
      }
    }

    return conflicts;
  }

  /**
   * Select the best recommendation from available options
   * @param {Object} recommendations - All recommendations
   * @param {Object} deploymentInfo - Deployment information
   * @returns {Object|null}
   * @private
   */
  _selectBestRecommendation(recommendations, deploymentInfo) {
    const { serviceType, requestedPorts } = deploymentInfo;

    // Priority order: service type > range > alternatives > sequential
    if (recommendations.serviceTypeSuggestions.length > 0) {
      return {
        type: 'service_based',
        ports: recommendations.serviceTypeSuggestions,
        reason: `Recommended ports for ${serviceType} service`
      };
    }

    if (recommendations.rangeSuggestions.length > 0) {
      return {
        type: 'range_based',
        ports: recommendations.rangeSuggestions,
        reason: 'Ports from preferred range'
      };
    }

    if (recommendations.alternatives.length > 0) {
      const firstAlternative = recommendations.alternatives[0];
      if (firstAlternative.type === 'sequential') {
        return {
          type: 'sequential_alternative',
          ports: firstAlternative.suggestedPorts,
          reason: firstAlternative.reason
        };
      } else if (firstAlternative.alternatives.length > 0) {
        return {
          type: 'nearby_alternative',
          ports: firstAlternative.alternatives.slice(0, requestedPorts.length),
          reason: 'Nearby available ports'
        };
      }
    }

    return null;
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
}

module.exports = PortSuggestionEngine;