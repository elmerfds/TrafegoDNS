/**
 * Port Reservation Repository
 * Manages port reservation data in the database
 */
const BaseRepository = require('./baseRepository');

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
}

module.exports = PortReservationRepository;