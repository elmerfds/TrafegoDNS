/**
 * Improved Port Repository
 * Enhanced repository for port monitoring with connection pooling and transactions
 */
const ImprovedBaseRepository = require('./improvedBaseRepository');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ImprovedPortRepository extends ImprovedBaseRepository {
  constructor() {
    super('ports');
  }

  /**
   * Get all ports with advanced filtering and relations
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Ports with pagination
   */
  async getAllPorts(options = {}) {
    const {
      filters = {},
      include = ['alerts', 'lastScan', 'reservation'],
      orderBy = 'port ASC',
      limit = 100,
      offset = 0
    } = options;

    // Build where conditions
    const where = {};
    
    if (filters.server_id) where.server_id = filters.server_id;
    if (filters.status) where.status = filters.status;
    if (filters.protocol) where.protocol = filters.protocol;
    if (filters.container_id) where.container_id = filters.container_id;
    if (filters.service) where.service = { $like: `%${filters.service}%` };
    
    if (filters.port) {
      if (Array.isArray(filters.port)) {
        where.port = { $in: filters.port };
      } else if (typeof filters.port === 'object') {
        where.port = filters.port; // Support range queries
      } else {
        where.port = filters.port;
      }
    }

    // Get ports with basic info
    const result = await this.findAll({
      where,
      orderBy,
      limit,
      offset
    });

    // Load relations if requested
    if (include.length > 0 && result.data.length > 0) {
      await this._loadPortRelations(result.data, include);
    }

    return result;
  }

  /**
   * Get port by ID with relations
   * @param {string} id - Port ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Port data
   */
  async getPortById(id, options = {}) {
    const { include = ['alerts', 'lastScan', 'reservation'] } = options;
    
    const port = await this.findById(id, { include });
    
    if (port && include.length > 0) {
      await this._loadPortRelations([port], include);
    }
    
    return port;
  }

  /**
   * Get ports by server
   * @param {string} serverId - Server ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Ports data
   */
  async getPortsByServer(serverId, options = {}) {
    return this.getAllPorts({
      ...options,
      filters: {
        ...options.filters,
        server_id: serverId
      }
    });
  }

  /**
   * Create or update port
   * @param {Object} portData - Port data
   * @returns {Promise<Object>} - Created/updated port
   */
  async upsertPort(portData) {
    return this.withTransaction(async (tx) => {
      // Generate fingerprint for uniqueness
      const fingerprint = this._generateFingerprint(portData);
      
      // Check if port exists
      const existing = await tx.get(
        `SELECT * FROM ${this.tableName} WHERE fingerprint = ?`,
        [fingerprint]
      );
      
      if (existing) {
        // Update existing port
        const updateData = {
          ...portData,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        delete updateData.id; // Don't update ID
        
        const fields = Object.keys(updateData);
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = [...fields.map(f => updateData[f]), existing.id];
        
        await tx.run(
          `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`,
          values
        );
        
        return { ...existing, ...updateData };
      } else {
        // Create new port
        const id = uuidv4();
        const now = new Date().toISOString();
        
        const newPort = {
          id,
          ...portData,
          fingerprint,
          first_seen: now,
          last_seen: now,
          created_at: now,
          updated_at: now
        };
        
        const fields = Object.keys(newPort);
        const placeholders = fields.map(() => '?').join(', ');
        const values = fields.map(f => newPort[f]);
        
        await tx.run(
          `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`,
          values
        );
        
        return newPort;
      }
    });
  }

  /**
   * Bulk update ports
   * @param {Array<Object>} portsData - Array of port data
   * @returns {Promise<Array>} - Updated ports
   */
  async bulkUpsertPorts(portsData) {
    return this.withTransaction(async (tx) => {
      const results = [];
      
      for (const portData of portsData) {
        try {
          const result = await this.upsertPort(portData);
          results.push(result);
        } catch (error) {
          logger.error(`Error upserting port: ${error.message}`, { portData });
        }
      }
      
      return results;
    });
  }

  /**
   * Mark ports as unavailable if not seen recently
   * @param {string} serverId - Server ID
   * @param {number} threshold - Threshold in seconds
   * @returns {Promise<number>} - Number of ports marked
   */
  async markStalePortsAsUnavailable(serverId, threshold = 300) {
    const thresholdDate = new Date(Date.now() - threshold * 1000).toISOString();
    
    return this.updateWhere(
      {
        server_id: serverId,
        status: 'available',
        last_seen: { $lt: thresholdDate }
      },
      {
        status: 'unavailable',
        updated_at: new Date().toISOString()
      }
    );
  }

  /**
   * Get port statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} - Statistics
   */
  async getPortStatistics(filters = {}) {
    return this.withConnection(async (connection) => {
      const baseWhere = [];
      const params = [];
      
      if (filters.server_id) {
        baseWhere.push('server_id = ?');
        params.push(filters.server_id);
      }
      
      const whereClause = baseWhere.length > 0 ? `WHERE ${baseWhere.join(' AND ')}` : '';
      
      // Get counts by status
      const statusCounts = await connection.all(`
        SELECT status, COUNT(*) as count
        FROM ${this.tableName}
        ${whereClause}
        GROUP BY status
      `, params);
      
      // Get counts by protocol
      const protocolCounts = await connection.all(`
        SELECT protocol, COUNT(*) as count
        FROM ${this.tableName}
        ${whereClause}
        GROUP BY protocol
      `, params);
      
      // Get recent activity
      const recentActivity = await connection.get(`
        SELECT COUNT(*) as count
        FROM ${this.tableName}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} last_seen > datetime('now', '-1 hour')
      `, params);
      
      // Get top services
      const topServices = await connection.all(`
        SELECT service, COUNT(*) as count
        FROM ${this.tableName}
        ${whereClause}
        ${whereClause ? 'AND' : 'WHERE'} service IS NOT NULL
        GROUP BY service
        ORDER BY count DESC
        LIMIT 10
      `, params);
      
      // Format statistics
      const stats = {
        total: statusCounts.reduce((sum, s) => sum + s.count, 0),
        byStatus: {},
        byProtocol: {},
        recentActivity: recentActivity?.count || 0,
        topServices: topServices.map(s => ({
          name: s.service,
          count: s.count
        }))
      };
      
      statusCounts.forEach(s => {
        stats.byStatus[s.status] = s.count;
      });
      
      protocolCounts.forEach(p => {
        stats.byProtocol[p.protocol] = p.count;
      });
      
      return stats;
    });
  }

  /**
   * Search ports with full-text capabilities
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Search results
   */
  async searchPorts(searchTerm, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      return { data: [], pagination: { total: 0, limit, offset } };
    }
    
    const searchPattern = `%${searchTerm}%`;
    
    return this.withConnection(async (connection) => {
      const sql = `
        SELECT * FROM ${this.tableName}
        WHERE 
          CAST(port AS TEXT) LIKE ? OR
          service LIKE ? OR
          container_name LIKE ? OR
          container_id LIKE ? OR
          documentation LIKE ?
        ORDER BY 
          CASE 
            WHEN CAST(port AS TEXT) = ? THEN 0
            WHEN service = ? THEN 1
            ELSE 2
          END,
          port ASC
        LIMIT ? OFFSET ?
      `;
      
      const params = [
        searchPattern, searchPattern, searchPattern, searchPattern, searchPattern,
        searchTerm, searchTerm,
        limit, offset
      ];
      
      const rows = await connection.all(sql, params);
      
      // Get total count
      const countSql = `
        SELECT COUNT(*) as total FROM ${this.tableName}
        WHERE 
          CAST(port AS TEXT) LIKE ? OR
          service LIKE ? OR
          container_name LIKE ? OR
          container_id LIKE ? OR
          documentation LIKE ?
      `;
      
      const countParams = [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern];
      const countResult = await connection.get(countSql, countParams);
      
      return {
        data: rows,
        pagination: {
          total: countResult?.total || 0,
          limit,
          offset,
          page: Math.floor(offset / limit) + 1,
          pages: Math.ceil((countResult?.total || 0) / limit)
        }
      };
    });
  }

  /**
   * Load port relations
   * @private
   */
  async _loadPortRelations(ports, include) {
    if (!Array.isArray(ports) || ports.length === 0) return;
    
    const portIds = ports.map(p => p.id);
    
    return this.withConnection(async (connection) => {
      // Load alerts
      if (include.includes('alerts')) {
        const alerts = await connection.all(`
          SELECT * FROM port_alerts 
          WHERE port_id IN (${portIds.map(() => '?').join(',')})
          ORDER BY created_at DESC
        `, portIds);
        
        // Group alerts by port
        const alertsByPort = {};
        alerts.forEach(alert => {
          if (!alertsByPort[alert.port_id]) {
            alertsByPort[alert.port_id] = [];
          }
          alertsByPort[alert.port_id].push(alert);
        });
        
        // Attach to ports
        ports.forEach(port => {
          port.alerts = alertsByPort[port.id] || [];
          port.unread_alerts = port.alerts.filter(a => !a.acknowledged).length;
        });
      }
      
      // Load last scan info
      if (include.includes('lastScan')) {
        const scans = await connection.all(`
          SELECT * FROM port_scans
          WHERE id IN (
            SELECT MAX(id) FROM port_scans
            WHERE server_id IN (
              SELECT DISTINCT server_id FROM ports 
              WHERE id IN (${portIds.map(() => '?').join(',')})
            )
            GROUP BY server_id
          )
        `, portIds);
        
        // Create lookup by server_id
        const scansByServer = {};
        scans.forEach(scan => {
          scansByServer[scan.server_id] = scan;
        });
        
        // Attach to ports
        ports.forEach(port => {
          port.lastScan = scansByServer[port.server_id] || null;
        });
      }
      
      // Load active reservation
      if (include.includes('reservation')) {
        const now = new Date().toISOString();
        const reservations = await connection.all(`
          SELECT * FROM port_reservations
          WHERE port IN (
            SELECT DISTINCT port FROM ports 
            WHERE id IN (${portIds.map(() => '?').join(',')})
          )
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > ?)
        `, [...portIds, now]);
        
        // Create lookup by port number
        const reservationsByPort = {};
        reservations.forEach(res => {
          reservationsByPort[res.port] = res;
        });
        
        // Attach to ports
        ports.forEach(port => {
          port.reservation = reservationsByPort[port.port] || null;
        });
      }
    });
  }

  /**
   * Generate fingerprint for port uniqueness
   * @private
   */
  _generateFingerprint(portData) {
    const parts = [
      portData.server_id || 'unknown',
      portData.port,
      portData.protocol || 'tcp'
    ];
    
    return parts.join(':');
  }

  /**
   * Validate port entity
   * @protected
   */
  async validateEntitySpecific(data, isUpdate) {
    const errors = [];
    
    if (!isUpdate) {
      // Validation for create
      if (!data.port || data.port < 1 || data.port > 65535) {
        errors.push('Invalid port number');
      }
      
      if (!data.server_id) {
        errors.push('Server ID is required');
      }
      
      if (!['tcp', 'udp', 'both'].includes(data.protocol)) {
        data.protocol = 'tcp'; // Default
      }
    }
    
    // Common validation
    if (data.status && !['available', 'unavailable', 'reserved'].includes(data.status)) {
      errors.push('Invalid status');
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    return data;
  }

  /**
   * Run port-specific consistency checks
   * @protected
   */
  async runSpecificChecks(tx, report, fix) {
    // Check for duplicate port entries
    const duplicates = await tx.all(`
      SELECT server_id, port, protocol, COUNT(*) as count
      FROM ${this.tableName}
      GROUP BY server_id, port, protocol
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.length > 0) {
      report.issues.push(`Found ${duplicates.length} duplicate port entries`);
      
      if (fix) {
        for (const dup of duplicates) {
          // Keep the most recent entry
          const result = await tx.run(`
            DELETE FROM ${this.tableName}
            WHERE server_id = ? AND port = ? AND protocol = ?
            AND id NOT IN (
              SELECT id FROM ${this.tableName}
              WHERE server_id = ? AND port = ? AND protocol = ?
              ORDER BY updated_at DESC
              LIMIT 1
            )
          `, [
            dup.server_id, dup.port, dup.protocol,
            dup.server_id, dup.port, dup.protocol
          ]);
          
          if (result.changes > 0) {
            report.fixes.push(`Removed ${result.changes} duplicate entries for port ${dup.port}`);
          }
        }
      }
    }
    
    // Check for invalid port numbers
    const invalidPorts = await tx.all(`
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE port < 1 OR port > 65535
    `);
    
    if (invalidPorts[0].count > 0) {
      report.issues.push(`Found ${invalidPorts[0].count} entries with invalid port numbers`);
      
      if (fix) {
        const result = await tx.run(`
          DELETE FROM ${this.tableName}
          WHERE port < 1 OR port > 65535
        `);
        
        report.fixes.push(`Removed ${result.changes} entries with invalid port numbers`);
      }
    }
  }
}

module.exports = ImprovedPortRepository;