/**
 * Port Reservation Manager
 * Manages port reservations and policies
 */
const logger = require('../../utils/logger');
const PortReservationRepository = require('../../database/repository/portReservationRepository');

class PortReservationManager {
  constructor(database) {
    this.database = database;
    // Handle both database module and raw db object
    const db = database.db || database;
    this.repository = new PortReservationRepository(db);
    this.isInitialized = false;
    
    // Default reservation policies
    this.policies = {
      defaultDuration: 3600, // 1 hour in seconds
      maxDuration: 100 * 365 * 24 * 3600, // 100 years in seconds (effectively unlimited)
      cleanupInterval: 300, // 5 minutes in seconds
      allowExtension: true,
      maxReservationsPerContainer: 100
    };
  }

  /**
   * Initialize the reservation manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.repository.initialize();
      this.isInitialized = true;
      logger.info('Port Reservation Manager initialized');
    } catch (error) {
      logger.error(`Failed to initialize Port Reservation Manager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create port reservations
   * @param {Array<number>} ports - Ports to reserve
   * @param {string} containerId - Container ID
   * @param {string} protocol - Protocol (tcp/udp)
   * @param {number} duration - Duration in seconds
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Array<Object>>}
   */
  async createReservations(ports, containerId, protocol = 'tcp', duration = null, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    // Validate inputs
    if (!Array.isArray(ports) || ports.length === 0) {
      throw new Error('Ports must be a non-empty array');
    }

    if (!containerId) {
      throw new Error('Container ID is required');
    }

    // Apply duration policy
    const reservationDuration = this._validateDuration(duration);
    
    // Handle permanent reservations with a special date
    let expiresAt;
    const hundredYears = 100 * 365 * 24 * 3600;
    if (reservationDuration >= hundredYears) {
      // Use a standard "permanent" date
      expiresAt = '9999-12-31T23:59:59.999Z';
      logger.info('Creating permanent reservation');
    } else {
      expiresAt = new Date(Date.now() + reservationDuration * 1000).toISOString();
    }

    // Check container reservation limits
    await this._checkContainerLimits(containerId);

    // Check for existing reservations
    const conflicts = await this._checkForConflicts(ports, protocol, containerId);
    if (conflicts.length > 0) {
      throw new Error(`Port conflicts detected: ${conflicts.map(c => c.port).join(', ')}`);
    }

    // Create reservations
    const reservations = [];
    for (const port of ports) {
      try {
        const reservation = await this.repository.createReservation({
          port,
          container_id: containerId,
          protocol,
          expires_at: expiresAt,
          metadata: {
            ...metadata,
            original_duration: reservationDuration,
            created_by_manager: true
          }
        });

        reservations.push(reservation);
        logger.debug(`Created port reservation: ${port}/${protocol} for container ${containerId}`);
      } catch (error) {
        // If this is a unique constraint error, it means the port is already reserved
        if (error.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Port ${port}/${protocol} already reserved during batch creation`);
        } else {
          logger.error(`Failed to reserve port ${port}: ${error.message}`);
          throw error;
        }
      }
    }

    if (reservations.length === 0) {
      throw new Error('No ports could be reserved');
    }

    logger.info(`Created ${reservations.length} port reservations for container ${containerId}`);
    return reservations;
  }

  /**
   * Release port reservations
   * @param {Array<number>} ports - Ports to release
   * @param {string} containerId - Container ID
   * @returns {Promise<number>}
   */
  async releaseReservations(ports, containerId) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    if (!Array.isArray(ports) || ports.length === 0) {
      return 0;
    }

    const released = await this.repository.releaseReservations(ports, containerId);
    
    if (released > 0) {
      logger.info(`Released ${released} port reservations for container ${containerId}`);
    }

    return released;
  }

  /**
   * Release all reservations for a container
   * @param {string} containerId - Container ID
   * @returns {Promise<number>}
   */
  async releaseAllContainerReservations(containerId) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    const released = await this.repository.releaseAllReservations(containerId);
    
    if (released > 0) {
      logger.info(`Released all ${released} port reservations for container ${containerId}`);
    }

    return released;
  }

  /**
   * Get active reservations for specific ports
   * @param {Array<number>} ports - Ports to check
   * @returns {Promise<Array<Object>>}
   */
  async getActiveReservations(ports = []) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    return await this.repository.getActiveReservations(ports);
  }

  /**
   * Get reservations by container
   * @param {string} containerId - Container ID
   * @param {boolean} activeOnly - Only return active reservations
   * @returns {Promise<Array<Object>>}
   */
  async getContainerReservations(containerId, activeOnly = true) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    return await this.repository.getReservationsByContainer(containerId, activeOnly);
  }

  /**
   * Extend a port reservation
   * @param {number} port - Port number
   * @param {string} containerId - Container ID
   * @param {number} additionalDuration - Additional duration in seconds
   * @returns {Promise<boolean>}
   */
  async extendReservation(port, containerId, additionalDuration) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    if (!this.policies.allowExtension) {
      throw new Error('Reservation extension is not allowed by policy');
    }

    // Get current reservation
    const currentReservation = await this.repository.getPortReservation(port);
    if (!currentReservation || currentReservation.container_id !== containerId) {
      throw new Error('No active reservation found for this port and container');
    }

    // Calculate new expiration time
    const currentExpires = new Date(currentReservation.expires_at);
    const newExpires = new Date(currentExpires.getTime() + additionalDuration * 1000);
    
    // Check if new duration exceeds maximum
    const totalDuration = (newExpires.getTime() - new Date(currentReservation.created_at).getTime()) / 1000;
    if (totalDuration > this.policies.maxDuration) {
      throw new Error(`Extended duration would exceed maximum allowed duration of ${this.policies.maxDuration} seconds`);
    }

    const success = await this.repository.extendReservation(
      port,
      containerId,
      newExpires.toISOString()
    );

    if (success) {
      logger.info(`Extended reservation for port ${port} by ${additionalDuration} seconds`);
    }

    return success;
  }

  /**
   * Check if a port is reserved
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<Object|null>}
   */
  async getPortReservation(port, protocol = 'tcp') {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    return await this.repository.getPortReservation(port, protocol);
  }

  /**
   * Clean up expired reservations
   * @returns {Promise<number>}
   */
  async cleanupExpiredReservations() {
    if (!this.isInitialized) {
      return 0;
    }

    const cleaned = await this.repository.cleanupExpiredReservations();
    
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired port reservations`);
    }

    return cleaned;
  }

  /**
   * Check if a port is reserved
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<boolean>}
   */
  async isPortReserved(port, protocol = 'tcp') {
    if (!this.isInitialized) {
      return false;
    }

    const reservation = await this.repository.getPortReservation(port, protocol);
    return !!reservation;
  }

  /**
   * Get reservation information for a port
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<Object|null>}
   */
  async getReservationInfo(port, protocol = 'tcp') {
    if (!this.isInitialized) {
      return null;
    }

    return await this.repository.getPortReservation(port, protocol);
  }

  /**
   * Reserve a single port
   * @param {Object} options - Reservation options
   * @returns {Promise<Object>}
   */
  async reservePort(options) {
    const {
      port,
      containerId,
      protocol = 'tcp',
      duration = null,
      metadata = {}
    } = options;

    if (!port || !containerId) {
      throw new Error('Port and container ID are required');
    }

    const reservations = await this.createReservations([port], containerId, protocol, duration, metadata);
    return reservations[0];
  }

  /**
   * Release ports for a container
   * @param {string} containerId - Container ID
   * @param {Array<number>} ports - Specific ports to release (optional)
   * @returns {Promise<Array>}
   */
  async releasePortsForContainer(containerId, ports = null) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    if (ports && ports.length > 0) {
      // Release specific ports
      const releasedCount = await this.releaseReservations(ports, containerId);
      const releasedReservations = [];
      for (const port of ports) {
        releasedReservations.push({
          port,
          containerId,
          releasedAt: new Date().toISOString()
        });
      }
      return releasedReservations;
    } else {
      // Release all ports for the container
      const existingReservations = await this.getContainerReservations(containerId, true);
      await this.releaseAllContainerReservations(containerId);
      return existingReservations.map(reservation => ({
        port: reservation.port,
        containerId,
        releasedAt: new Date().toISOString()
      }));
    }
  }

