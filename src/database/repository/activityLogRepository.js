/**
 * Activity Log Repository
 * Handles all activity log persistence operations
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class ActivityLogRepository extends BaseRepository {
  constructor(db) {
    super(db, 'activity_log');
  }

  /**
   * Log an activity event
   * @param {Object} activity - Activity details
   * @returns {Promise<Object>} - Created activity record
   */
  async logActivity(activity) {
    try {
      const { type, recordType, hostname, details, source, provider, record_id, metadata } = activity;
      const timestamp = activity.timestamp || new Date().toISOString();

      const result = await this.db.run(`
        INSERT INTO activity_log 
        (type, recordType, hostname, timestamp, details, source, provider, record_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        type,
        recordType,
        hostname,
        timestamp,
        details || '',
        source,
        provider || null,
        record_id || null,
        metadata ? JSON.stringify(metadata) : null
      ]);

      return {
        id: result.lastID,
        type,
        recordType,
        hostname,
        timestamp,
        details,
        source,
        provider,
        record_id,
        metadata
      };
    } catch (error) {
      logger.error(`Failed to log activity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent activities
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - Array of activity records
   */
  async getRecentActivities(limit = 20) {
    try {
      const activities = await this.db.all(`
        SELECT 
          id,
          type,
          recordType,
          hostname,
          timestamp,
          details,
          source,
          provider,
          record_id,
          metadata
        FROM activity_log
        ORDER BY timestamp DESC
        LIMIT ?
      `, [limit]);

      // Parse metadata for each activity
      return activities.map(activity => ({
        ...activity,
        metadata: activity.metadata ? JSON.parse(activity.metadata) : null
      }));
    } catch (error) {
      logger.error(`Failed to get recent activities: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get activities for a specific hostname
   * @param {string} hostname - The hostname to filter by
   * @param {number} limit - Maximum number of activities to return
   * @returns {Promise<Array>} - Array of activity records
   */
  async getActivitiesByHostname(hostname, limit = 50) {
    try {
      const activities = await this.db.all(`
        SELECT 
          id,
          type,
          recordType,
          hostname,
          timestamp,
          details,
          source,
          provider,
          record_id,
          metadata
        FROM activity_log
        WHERE hostname = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, [hostname, limit]);

      // Parse metadata for each activity
      return activities.map(activity => ({
        ...activity,
        metadata: activity.metadata ? JSON.parse(activity.metadata) : null
      }));
    } catch (error) {
      logger.error(`Failed to get activities by hostname: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete old activities
   * @param {number} daysToKeep - Number of days to keep activities
   * @returns {Promise<number>} - Number of deleted records
   */
  async deleteOldActivities(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const result = await this.db.run(`
        DELETE FROM activity_log
        WHERE timestamp < ?
      `, [cutoffDate.toISOString()]);

      return result.changes;
    } catch (error) {
      logger.error(`Failed to delete old activities: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ActivityLogRepository;