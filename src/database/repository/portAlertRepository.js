const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

/**
 * Repository for port alert operations
 */
class PortAlertRepository extends BaseRepository {
  constructor(database) {
    super(database);
    this.tableName = 'port_alerts';
  }

  /**
   * Create a new port alert
   */
  async createAlert(alertData) {
    try {
      const {
        port_id,
        alert_type,
        severity = 'medium',
        title,
        description
      } = alertData;

      const stmt = this.db.prepare(`
        INSERT INTO port_alerts (port_id, alert_type, severity, title, description)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(port_id, alert_type, severity, title, description);
      return this.getAlertById(result.lastID);
    } catch (error) {
      logger.error('Failed to create port alert:', error);
      throw error;
    }
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          pa.*,
          p.host,
          p.port,
          p.protocol,
          p.service_name
        FROM port_alerts pa
        JOIN ports p ON p.id = pa.port_id
        WHERE pa.id = ?
      `);

      return stmt.get(id);
    } catch (error) {
      logger.error(`Failed to get port alert ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get alerts with optional filtering
   */
  async getAlerts(filters = {}) {
    try {
      let query = `
        SELECT 
          pa.*,
          p.host,
          p.port,
          p.protocol,
          p.service_name
        FROM port_alerts pa
        JOIN ports p ON p.id = pa.port_id
        WHERE 1=1
      `;

      const params = [];

      if (filters.port_id) {
        query += ' AND pa.port_id = ?';
        params.push(filters.port_id);
      }

      if (filters.alert_type) {
        query += ' AND pa.alert_type = ?';
        params.push(filters.alert_type);
      }

      if (filters.severity) {
        query += ' AND pa.severity = ?';
        params.push(filters.severity);
      }

      if (filters.acknowledged !== undefined) {
        query += ' AND pa.acknowledged = ?';
        params.push(filters.acknowledged);
      }

      if (filters.host) {
        query += ' AND p.host = ?';
        params.push(filters.host);
      }

      query += ' ORDER BY pa.created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));

        if (filters.offset) {
          query += ' OFFSET ?';
          params.push(parseInt(filters.offset));
        }
      }

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      logger.error('Failed to get port alerts:', error);
      throw error;
    }
  }

  /**
   * Get unacknowledged alerts
   */
  async getUnacknowledgedAlerts() {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          pa.*,
          p.host,
          p.port,
          p.protocol,
          p.service_name
        FROM port_alerts pa
        JOIN ports p ON p.id = pa.port_id
        WHERE pa.acknowledged = 0
        ORDER BY pa.severity DESC, pa.created_at DESC
      `);

      return stmt.all();
    } catch (error) {
      logger.error('Failed to get unacknowledged alerts:', error);
      throw error;
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id, acknowledgedBy) {
    try {
      const stmt = this.db.prepare(`
        UPDATE port_alerts 
        SET 
          acknowledged = 1,
          acknowledged_by = ?,
          acknowledged_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(acknowledgedBy, id);
      return this.getAlertById(id);
    } catch (error) {
      logger.error(`Failed to acknowledge alert ${id}:`, error);
      throw error;
    }
  }

  /**
   * Acknowledge multiple alerts
   */
  async acknowledgeAlerts(alertIds, acknowledgedBy) {
    try {
      const placeholders = alertIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        UPDATE port_alerts 
        SET 
          acknowledged = 1,
          acknowledged_by = ?,
          acknowledged_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `);

      stmt.run(acknowledgedBy, ...alertIds);
      return alertIds.length;
    } catch (error) {
      logger.error('Failed to acknowledge multiple alerts:', error);
      throw error;
    }
  }

  /**
   * Delete an alert
   */
  async deleteAlert(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM port_alerts WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete alert ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics() {
    try {
      const stats = {};

      // Total alerts
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM port_alerts');
      stats.total = totalStmt.get().count;

      // Unacknowledged alerts
      const unackStmt = this.db.prepare('SELECT COUNT(*) as count FROM port_alerts WHERE acknowledged = 0');
      stats.unacknowledged = unackStmt.get().count;

      // Alerts by severity
      const severityStmt = this.db.prepare(`
        SELECT severity, COUNT(*) as count 
        FROM port_alerts 
        WHERE acknowledged = 0
        GROUP BY severity
      `);
      stats.bySeverity = severityStmt.all().reduce((acc, row) => {
        acc[row.severity] = row.count;
        return acc;
      }, {});

      // Alerts by type
      const typeStmt = this.db.prepare(`
        SELECT alert_type, COUNT(*) as count 
        FROM port_alerts 
        WHERE acknowledged = 0
        GROUP BY alert_type
      `);
      stats.byType = typeStmt.all().reduce((acc, row) => {
        acc[row.alert_type] = row.count;
        return acc;
      }, {});

      // Recent alerts (last 24 hours)
      const recentStmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM port_alerts 
        WHERE created_at > datetime('now', '-24 hours')
      `);
      stats.recent = recentStmt.get().count;

      return stats;
    } catch (error) {
      logger.error('Failed to get alert statistics:', error);
      throw error;
    }
  }

  /**
   * Get alert count with optional filters
   */
  async getAlertCount(filters = {}) {
    try {
      let query = `
        SELECT COUNT(*) as count 
        FROM port_alerts pa
        JOIN ports p ON p.id = pa.port_id
        WHERE 1=1
      `;

      const params = [];

      if (filters.acknowledged !== undefined) {
        query += ' AND pa.acknowledged = ?';
        params.push(filters.acknowledged);
      }

      if (filters.severity) {
        query += ' AND pa.severity = ?';
        params.push(filters.severity);
      }

      if (filters.host) {
        query += ' AND p.host = ?';
        params.push(filters.host);
      }

      const stmt = this.db.prepare(query);
      return stmt.get(...params).count;
    } catch (error) {
      logger.error('Failed to get alert count:', error);
      throw error;
    }
  }

  /**
   * Clean up old acknowledged alerts
   */
  async cleanupOldAlerts(daysToKeep = 90) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM port_alerts 
        WHERE acknowledged = 1 
        AND acknowledged_at < datetime('now', '-${daysToKeep} days')
      `);

      const result = stmt.run();
      logger.info(`Cleaned up ${result.changes} old acknowledged alerts`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old alerts:', error);
      throw error;
    }
  }
}

module.exports = PortAlertRepository;