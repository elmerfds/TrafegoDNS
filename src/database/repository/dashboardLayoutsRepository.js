/**
 * Dashboard Layouts Repository
 * Handles database operations for multiple dashboard layouts
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class DashboardLayoutsRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'dashboard_layouts';
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // The table creation is handled by migrations
      // This is just a placeholder for consistency
      logger.debug(`DashboardLayoutsRepository initialized`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} repository: ${error.message}`);
    }
  }

  /**
   * List all layouts for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} - Array of saved layouts
   */
  async listUserLayouts(userId) {
    try {
      const sql = `
        SELECT id, name, layout, is_active, created_at, updated_at
        FROM ${this.tableName}
        WHERE user_id = ?
        ORDER BY is_active DESC, updated_at DESC
      `;
      
      const rows = await this.db.all(sql, [userId]);
      
      // Parse JSON layout data
      return rows.map(row => ({
        ...row,
        layout: JSON.parse(row.layout),
        is_active: Boolean(row.is_active)
      }));
    } catch (error) {
      logger.error(`Failed to list user layouts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific layout by name
   * @param {number} userId - User ID
   * @param {string} name - Layout name
   * @returns {Promise<Object|null>} - Layout object or null
   */
  async getLayout(userId, name) {
    try {
      const sql = `
        SELECT id, name, layout, is_active, created_at, updated_at
        FROM ${this.tableName}
        WHERE user_id = ? AND name = ?
      `;
      
      const row = await this.db.get(sql, [userId, name]);
      
      if (!row) {
        return null;
      }
      
      return {
        ...row,
        layout: JSON.parse(row.layout),
        is_active: Boolean(row.is_active)
      };
    } catch (error) {
      logger.error(`Failed to get layout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save or update a layout
   * @param {number} userId - User ID
   * @param {string} name - Layout name
   * @param {Object} layout - Layout configuration
   * @returns {Promise<Object>} - Saved layout object
   */
  async saveLayout(userId, name, layout) {
    try {
      const layoutJson = JSON.stringify(layout);
      
      // Check if layout exists
      const existing = await this.getLayout(userId, name);
      
      if (existing) {
        // Update existing layout
        const sql = `
          UPDATE ${this.tableName}
          SET layout = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND name = ?
        `;
        
        await this.db.run(sql, [layoutJson, userId, name]);
        
        return this.getLayout(userId, name);
      } else {
        // Insert new layout
        const sql = `
          INSERT INTO ${this.tableName} (user_id, name, layout, is_active, created_at, updated_at)
          VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        
        await this.db.run(sql, [userId, name, layoutJson]);
        
        return this.getLayout(userId, name);
      }
    } catch (error) {
      logger.error(`Failed to save layout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a layout
   * @param {number} userId - User ID
   * @param {string} name - Layout name
   * @returns {Promise<boolean>} - Success status
   */
  async deleteLayout(userId, name) {
    try {
      const layout = await this.getLayout(userId, name);
      if (!layout) {
        return false;
      }
      
      // If deleting the active layout, unset it first (user will revert to default)
      if (layout.is_active) {
        await this.db.run('BEGIN TRANSACTION');
        
        try {
          // First, unset the active status
          const unsetSql = `
            UPDATE ${this.tableName}
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND name = ?
          `;
          
          await this.db.run(unsetSql, [userId, name]);
          
          // Then delete the layout
          const deleteSql = `
            DELETE FROM ${this.tableName}
            WHERE user_id = ? AND name = ?
          `;
          
          const result = await this.db.run(deleteSql, [userId, name]);
          
          await this.db.run('COMMIT');
          return result.changes > 0;
        } catch (error) {
          await this.db.run('ROLLBACK');
          throw error;
        }
      } else {
        // Layout is not active, just delete it
        const sql = `
          DELETE FROM ${this.tableName}
          WHERE user_id = ? AND name = ?
        `;
        
        const result = await this.db.run(sql, [userId, name]);
        return result.changes > 0;
      }
    } catch (error) {
      logger.error(`Failed to delete layout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set a layout as active
   * @param {number} userId - User ID
   * @param {string} name - Layout name
   * @returns {Promise<boolean>} - Success status
   */
  async setActiveLayout(userId, name) {
    try {
      // Start a transaction
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        // First, unset any existing active layout
        const unsetSql = `
          UPDATE ${this.tableName}
          SET is_active = 0, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND is_active = 1
        `;
        
        await this.db.run(unsetSql, [userId]);
        
        // Then set the new active layout
        const setSql = `
          UPDATE ${this.tableName}
          SET is_active = 1, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND name = ?
        `;
        
        const result = await this.db.run(setSql, [userId, name]);
        
        if (result.changes === 0) {
          throw new Error('Layout not found');
        }
        
        await this.db.run('COMMIT');
        return true;
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Failed to set active layout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the active layout for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} - Active layout or null
   */
  async getActiveLayout(userId) {
    try {
      const sql = `
        SELECT id, name, layout, is_active, created_at, updated_at
        FROM ${this.tableName}
        WHERE user_id = ? AND is_active = 1
      `;
      
      const row = await this.db.get(sql, [userId]);
      
      if (!row) {
        return null;
      }
      
      return {
        ...row,
        layout: JSON.parse(row.layout),
        is_active: Boolean(row.is_active)
      };
    } catch (error) {
      logger.error(`Failed to get active layout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete all layouts for a user (used when user is deleted)
   * @param {number} userId - User ID
   * @returns {Promise<number>} - Number of deleted layouts
   */
  async deleteAllUserLayouts(userId) {
    try {
      const sql = `
        DELETE FROM ${this.tableName}
        WHERE user_id = ?
      `;
      
      const result = await this.db.run(sql, [userId]);
      return result.changes;
    } catch (error) {
      logger.error(`Failed to delete all user layouts: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DashboardLayoutsRepository;