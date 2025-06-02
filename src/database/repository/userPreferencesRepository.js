/**
 * User Preferences Repository
 * Handles database operations for user preferences
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class UserPreferencesRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'user_preferences';
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // The table creation is handled by migrations
      // This is just a placeholder for consistency
      logger.debug(`UserPreferencesRepository initialized`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} repository: ${error.message}`);
    }
  }

  /**
   * Get all preferences for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Key-value pairs of preferences
   */
  async getUserPreferences(userId) {
    try {
      const sql = `
        SELECT preference_key, preference_value
        FROM ${this.tableName}
        WHERE user_id = ?
      `;
      
      const rows = await this.db.all(sql, [userId]);
      
      // Convert array of rows to object
      const preferences = {};
      rows.forEach(row => {
        try {
          // Try to parse JSON values
          preferences[row.preference_key] = JSON.parse(row.preference_value);
        } catch {
          // If not JSON, use as string
          preferences[row.preference_key] = row.preference_value;
        }
      });
      
      return preferences;
    } catch (error) {
      logger.error(`Failed to get user preferences: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific preference for a user
   * @param {number} userId - User ID
   * @param {string} key - Preference key
   * @returns {Promise<any>} - Preference value or null
   */
  async getUserPreference(userId, key) {
    try {
      const sql = `
        SELECT preference_value
        FROM ${this.tableName}
        WHERE user_id = ? AND preference_key = ?
      `;
      
      const row = await this.db.get(sql, [userId, key]);
      
      if (!row) {
        return null;
      }
      
      try {
        // Try to parse JSON value
        return JSON.parse(row.preference_value);
      } catch {
        // If not JSON, return as string
        return row.preference_value;
      }
    } catch (error) {
      logger.error(`Failed to get user preference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set a preference for a user
   * @param {number} userId - User ID
   * @param {string} key - Preference key
   * @param {any} value - Preference value (will be JSON stringified if object)
   * @returns {Promise<boolean>} - Success status
   */
  async setUserPreference(userId, key, value) {
    try {
      // Convert value to string (JSON if object)
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      
      const sql = `
        INSERT INTO ${this.tableName} (user_id, preference_key, preference_value, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, preference_key) 
        DO UPDATE SET preference_value = excluded.preference_value, updated_at = CURRENT_TIMESTAMP
      `;
      
      const result = await this.db.run(sql, [userId, key, stringValue]);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to set user preference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a preference for a user
   * @param {number} userId - User ID
   * @param {string} key - Preference key
   * @returns {Promise<boolean>} - Success status
   */
  async deleteUserPreference(userId, key) {
    try {
      const sql = `
        DELETE FROM ${this.tableName}
        WHERE user_id = ? AND preference_key = ?
      `;
      
      const result = await this.db.run(sql, [userId, key]);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete user preference: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete all preferences for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} - Number of deleted preferences
   */
  async deleteAllUserPreferences(userId) {
    try {
      const sql = `
        DELETE FROM ${this.tableName}
        WHERE user_id = ?
      `;
      
      const result = await this.db.run(sql, [userId]);
      return result.changes;
    } catch (error) {
      logger.error(`Failed to delete all user preferences: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get dashboard layout for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} - Dashboard layout or null
   */
  async getDashboardLayout(userId) {
    return this.getUserPreference(userId, 'dashboard_layout');
  }

  /**
   * Set dashboard layout for a user
   * @param {number} userId - User ID
   * @param {Object} layout - Dashboard layout
   * @returns {Promise<boolean>} - Success status
   */
  async setDashboardLayout(userId, layout) {
    return this.setUserPreference(userId, 'dashboard_layout', layout);
  }
}

module.exports = UserPreferencesRepository;