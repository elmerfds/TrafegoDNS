/**
 * Audit Log Repository
 * Handles database operations for audit logs
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class AuditLogRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'audit_logs';
  }

  /**
   * Log a state change
   * @param {string} action - Action that caused the change
   * @param {string} path - State path that changed
   * @param {*} oldValue - Old value
   * @param {*} newValue - New value
   * @param {string} userId - User ID that made the change
   * @param {string} source - Source of the change (api, cli, etc.)
   * @returns {Promise<Object>} - Created audit log
   */
  async logStateChange(action, path, oldValue, newValue, userId = null, source = null) {
    // Convert values to strings if they're objects
    const oldValueStr = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue);
    const newValueStr = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);
    
    // Create the audit log
    return this.create({
      action,
      path,
      old_value: oldValueStr,
      new_value: newValueStr,
      user_id: userId,
      source,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get audit logs for a specific path
   * @param {string} path - State path
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Audit logs
   */
  async getByPath(path, options = {}) {
    const { limit = 100, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE path = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    
    return this.db.all(sql, [path, limit, offset]);
  }

  /**
   * Get audit logs for a specific user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Audit logs
   */
  async getByUser(userId, options = {}) {
    const { limit = 100, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    
    return this.db.all(sql, [userId, limit, offset]);
  }

  /**
   * Get audit logs for a specific action
   * @param {string} action - Action
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Audit logs
   */
  async getByAction(action, options = {}) {
    const { limit = 100, offset = 0 } = options;
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE action = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    
    return this.db.all(sql, [action, limit, offset]);
  }

  /**
   * Search audit logs
   * @param {Object} filters - Search filters
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Audit logs
   */
  async search(filters = {}, options = {}) {
    const { limit = 100, offset = 0 } = options;
    
    // Build where clause and params
    const whereConditions = [];
    const params = [];
    
    if (filters.action) {
      whereConditions.push('action = ?');
      params.push(filters.action);
    }
    
    if (filters.path) {
      whereConditions.push('path = ?');
      params.push(filters.path);
    }
    
    if (filters.userId) {
      whereConditions.push('user_id = ?');
      params.push(filters.userId);
    }
    
    if (filters.source) {
      whereConditions.push('source = ?');
      params.push(filters.source);
    }
    
    if (filters.startDate) {
      whereConditions.push('timestamp >= ?');
      params.push(new Date(filters.startDate).toISOString());
    }
    
    if (filters.endDate) {
      whereConditions.push('timestamp <= ?');
      params.push(new Date(filters.endDate).toISOString());
    }
    
    // Build the query
    let sql = `SELECT * FROM ${this.tableName}`;
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    return this.db.all(sql, params);
  }

  /**
   * Clean up old audit logs
   * @param {number} daysToKeep - Number of days to keep logs
   * @returns {Promise<number>} - Number of deleted logs
   */
  async cleanupOldLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE timestamp < ?
    `;
    
    const result = await this.db.run(sql, [cutoffDate.toISOString()]);
    
    if (result.changes > 0) {
      logger.info(`Cleaned up ${result.changes} audit logs older than ${daysToKeep} days`);
    }
    
    return result.changes;
  }
}

module.exports = AuditLogRepository;