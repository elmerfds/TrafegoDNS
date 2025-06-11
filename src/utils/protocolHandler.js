/**
 * Protocol Handler Utility
 * Centralizes all protocol-related logic for port management
 */

const logger = require('./logger');

class ProtocolHandler {
  constructor() {
    this.validProtocols = ['tcp', 'udp', 'both'];
    this.defaultProtocol = 'tcp';
  }

  /**
   * Validates if a protocol string is valid
   * @param {string} protocol - Protocol to validate
   * @returns {boolean} True if valid
   */
  isValidProtocol(protocol) {
    if (!protocol || typeof protocol !== 'string') {
      return false;
    }
    return this.validProtocols.includes(protocol.toLowerCase());
  }

  /**
   * Normalizes protocol input to lowercase
   * @param {string} protocol - Protocol to normalize
   * @returns {string} Normalized protocol or default
   */
  normalizeProtocol(protocol) {
    if (!protocol || typeof protocol !== 'string') {
      return this.defaultProtocol;
    }
    
    const normalized = protocol.toLowerCase().trim();
    return this.isValidProtocol(normalized) ? normalized : this.defaultProtocol;
  }

  /**
   * Expands 'both' protocol to array of individual protocols
   * @param {string|string[]} protocol - Protocol(s) to expand
   * @returns {string[]} Array of individual protocols
   */
  expandProtocols(protocol) {
    if (Array.isArray(protocol)) {
      // Handle array input - expand any 'both' entries
      const expanded = [];
      for (const p of protocol) {
        const normalized = this.normalizeProtocol(p);
        if (normalized === 'both') {
          expanded.push('tcp', 'udp');
        } else {
          expanded.push(normalized);
        }
      }
      return [...new Set(expanded)]; // Remove duplicates
    }

    const normalized = this.normalizeProtocol(protocol);
    if (normalized === 'both') {
      return ['tcp', 'udp'];
    }
    return [normalized];
  }

  /**
   * Checks if protocols match, handling 'both' expansion
   * @param {string|string[]} protocol1 - First protocol(s)
   * @param {string|string[]} protocol2 - Second protocol(s)
   * @returns {boolean} True if protocols match
   */
  protocolsMatch(protocol1, protocol2) {
    const expanded1 = new Set(this.expandProtocols(protocol1));
    const expanded2 = new Set(this.expandProtocols(protocol2));

    // Check if there's any intersection
    for (const p of expanded1) {
      if (expanded2.has(p)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets all unique protocols from an array of port objects
   * @param {Array} ports - Array of port objects with protocol property
   * @returns {string[]} Array of unique protocols
   */
  getUniqueProtocols(ports) {
    if (!Array.isArray(ports)) {
      return [];
    }

    const protocols = new Set();
    for (const port of ports) {
      if (port && port.protocol) {
        const expanded = this.expandProtocols(port.protocol);
        expanded.forEach(p => protocols.add(p));
      }
    }
    return Array.from(protocols);
  }

  /**
   * Filters ports by protocol
   * @param {Array} ports - Array of port objects
   * @param {string|string[]} targetProtocol - Protocol(s) to filter by
   * @returns {Array} Filtered ports
   */
  filterPortsByProtocol(ports, targetProtocol) {
    if (!Array.isArray(ports)) {
      return [];
    }

    if (!targetProtocol) {
      return ports;
    }

    const targetProtocols = new Set(this.expandProtocols(targetProtocol));

    return ports.filter(port => {
      if (!port || !port.protocol) {
        return false;
      }
      const portProtocols = new Set(this.expandProtocols(port.protocol));
      // Check if there's any intersection
      for (const p of portProtocols) {
        if (targetProtocols.has(p)) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Creates protocol-specific options for scanning/checking
   * @param {string|string[]} protocols - Protocol(s) to create options for
   * @param {Object} baseOptions - Base options to extend
   * @returns {Array} Array of option objects, one per protocol
   */
  createProtocolOptions(protocols, baseOptions = {}) {
    const expandedProtocols = this.expandProtocols(protocols);
    
    return expandedProtocols.map(protocol => ({
      ...baseOptions,
      protocol
    }));
  }

  /**
   * Validates protocol requirements for a service type
   * @param {string} serviceType - Type of service
   * @param {string|string[]} protocols - Protocol(s) to validate
   * @returns {Object} Validation result with isValid and warnings
   */
  validateServiceProtocols(serviceType, protocols) {
    const result = {
      isValid: true,
      warnings: [],
      recommendations: []
    };

    const expandedProtocols = this.expandProtocols(protocols);
    
    // Service-specific protocol validation
    const serviceRequirements = {
      web: { preferred: ['tcp'], warning: 'Web services typically use TCP' },
      api: { preferred: ['tcp'], warning: 'API services typically use TCP' },
      database: { preferred: ['tcp'], warning: 'Database services typically use TCP' },
      dns: { preferred: ['udp', 'tcp'], warning: 'DNS services use both UDP and TCP' },
      dhcp: { preferred: ['udp'], warning: 'DHCP services use UDP' },
      ntp: { preferred: ['udp'], warning: 'NTP services use UDP' },
      streaming: { preferred: ['udp'], warning: 'Streaming services often use UDP' }
    };

    const requirements = serviceRequirements[serviceType?.toLowerCase()];
    if (requirements) {
      const hasPreferred = requirements.preferred.some(pref => 
        expandedProtocols.includes(pref)
      );
      
      if (!hasPreferred) {
        result.warnings.push(requirements.warning);
        result.recommendations.push(`Consider using: ${requirements.preferred.join(' or ')}`);
      }
    }

    return result;
  }

  /**
   * Gets the primary protocol from a protocol specification
   * Useful for display purposes or when only one protocol is needed
   * @param {string|string[]} protocols - Protocol(s)
   * @returns {string} Primary protocol
   */
  getPrimaryProtocol(protocols) {
    const expanded = this.expandProtocols(protocols);
    
    // Prefer TCP if available, otherwise return first
    if (expanded.includes('tcp')) {
      return 'tcp';
    }
    return expanded[0] || this.defaultProtocol;
  }

  /**
   * Converts protocol array back to compact form if possible
   * @param {string[]} protocols - Array of protocols
   * @returns {string} Compact protocol representation
   */
  compactProtocols(protocols) {
    if (!Array.isArray(protocols) || protocols.length === 0) {
      return this.defaultProtocol;
    }

    const uniqueProtocols = [...new Set(protocols.map(p => this.normalizeProtocol(p)))];
    
    if (uniqueProtocols.length === 2 && 
        uniqueProtocols.includes('tcp') && 
        uniqueProtocols.includes('udp')) {
      return 'both';
    }
    
    return uniqueProtocols[0] || this.defaultProtocol;
  }

  /**
   * Logs protocol-related debugging information
   * @param {string} operation - Operation being performed
   * @param {Object} data - Data to log
   */
  logProtocolDebug(operation, data) {
    logger.debug(`ProtocolHandler.${operation}:`, {
      input: data.input,
      normalized: data.normalized,
      expanded: data.expanded,
      result: data.result
    });
  }
}

// Export singleton instance
module.exports = new ProtocolHandler();