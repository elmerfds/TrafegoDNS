/**
 * Port Reservation Repository
 * Manages port reservation data in the database
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');
const protocolHandler = require('../../utils/protocolHandler');

class PortReservationRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'port_reservations';
  }

  /**
   * Initialize the repository (create tables if needed)
   * @returns {Promise<void>}
   */
  async initialize() {
    await this._createTableIfNotExists();
    await this._createIndexes();
  }

  /**
   * Create a new port reservation
   * @param {Object} reservationData - Reservation data
   * @returns {Promise<Object>}
   */
  async createReservation(reservationData) {
    const {
      port,
      container_id,
      protocol = 'tcp',
      expires_at,
      metadata = {},
      created_by = 'system'
    } = reservationData;

    const data = {
      port,
      container_id,
      protocol,
      expires_at,
      metadata: JSON.stringify(metadata),
      created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.create(data);
  }

  /**
   * Get active reservations for specific ports
   * @param {Array<number>} ports - Ports to check
   * @returns {Promise<Array<Object>>}
   */
  async getActiveReservations(ports = []) {
    const now = new Date().toISOString();
    let whereClause = 'expires_at > ?';
    let params = [now];

    if (ports.length > 0) {
      const placeholders = ports.map(() => '?').join(',');
      whereClause += ` AND port IN (${placeholders})`;
      params.push(...ports);
    }

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `;

    const reservations = await this.db.all(sql, params);
    
    // Parse metadata JSON
    return reservations.map(reservation => ({
      ...reservation,
      metadata: JSON.parse(reservation.metadata || '{}')
    }));
  }

  /**
   * Get all active reservations
   * @returns {Promise<Array<Object>>}
   */
  async getAllActiveReservations() {
    return await this.getActiveReservations();
  }

  /**
   * Get reservations by container ID
   * @param {string} containerId - Container ID
   * @param {boolean} activeOnly - Only return active reservations
   * @returns {Promise<Array<Object>>}
   */
  async getReservationsByContainer(containerId, activeOnly = true) {
    let whereClause = 'container_id = ?';
    const params = [containerId];

    if (activeOnly) {
      whereClause += ' AND expires_at > ?';
      params.push(new Date().toISOString());
    }

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `;

    const reservations = await this.db.all(sql, params);
    
    return reservations.map(reservation => ({
      ...reservation,
      metadata: JSON.parse(reservation.metadata || '{}')
    }));
  }

  /**
   * Release reservations for specific ports and container
   * @param {Array<number>} ports - Ports to release
   * @param {string} containerId - Container ID
   * @returns {Promise<number>} - Number of released reservations
   */
  async releaseReservations(ports, containerId) {
    const placeholders = ports.map(() => '?').join(',');
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE port IN (${placeholders}) AND container_id = ?
    `;

    const params = [...ports, containerId];
    const result = await this.db.run(sql, params);
    return result.changes;
  }

  /**
   * Release all reservations for a container
   * @param {string} containerId - Container ID
   * @returns {Promise<number>} - Number of released reservations
   */
  async releaseAllReservations(containerId) {
    const sql = `DELETE FROM ${this.tableName} WHERE container_id = ?`;
    const result = await this.db.run(sql, [containerId]);
    return result.changes;
  }

  /**
   * Extend reservation expiration
   * @param {number} port - Port number
   * @param {string} containerId - Container ID
   * @param {string} newExpiresAt - New expiration time
   * @returns {Promise<boolean>}
   */
  async extendReservation(port, containerId, newExpiresAt) {
    const sql = `
      UPDATE ${this.tableName}
      SET expires_at = ?, updated_at = ?
      WHERE port = ? AND container_id = ?
    `;

    const result = await this.db.run(sql, [
      newExpiresAt,
      new Date().toISOString(),
      port,
      containerId
    ]);

    return result.changes > 0;
  }

  /**
   * Clean up expired reservations
   * @returns {Promise<number>} - Number of cleaned up reservations
   */
  async cleanupExpiredReservations() {
    const now = new Date().toISOString();
    const sql = `DELETE FROM ${this.tableName} WHERE expires_at <= ?`;
    const result = await this.db.run(sql, [now]);
    return result.changes;
  }

  /**
   * Get reservation statistics
   * @returns {Promise<Object>}
   */
  async getStatistics() {
    const now = new Date().toISOString();
    
    const stats = await this.db.all(`
      SELECT 
        COUNT(*) as total_reservations,
        COUNT(CASE WHEN expires_at > ? THEN 1 END) as active_reservations,
        COUNT(CASE WHEN expires_at <= ? THEN 1 END) as expired_reservations,
        COUNT(DISTINCT container_id) as unique_containers,
        COUNT(DISTINCT port) as unique_ports
      FROM ${this.tableName}
    `, [now, now]);

    const protocolStats = await this.db.all(`
      SELECT protocol, COUNT(*) as count
      FROM ${this.tableName}
      WHERE expires_at > ?
      GROUP BY protocol
    `, [now]);

    return {
      ...stats[0],
      protocolBreakdown: protocolStats.reduce((acc, row) => {
        acc[row.protocol] = row.count;
        return acc;
      }, {})
    };
  }

  /**
   * Get count of active reservations
   * @returns {Promise<number>}
   */
  async getActiveReservationCount() {
    const now = new Date().toISOString();
    const result = await this.db.get(`
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE expires_at > ?
    `, [now]);

    return result.count;
  }

  /**
   * Check if a port is reserved
   * @param {number} port - Port to check
   * @param {string} protocol - Protocol
   * @returns {Promise<Object|null>}
   */
  async getPortReservation(port, protocol = 'tcp') {
    const now = new Date().toISOString();
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE port = ? AND protocol = ? AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const reservation = await this.db.get(sql, [port, protocol, now]);
    
    if (reservation) {
      return {
        ...reservation,
        metadata: JSON.parse(reservation.metadata || '{}')
      };
    }

    return null;
  }

  /**
   * Create the port_reservations table
   * @private
   */
  async _createTableIfNotExists() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        port INTEGER NOT NULL,
        container_id TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        expires_at TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_by TEXT DEFAULT 'system',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(port, protocol, container_id)
      )
    `;

    await this.db.run(sql);
  }

  /**
   * Create indexes for better performance
   * @private
   */
  async _createIndexes() {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_port_reservations_port ON ${this.tableName} (port)`,
      `CREATE INDEX IF NOT EXISTS idx_port_reservations_container ON ${this.tableName} (container_id)`,
      `CREATE INDEX IF NOT EXISTS idx_port_reservations_expires ON ${this.tableName} (expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_port_reservations_protocol ON ${this.tableName} (protocol)`,
      `CREATE INDEX IF NOT EXISTS idx_port_reservations_active ON ${this.tableName} (port, protocol, expires_at)`
    ];

    for (const indexSql of indexes) {
      await this.db.run(indexSql);
    }
  }

  /**
   * Table-specific consistency checks for port reservations
   * @private
   */
  async _checkTableSpecific(report, fix = false) {
    try {
      // 1. Check for invalid port numbers
      const invalidPorts = await this.db.all(`
        SELECT id, port, protocol, container_id
        FROM ${this.tableName} 
        WHERE port < 1 OR port > 65535
      `);

      if (invalidPorts.length > 0) {
        report.issues.push(`Found ${invalidPorts.length} reservations with invalid port numbers`);
        
        if (fix) {
          const result = await this.db.run(`
            DELETE FROM ${this.tableName} 
            WHERE port < 1 OR port > 65535
          `);
          report.fixes.push(`Deleted ${result.changes} reservations with invalid port numbers`);
        }
      }

      // 2. Check for invalid protocols
      const invalidProtocols = await this.db.all(`
        SELECT id, port, protocol, container_id
        FROM ${this.tableName} 
        WHERE protocol NOT IN ('tcp', 'udp', 'both')
      `);

      if (invalidProtocols.length > 0) {
        report.issues.push(`Found ${invalidProtocols.length} reservations with invalid protocols`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET protocol = 'tcp' 
            WHERE protocol NOT IN ('tcp', 'udp', 'both')
          `);
          report.fixes.push(`Fixed ${result.changes} invalid protocols (set to 'tcp')`);
        }
      }

      // 3. Check for invalid status values
      const invalidStatuses = await this.db.all(`
        SELECT id, port, protocol, status
        FROM ${this.tableName} 
        WHERE status NOT IN ('active', 'expired', 'released', 'cancelled')
      `);

      if (invalidStatuses.length > 0) {
        report.issues.push(`Found ${invalidStatuses.length} reservations with invalid status values`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET status = 'expired' 
            WHERE status NOT IN ('active', 'expired', 'released', 'cancelled')
          `);
          report.fixes.push(`Fixed ${result.changes} invalid status values (set to 'expired')`);
        }
      }

      // 4. Check for expired active reservations
      const expiredActive = await this.db.all(`
        SELECT id, port, protocol, container_id, expires_at
        FROM ${this.tableName} 
        WHERE status = 'active' 
        AND expires_at IS NOT NULL 
        AND datetime(expires_at) < datetime('now')
      `);

      if (expiredActive.length > 0) {
        report.issues.push(`Found ${expiredActive.length} active reservations that should be expired`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET status = 'expired', released_at = CURRENT_TIMESTAMP
            WHERE status = 'active' 
            AND expires_at IS NOT NULL 
            AND datetime(expires_at) < datetime('now')
          `);
          report.fixes.push(`Marked ${result.changes} expired reservations as expired`);
        }
      }

      // 5. Check for missing container IDs
      const missingContainers = await this.db.all(`
        SELECT id, port, protocol, container_id
        FROM ${this.tableName} 
        WHERE container_id IS NULL OR container_id = '' OR TRIM(container_id) = ''
      `);

      if (missingContainers.length > 0) {
        report.issues.push(`Found ${missingContainers.length} reservations with missing container IDs`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET status = 'expired', released_at = CURRENT_TIMESTAMP
            WHERE (container_id IS NULL OR container_id = '' OR TRIM(container_id) = '')
            AND status = 'active'
          `);
          report.fixes.push(`Marked ${result.changes} reservations with missing container IDs as expired`);
        }
      }

      // 6. Check for future creation/reservation dates
      const futureReservations = await this.db.all(`
        SELECT id, port, protocol, reserved_at, created_at
        FROM ${this.tableName} 
        WHERE reserved_at > datetime('now') 
        OR created_at > datetime('now')
      `);

      if (futureReservations.length > 0) {
        report.issues.push(`Found ${futureReservations.length} reservations with future timestamps`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET reserved_at = CASE WHEN reserved_at > datetime('now') THEN datetime('now') ELSE reserved_at END,
                created_at = CASE WHEN created_at > datetime('now') THEN datetime('now') ELSE created_at END
            WHERE reserved_at > datetime('now') 
            OR created_at > datetime('now')
          `);
          report.fixes.push(`Fixed ${result.changes} future timestamps`);
        }
      }

      // 7. Check for invalid duration values
      const invalidDurations = await this.db.all(`
        SELECT id, port, protocol, duration_seconds
        FROM ${this.tableName} 
        WHERE duration_seconds IS NOT NULL 
        AND (duration_seconds < 60 OR duration_seconds > 604800)
      `);

      if (invalidDurations.length > 0) {
        report.issues.push(`Found ${invalidDurations.length} reservations with invalid duration (not between 60s and 7 days)`);
        
        if (fix) {
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET duration_seconds = CASE 
              WHEN duration_seconds < 60 THEN 3600 
              WHEN duration_seconds > 604800 THEN 86400 
              ELSE duration_seconds 
            END
            WHERE duration_seconds IS NOT NULL 
            AND (duration_seconds < 60 OR duration_seconds > 604800)
          `);
          report.fixes.push(`Fixed ${result.changes} invalid durations`);
        }
      }

      report.checks.push({
        name: 'Port Reservation Specific Checks',
        passed: report.issues.length === 0,
        issues: report.issues.length
      });

    } catch (error) {
      report.issues.push(`Port reservation consistency check failed: ${error.message}`);
      logger.error('Port reservation consistency check failed', error);
    }
  }

  /**
   * Validate entity data with port reservation specific rules
   * @param {Object} data - Entity data
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} - Validated data
   */
  validateEntity(data, isUpdate = false) {
    // Call parent validation first
    const validated = super.validateEntity(data, isUpdate);

    // Port number validation
    if (validated.port !== undefined) {
      const port = parseInt(validated.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port number: ${validated.port}. Must be between 1 and 65535`);
      }
      validated.port = port;
    }

    // Protocol validation
    if (validated.protocol !== undefined) {
      if (!protocolHandler.isValidProtocol(validated.protocol)) {
        throw new Error(`Invalid protocol: ${validated.protocol}. Must be 'tcp', 'udp', or 'both'`);
      }
      validated.protocol = protocolHandler.normalizeProtocol(validated.protocol);
    }

    // Status validation
    if (validated.status !== undefined) {
      const validStatuses = ['active', 'expired', 'released', 'cancelled'];
      if (!validStatuses.includes(validated.status)) {
        throw new Error(`Invalid status: ${validated.status}. Must be one of: ${validStatuses.join(', ')}`);
      }
    }

    // Container ID validation
    if (validated.container_id !== undefined) {
      if (typeof validated.container_id === 'string') {
        validated.container_id = validated.container_id.trim();
        if (validated.container_id === '') {
          validated.container_id = null;
        }
      }
    }

    // Duration validation
    if (validated.duration_seconds !== undefined) {
      const duration = parseInt(validated.duration_seconds);
      if (isNaN(duration) || duration < 60 || duration > 604800) { // 60s to 7 days
        throw new Error(`Invalid duration: ${validated.duration_seconds}. Must be between 60 and 604800 seconds`);
      }
      validated.duration_seconds = duration;
    }

    // Server ID validation (if present)
    if (validated.server_id !== undefined) {
      if (typeof validated.server_id === 'string') {
        validated.server_id = validated.server_id.trim();
        if (validated.server_id === '') {
          validated.server_id = null;
        }
      }
    }

    // Metadata validation (ensure it's valid JSON)
    if (validated.metadata !== undefined) {
      if (typeof validated.metadata === 'string') {
        try {
          JSON.parse(validated.metadata);
        } catch (error) {
          throw new Error(`Invalid metadata JSON: ${error.message}`);
        }
      } else if (typeof validated.metadata === 'object' && validated.metadata !== null) {
        validated.metadata = JSON.stringify(validated.metadata);
      }
    }

    // Date validation for timestamps
    const dateFields = ['reserved_at', 'expires_at', 'released_at'];
    dateFields.forEach(field => {
      if (validated[field] !== undefined && validated[field] !== null) {
        const date = new Date(validated[field]);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date format for ${field}: ${validated[field]}`);
        }
        // Don't allow future dates for reserved_at and released_at
        if ((field === 'reserved_at' || field === 'released_at') && date > new Date()) {
          throw new Error(`${field} cannot be in the future`);
        }
      }
    });

    return validated;
  }
}

module.exports = PortReservationRepository;