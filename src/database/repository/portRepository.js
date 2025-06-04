const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');
const protocolHandler = require('../../utils/protocolHandler');

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
      
      return this.getPortById(result.lastID || this.getPortId(host, port, protocol));
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

  /**
   * Table-specific validation and consistency checks
   * @private
   */
  async _checkTableSpecific(report, fix = false) {
    // Valid protocol values
    const validProtocols = ['tcp', 'udp', 'both'];
    
    // Valid status values
    const validStatuses = ['open', 'closed', 'filtered', 'unknown', 'listening'];

    try {
      // Check 1: Port numbers are between 1 and 65535
      const invalidPorts = await this.db.all(`
        SELECT id, host, port, protocol 
        FROM ${this.tableName} 
        WHERE port < 1 OR port > 65535
      `);
      
      if (invalidPorts.length > 0) {
        report.issues.push(`Found ${invalidPorts.length} ports with invalid port numbers (must be 1-65535)`);
        
        if (fix) {
          // Delete ports with invalid port numbers
          const result = await this.db.run(`
            DELETE FROM ${this.tableName} 
            WHERE port < 1 OR port > 65535
          `);
          report.fixes.push(`Deleted ${result.changes} ports with invalid port numbers`);
        }
      }

      // Check 2: Protocol values are valid
      const invalidProtocols = await this.db.all(`
        SELECT id, host, port, protocol 
        FROM ${this.tableName} 
        WHERE protocol NOT IN (${validProtocols.map(() => '?').join(', ')})
      `, validProtocols);
      
      if (invalidProtocols.length > 0) {
        report.issues.push(`Found ${invalidProtocols.length} ports with invalid protocol values`);
        
        if (fix) {
          // Update invalid protocols to 'tcp' as default
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET protocol = 'tcp', updated_at = CURRENT_TIMESTAMP
            WHERE protocol NOT IN (${validProtocols.map(() => '?').join(', ')})
          `, validProtocols);
          report.fixes.push(`Fixed ${result.changes} ports with invalid protocol values (set to 'tcp')`);
        }
      }

      // Check 3: Status values are valid
      const invalidStatuses = await this.db.all(`
        SELECT id, host, port, protocol, status 
        FROM ${this.tableName} 
        WHERE status NOT IN (${validStatuses.map(() => '?').join(', ')})
      `, validStatuses);
      
      if (invalidStatuses.length > 0) {
        report.issues.push(`Found ${invalidStatuses.length} ports with invalid status values`);
        
        if (fix) {
          // Update invalid statuses to 'unknown' as default
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET status = 'unknown', updated_at = CURRENT_TIMESTAMP
            WHERE status NOT IN (${validStatuses.map(() => '?').join(', ')})
          `, validStatuses);
          report.fixes.push(`Fixed ${result.changes} ports with invalid status values (set to 'unknown')`);
        }
      }

      // Check 4: Server references exist (if server_id is used)
      const orphanedServerRefs = await this.db.all(`
        SELECT p.id, p.host, p.port, p.protocol, p.server_id
        FROM ${this.tableName} p
        LEFT JOIN servers s ON p.server_id = s.id
        WHERE p.server_id IS NOT NULL AND s.id IS NULL
      `);
      
      if (orphanedServerRefs.length > 0) {
        report.issues.push(`Found ${orphanedServerRefs.length} ports with non-existent server references`);
        
        if (fix) {
          // Clear invalid server references
          const result = await this.db.run(`
            UPDATE ${this.tableName} 
            SET server_id = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE server_id IS NOT NULL 
            AND server_id NOT IN (SELECT id FROM servers)
          `);
          report.fixes.push(`Cleared ${result.changes} invalid server references`);
        }
      }

      // Check 5: Port uniqueness constraints (host + port + protocol)
      const duplicatePorts = await this.db.all(`
        SELECT host, port, protocol, COUNT(*) as count 
        FROM ${this.tableName} 
        GROUP BY host, port, protocol 
        HAVING COUNT(*) > 1
      `);
      
      if (duplicatePorts.length > 0) {
        report.issues.push(`Found ${duplicatePorts.length} sets of duplicate port entries (host + port + protocol)`);
        
        if (fix) {
          // Keep only the newest record for each duplicate set
          for (const dup of duplicatePorts) {
            const result = await this.db.run(`
              DELETE FROM ${this.tableName} 
              WHERE host = ? AND port = ? AND protocol = ?
              AND id NOT IN (
                SELECT id FROM (
                  SELECT id FROM ${this.tableName} 
                  WHERE host = ? AND port = ? AND protocol = ?
                  ORDER BY updated_at DESC, created_at DESC 
                  LIMIT 1
                ) latest
              )
            `, [dup.host, dup.port, dup.protocol, dup.host, dup.port, dup.protocol]);
            
            if (result.changes > 0) {
              report.fixes.push(`Removed ${result.changes} duplicate entries for ${dup.host}:${dup.port}/${dup.protocol}`);
            }
          }
        }
      }

      // Check 6: Timestamp consistency
      const timestampIssues = await this.db.all(`
        SELECT id, host, port, protocol, first_seen, last_seen, created_at, updated_at
        FROM ${this.tableName} 
        WHERE 
          (last_seen < first_seen) OR
          (updated_at < created_at) OR
          (first_seen < created_at)
      `);
      
      if (timestampIssues.length > 0) {
        report.issues.push(`Found ${timestampIssues.length} ports with inconsistent timestamps`);
        
        if (fix) {
          // Fix timestamp inconsistencies
          for (const issue of timestampIssues) {
            // Ensure logical timestamp order: created_at <= first_seen <= last_seen <= updated_at
            const createdAt = issue.created_at;
            const firstSeen = issue.first_seen < createdAt ? createdAt : issue.first_seen;
            const lastSeen = issue.last_seen < firstSeen ? firstSeen : issue.last_seen;
            const updatedAt = issue.updated_at < lastSeen ? lastSeen : issue.updated_at;
            
            const result = await this.db.run(`
              UPDATE ${this.tableName} 
              SET first_seen = ?, last_seen = ?, updated_at = ?
              WHERE id = ?
            `, [firstSeen, lastSeen, updatedAt, issue.id]);
            
            if (result.changes > 0) {
              report.fixes.push(`Fixed timestamp consistency for port ${issue.host}:${issue.port}/${issue.protocol}`);
            }
          }
        }
      }

      // Check 7: JSON field validation for labels
      const invalidJsonLabels = await this.db.all(`
        SELECT id, host, port, protocol, labels 
        FROM ${this.tableName} 
        WHERE labels IS NOT NULL AND labels != ''
      `);
      
      let jsonParseErrors = 0;
      for (const record of invalidJsonLabels) {
        try {
          if (record.labels) {
            JSON.parse(record.labels);
          }
        } catch (error) {
          jsonParseErrors++;
          if (fix) {
            // Reset invalid JSON to empty object
            await this.db.run(`
              UPDATE ${this.tableName} 
              SET labels = '{}', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [record.id]);
          }
        }
      }
      
      if (jsonParseErrors > 0) {
        report.issues.push(`Found ${jsonParseErrors} ports with invalid JSON in labels field`);
        
        if (fix) {
          report.fixes.push(`Fixed ${jsonParseErrors} ports with invalid JSON labels (reset to empty object)`);
        }
      }

      // Summary check
      report.checks.push({
        name: 'Port-Specific Validation',
        passed: report.issues.length === 0,
        issues: report.issues.length
      });

    } catch (error) {
      logger.error('Error during port-specific consistency checks:', error);
      report.issues.push(`Error during port validation: ${error.message}`);
    }
  }

  /**
   * Enhanced entity validation for ports
   * @param {Object} data - Entity data
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} - Validated data
   */
  validateEntity(data, isUpdate = false) {
    // Call parent validation first
    const validated = super.validateEntity(data, isUpdate);

    // Port-specific validation rules
    if (validated.port !== undefined) {
      const port = parseInt(validated.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Port number must be between 1 and 65535');
      }
      validated.port = port;
    }

    if (validated.protocol !== undefined) {
      const validProtocols = ['tcp', 'udp', 'both'];
      if (!validProtocols.includes(validated.protocol)) {
        throw new Error(`Protocol must be one of: ${validProtocols.join(', ')}`);
      }
    }

    if (validated.status !== undefined) {
      const validStatuses = ['open', 'closed', 'filtered', 'unknown', 'listening'];
      if (!validStatuses.includes(validated.status)) {
        throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    if (validated.host !== undefined) {
      if (!validated.host || typeof validated.host !== 'string' || validated.host.trim() === '') {
        throw new Error('Host is required and must be a non-empty string');
      }
      validated.host = validated.host.trim();
    }

    // Validate JSON fields
    if (validated.labels !== undefined) {
      if (typeof validated.labels === 'string') {
        try {
          JSON.parse(validated.labels);
        } catch (error) {
          throw new Error('Labels must be valid JSON');
        }
      } else if (validated.labels !== null && typeof validated.labels === 'object') {
        // Convert object to JSON string
        validated.labels = JSON.stringify(validated.labels);
      }
    }

    // Validate service name if provided
    if (validated.service_name !== undefined && validated.service_name !== null) {
      if (typeof validated.service_name !== 'string') {
        throw new Error('Service name must be a string');
      }
      validated.service_name = validated.service_name.trim() || null;
    }

    // Validate service version if provided
    if (validated.service_version !== undefined && validated.service_version !== null) {
      if (typeof validated.service_version !== 'string') {
        throw new Error('Service version must be a string');
      }
      validated.service_version = validated.service_version.trim() || null;
    }

    // Validate description if provided
    if (validated.description !== undefined && validated.description !== null) {
      if (typeof validated.description !== 'string') {
        throw new Error('Description must be a string');
      }
      validated.description = validated.description.trim() || null;
    }

    // Validate container fields if provided
    if (validated.container_id !== undefined && validated.container_id !== null) {
      if (typeof validated.container_id !== 'string') {
        throw new Error('Container ID must be a string');
      }
      validated.container_id = validated.container_id.trim() || null;
    }

    if (validated.container_name !== undefined && validated.container_name !== null) {
      if (typeof validated.container_name !== 'string') {
        throw new Error('Container name must be a string');
      }
      validated.container_name = validated.container_name.trim() || null;
    }

    return validated;
  }
}

module.exports = PortRepository;