  /**
   * Get reservations with filters
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>}
   */
  async getReservations(filters = {}) {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    const { containerId, ports, activeOnly = true } = filters;

    if (containerId) {
      return await this.getContainerReservations(containerId, activeOnly);
    }

    if (ports && ports.length > 0) {
      return await this.getActiveReservations(ports);
    }

    // Get all active reservations
    return await this.getActiveReservations();
  }

  /**
   * Get reservation statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    if (!this.isInitialized) {
      throw new Error('Port Reservation Manager not initialized');
    }

    const stats = await this.repository.getStatistics();
    
    return {
      ...stats,
      policies: this.policies
    };
  }

  /**
   * Get active reservation count
   * @returns {Promise<number>}
   */
  async getActiveReservationCount() {
    if (!this.isInitialized) {
      return 0;
    }

    return await this.repository.getActiveReservationCount();
  }

  /**
   * Update reservation policies
   * @param {Object} newPolicies - New policy settings
   */
  updatePolicies(newPolicies) {
    this.policies = { ...this.policies, ...newPolicies };
    logger.info('Port reservation policies updated', this.policies);
  }

  /**
   * Get current policies
   * @returns {Object}
   */
  getPolicies() {
    return { ...this.policies };
  }

  /**
   * Cleanup method for shutdown
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      await this.cleanupExpiredReservations();
      logger.info('Port Reservation Manager cleanup completed');
    } catch (error) {
      logger.error(`Error during Port Reservation Manager cleanup: ${error.message}`);
    }
  }

  /**
   * Validate reservation duration against policies
   * @param {number} duration - Requested duration
   * @returns {number} - Validated duration
   * @private
   */
  _validateDuration(duration) {
    const requestedDuration = duration || this.policies.defaultDuration;
    
    logger.debug(`Validating duration: requested=${requestedDuration}s, default=${this.policies.defaultDuration}s, max=${this.policies.maxDuration}s`);
    
    // Allow very long durations for permanent reservations
    if (requestedDuration > this.policies.maxDuration) {
      // Only warn if it's not a permanent reservation (100 years)
      const hundredYears = 100 * 365 * 24 * 3600;
      if (requestedDuration < hundredYears) {
        logger.warn(`Requested duration ${requestedDuration}s exceeds maximum ${this.policies.maxDuration}s, using maximum`);
        return this.policies.maxDuration;
      }
      // Allow permanent reservations to pass through
      logger.info(`Creating permanent reservation with duration: ${requestedDuration}s (${Math.round(requestedDuration / (365 * 24 * 3600))} years)`);
    }

    if (requestedDuration < 60) { // Minimum 1 minute
      logger.warn(`Requested duration ${requestedDuration}s is too short, using 60 seconds`);
      return 60;
    }

    // Log the final duration for debugging
    logger.debug(`Final validated duration: ${requestedDuration}s (${this._formatDuration(requestedDuration)})`);
    return requestedDuration;
  }

