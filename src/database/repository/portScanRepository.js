const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

/**
 * Repository for port scan operations
 */
class PortScanRepository extends BaseRepository {
  constructor(database) {
    super(database);
    this.tableName = 'port_scans';
  }

  /**
   * Create a new port scan record
   */
  async createScan(scanData) {
    try {
      const {
        host,
        scan_type = 'local',
        created_by,
        metadata = {}
      } = scanData;

      const stmt = this.db.prepare(`
        INSERT INTO port_scans (host, scan_type, created_by, metadata)
        VALUES (?, ?, ?, ?)
      `);

      const result = stmt.run(
        host,
        scan_type,
        created_by,
        JSON.stringify(metadata)
      );

      return this.getScanById(result.lastID);
    } catch (error) {
      logger.error('Failed to create port scan:', error);
      throw error;
    }
  }

  /**
   * Update scan progress and results
   */
  async updateScan(id, updates) {
    try {
      const allowedFields = [
        'ports_discovered', 'ports_changed', 'scan_duration',
        'status', 'error_message', 'metadata'
      ];

      const fields = [];
      const values = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(key === 'metadata' ? JSON.stringify(value) : value);
        }
      });

      if (fields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const stmt = this.db.prepare(`
        UPDATE port_scans 
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      values.push(id);
      stmt.run(...values);

      return this.getScanById(id);
    } catch (error) {
      logger.error(`Failed to update port scan ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mark scan as completed
   */
  async completeScan(id, results) {
    try {
      const {
        ports_discovered = 0,
        ports_changed = 0,
        scan_duration,
        error_message
      } = results;

      const status = error_message ? 'failed' : 'completed';

      const stmt = this.db.prepare(`
        UPDATE port_scans 
        SET 
          status = ?,
          ports_discovered = ?,
          ports_changed = ?,
          scan_duration = ?,
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(status, ports_discovered, ports_changed, scan_duration, error_message, id);
      return this.getScanById(id);
    } catch (error) {
      logger.error(`Failed to complete port scan ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get scan by ID
   */
  async getScanById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM port_scans WHERE id = ?');
      const scan = stmt.get(id);

      if (!scan) return null;

      return {
        ...scan,
        metadata: scan.metadata ? JSON.parse(scan.metadata) : {}
      };
    } catch (error) {
      logger.error(`Failed to get port scan ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get recent scans with optional filtering
   */
  async getRecentScans(filters = {}) {
    try {
      let query = `
        SELECT 
          ps.*,
          COUNT(ph.id) as changes_detected
        FROM port_scans ps
        LEFT JOIN port_history ph ON ph.scan_id = ps.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.host) {
        query += ' AND ps.host = ?';
        params.push(filters.host);
      }

      if (filters.scan_type) {
        query += ' AND ps.scan_type = ?';
        params.push(filters.scan_type);
      }

      if (filters.status) {
        query += ' AND ps.status = ?';
        params.push(filters.status);
      }

      if (filters.created_by) {
        query += ' AND ps.created_by = ?';
        params.push(filters.created_by);
      }

      query += ' GROUP BY ps.id ORDER BY ps.started_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      }

      const stmt = this.db.prepare(query);
      const scans = stmt.all(...params);

      return scans.map(scan => ({
        ...scan,
        metadata: scan.metadata ? JSON.parse(scan.metadata) : {},
        changes_detected: scan.changes_detected || 0
      }));
    } catch (error) {
      logger.error('Failed to get recent scans:', error);
      throw error;
    }
  }

  /**
   * Get scan statistics
   */
  async getScanStatistics() {
    try {
      const stats = {};

      // Total scans
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM port_scans');
      stats.total = totalStmt.get().count;

      // Scans by status
      const statusStmt = this.db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM port_scans 
        GROUP BY status
      `);
      stats.byStatus = statusStmt.all().reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {});

      // Scans by type
      const typeStmt = this.db.prepare(`
        SELECT scan_type, COUNT(*) as count 
        FROM port_scans 
        GROUP BY scan_type
      `);
      stats.byType = typeStmt.all().reduce((acc, row) => {
        acc[row.scan_type] = row.count;
        return acc;
      }, {});

      // Recent activity (last 24 hours)
      const recentStmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM port_scans 
        WHERE started_at > datetime('now', '-24 hours')
      `);
      stats.recentScans = recentStmt.get().count;

      // Average scan duration
      const durationStmt = this.db.prepare(`
        SELECT AVG(scan_duration) as avg_duration 
        FROM port_scans 
        WHERE scan_duration IS NOT NULL AND status = 'completed'
      `);
      const avgResult = durationStmt.get();
      stats.averageDuration = avgResult.avg_duration || 0;

      return stats;
    } catch (error) {
      logger.error('Failed to get scan statistics:', error);
      throw error;
    }
  }

  /**
   * Get active scans
   */
  async getActiveScans() {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM port_scans 
        WHERE status = 'running' 
        ORDER BY started_at DESC
      `);

      const scans = stmt.all();
      return scans.map(scan => ({
        ...scan,
        metadata: scan.metadata ? JSON.parse(scan.metadata) : {}
      }));
    } catch (error) {
      logger.error('Failed to get active scans:', error);
      throw error;
    }
  }

  /**
   * Clean up old scan records
   */
  async cleanupOldScans(daysToKeep = 30) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM port_scans 
        WHERE started_at < datetime('now', '-${daysToKeep} days')
        AND status IN ('completed', 'failed')
      `);

      const result = stmt.run();
      logger.info(`Cleaned up ${result.changes} old port scan records`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old scans:', error);
      throw error;
    }
  }
}

module.exports = PortScanRepository;