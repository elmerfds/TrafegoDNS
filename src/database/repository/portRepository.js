const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

/**
 * Repository for port monitoring operations
 */
class PortRepository extends BaseRepository {
  constructor(database) {
    super(database);
    this.tableName = 'ports';
  }

  /**
   * Get all ports with optional filtering
   */
  async getAllPorts(filters = {}) {
    try {
      let query = `
        SELECT 
          p.*,
          ps.status as last_scan_status,
          ps.completed_at as last_scan_time,
          (SELECT COUNT(*) FROM port_alerts pa WHERE pa.port_id = p.id AND pa.acknowledged = 0) as unread_alerts
        FROM ports p
        LEFT JOIN port_scans ps ON ps.host = p.host AND ps.id = (
          SELECT MAX(id) FROM port_scans WHERE host = p.host AND status = 'completed'
        )
        WHERE 1=1
      `;
      
      const params = [];
      
      if (filters.host) {
        query += ' AND p.host = ?';
        params.push(filters.host);
      }
      
      if (filters.status) {
        query += ' AND p.status = ?';
        params.push(filters.status);
      }
      
      if (filters.protocol) {
        query += ' AND p.protocol = ?';
        params.push(filters.protocol);
      }
      
      if (filters.container_id) {
        query += ' AND p.container_id = ?';
        params.push(filters.container_id);
      }
      
      if (filters.service_name) {
        query += ' AND p.service_name LIKE ?';
        params.push(`%${filters.service_name}%`);
      }

      if (filters.port_range) {
        const [start, end] = filters.port_range.split('-').map(Number);
        query += ' AND p.port BETWEEN ? AND ?';
        params.push(start, end);
      }
      
      query += ' ORDER BY p.host, p.port';
      
      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
        
        if (filters.offset) {
          query += ' OFFSET ?';
          params.push(parseInt(filters.offset));
        }
      }
      
      const stmt = this.db.prepare(query);
      const ports = stmt.all(...params);
      
      // Parse JSON fields
      return ports.map(port => ({
        ...port,
        labels: port.labels ? JSON.parse(port.labels) : {},
        unread_alerts: port.unread_alerts || 0
      }));
    } catch (error) {
      logger.error('Failed to get ports:', error);
      throw error;
    }
  }

  /**
   * Get ports by host
   */
  async getPortsByHost(host) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ports 
        WHERE host = ? 
        ORDER BY port
      `);
      
      const ports = stmt.all(host);
      return ports.map(port => ({
        ...port,
        labels: port.labels ? JSON.parse(port.labels) : {}
      }));
    } catch (error) {
      logger.error(`Failed to get ports for host ${host}:`, error);
      throw error;
    }
  }

  /**
   * Get ports by container
   */
  async getPortsByContainer(containerId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ports 
        WHERE container_id = ? 
        ORDER BY port
      `);
      
      const ports = stmt.all(containerId);
      return ports.map(port => ({
        ...port,
        labels: port.labels ? JSON.parse(port.labels) : {}
      }));
    } catch (error) {
      logger.error(`Failed to get ports for container ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Create or update a port
   */
  async upsertPort(portData) {
    try {
      const {
        host, port, protocol = 'tcp', status = 'open',
        service_name, service_version, description, labels = {},
        container_id, container_name
      } = portData;

      const labelsJson = JSON.stringify(labels);
      
      const stmt = this.db.prepare(`
        INSERT INTO ports (
          host, port, protocol, status, service_name, service_version,
          description, labels, container_id, container_name, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(host, port, protocol) DO UPDATE SET
          status = excluded.status,
          service_name = excluded.service_name,
          service_version = excluded.service_version,
          description = excluded.description,
          labels = excluded.labels,
          container_id = excluded.container_id,
          container_name = excluded.container_name,
          last_seen = CURRENT_TIMESTAMP
      `);
      
      const result = stmt.run(
        host, port, protocol, status, service_name, service_version,
        description, labelsJson, container_id, container_name
      );
      
      return this.getPortById(result.lastInsertRowid || this.getPortId(host, port, protocol));
    } catch (error) {
      logger.error('Failed to upsert port:', error);
      throw error;
    }
  }

  /**
   * Update port details
   */
  async updatePort(id, updates) {
    try {
      const allowedFields = [
        'description', 'labels', 'service_name', 'service_version', 
        'status', 'container_id', 'container_name'
      ];
      
      const fields = [];
      const values = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(key === 'labels' ? JSON.stringify(value) : value);
        }
      });
      
      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      const stmt = this.db.prepare(`
        UPDATE ports 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      values.push(id);
      stmt.run(...values);
      
      return this.getPortById(id);
    } catch (error) {
      logger.error(`Failed to update port ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get port by ID
   */
  async getPortById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM ports WHERE id = ?');
      const port = stmt.get(id);
      
      if (!port) return null;
      
      return {
        ...port,
        labels: port.labels ? JSON.parse(port.labels) : {}
      };
    } catch (error) {
      logger.error(`Failed to get port ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get port ID by host, port, and protocol
   */
  getPortId(host, port, protocol) {
    try {
      const stmt = this.db.prepare('SELECT id FROM ports WHERE host = ? AND port = ? AND protocol = ?');
      const result = stmt.get(host, port, protocol);
      return result ? result.id : null;
    } catch (error) {
      logger.error(`Failed to get port ID for ${host}:${port}/${protocol}:`, error);
      throw error;
    }
  }

  /**
   * Mark ports as closed that weren't seen in the latest scan
   */
  async markMissingPortsAsClosed(host, seenPorts, scanId) {
    try {
      // Get currently open ports for this host
      const stmt = this.db.prepare(`
        SELECT id, port, protocol FROM ports 
        WHERE host = ? AND status = 'open'
      `);
      
      const existingPorts = stmt.all(host);
      const seenPortSet = new Set(seenPorts.map(p => `${p.port}:${p.protocol}`));
      
      const portsToClose = existingPorts.filter(p => 
        !seenPortSet.has(`${p.port}:${p.protocol}`)
      );
      
      if (portsToClose.length > 0) {
        const updateStmt = this.db.prepare(`
          UPDATE ports 
          SET status = 'closed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        
        const historyStmt = this.db.prepare(`
          INSERT INTO port_history (
            port_id, host, port, protocol, old_status, new_status, 
            change_type, scan_id
          ) VALUES (?, ?, ?, ?, 'open', 'closed', 'closed', ?)
        `);
        
        portsToClose.forEach(port => {
          updateStmt.run(port.id);
          historyStmt.run(port.id, host, port.port, port.protocol, scanId);
        });
        
        logger.info(`Marked ${portsToClose.length} ports as closed for host ${host}`);
      }
      
      return portsToClose.length;
    } catch (error) {
      logger.error(`Failed to mark missing ports as closed for host ${host}:`, error);
      throw error;
    }
  }

  /**
   * Delete a port
   */
  async deletePort(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM ports WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete port ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get port statistics
   */
  async getPortStatistics() {
    try {
      const stats = {};
      
      // Total ports by status
      const statusStmt = this.db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM ports 
        GROUP BY status
      `);
      stats.byStatus = statusStmt.all().reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {});
      
      // Total ports by protocol
      const protocolStmt = this.db.prepare(`
        SELECT protocol, COUNT(*) as count 
        FROM ports 
        GROUP BY protocol
      `);
      stats.byProtocol = protocolStmt.all().reduce((acc, row) => {
        acc[row.protocol] = row.count;
        return acc;
      }, {});
      
      // Top services
      const servicesStmt = this.db.prepare(`
        SELECT service_name, COUNT(*) as count 
        FROM ports 
        WHERE service_name IS NOT NULL 
        GROUP BY service_name 
        ORDER BY count DESC 
        LIMIT 10
      `);
      stats.topServices = servicesStmt.all();
      
      // Hosts with most ports
      const hostsStmt = this.db.prepare(`
        SELECT host, COUNT(*) as port_count 
        FROM ports 
        GROUP BY host 
        ORDER BY port_count DESC 
        LIMIT 10
      `);
      stats.topHosts = hostsStmt.all();
      
      // Recent activity
      const activityStmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM port_history 
        WHERE detected_at > datetime('now', '-24 hours')
      `);
      stats.recentActivity = activityStmt.get().count;
      
      return stats;
    } catch (error) {
      logger.error('Failed to get port statistics:', error);
      throw error;
    }
  }

  /**
   * Get port count with optional filters
   */
  async getPortCount(filters = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM ports WHERE 1=1';
      const params = [];
      
      if (filters.host) {
        query += ' AND host = ?';
        params.push(filters.host);
      }
      
      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }
      
      if (filters.protocol) {
        query += ' AND protocol = ?';
        params.push(filters.protocol);
      }
      
      const stmt = this.db.prepare(query);
      return stmt.get(...params).count;
    } catch (error) {
      logger.error('Failed to get port count:', error);
      throw error;
    }
  }
}

module.exports = PortRepository;