  /**
   * Format duration for human-readable logging
   * @param {number} seconds - Duration in seconds
   * @returns {string}
   * @private
   */
  _formatDuration(seconds) {
    if (seconds >= 365 * 24 * 3600) {
      return `${Math.round(seconds / (365 * 24 * 3600))} years`;
    } else if (seconds >= 24 * 3600) {
      return `${Math.round(seconds / (24 * 3600))} days`;
    } else if (seconds >= 3600) {
      return `${Math.round(seconds / 3600)} hours`;
    } else if (seconds >= 60) {
      return `${Math.round(seconds / 60)} minutes`;
    } else {
      return `${seconds} seconds`;
    }
  }

  /**
   * Check container reservation limits
   * @param {string} containerId - Container ID
   * @private
   */
  async _checkContainerLimits(containerId) {
    const currentReservations = await this.repository.getReservationsByContainer(containerId, true);
    
    if (currentReservations.length >= this.policies.maxReservationsPerContainer) {
      throw new Error(`Container ${containerId} has reached maximum reservation limit of ${this.policies.maxReservationsPerContainer}`);
    }
  }

  /**
   * Check for existing port conflicts
   * @param {Array<number>} ports - Ports to check
   * @param {string} protocol - Protocol
   * @param {string} containerId - Container ID requesting the ports
   * @returns {Promise<Array>}
   * @private
   */
  async _checkForConflicts(ports, protocol, containerId) {
    const conflicts = [];
    
    for (const port of ports) {
      const existing = await this.repository.getPortReservation(port, protocol);
      
      if (existing && existing.container_id !== containerId) {
        conflicts.push({
          port,
          protocol,
          existingContainer: existing.container_id,
          expiresAt: existing.expires_at
        });
      }
    }

    return conflicts;
  }
}

module.exports = PortReservationManager;