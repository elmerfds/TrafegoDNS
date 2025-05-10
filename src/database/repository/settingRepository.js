/**
 * Setting Repository
 * Handles database operations for application settings
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class SettingRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'settings';
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>} - Setting value or default
   */
  async get(key, defaultValue = null) {
    const setting = await this.findOneByField('key', key);
    
    if (!setting) {
      return defaultValue;
    }
    
    // Try to parse JSON value
    try {
      return JSON.parse(setting.value);
    } catch (error) {
      // Return as is if not JSON
      return setting.value;
    }
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<Object>} - Updated setting
   */
  async set(key, value) {
    const now = new Date().toISOString();
    
    // Convert value to JSON string if not a string
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Check if setting exists
    const existing = await this.findOneByField('key', key);
    
    if (existing) {
      // Update existing setting
      return this.update(existing.id, {
        value: stringValue,
        updated_at: now
      });
    } else {
      // Create new setting
      return this.create({
        key,
        value: stringValue,
        updated_at: now
      });
    }
  }

  /**
   * Delete a setting
   * @param {string} key - Setting key
   * @returns {Promise<boolean>} - Success status
   */
  async delete(key) {
    return this.deleteByField('key', key) > 0;
  }

  /**
   * Get all settings as key-value object
   * @returns {Promise<Object>} - Settings object
   */
  async getAll() {
    const settings = await this.findAll();
    
    // Convert to key-value object
    const result = {};
    
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value);
      } catch (error) {
        result[setting.key] = setting.value;
      }
    }
    
    return result;
  }

  /**
   * Set multiple settings at once
   * @param {Object} settings - Settings object
   * @returns {Promise<Object>} - Updated settings
   */
  async setMany(settings) {
    const now = new Date().toISOString();
    
    // Start a transaction
    await this.db.beginTransaction();
    
    try {
      // Process each setting
      for (const [key, value] of Object.entries(settings)) {
        // Convert value to JSON string if not a string
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        // Check if setting exists
        const existing = await this.findOneByField('key', key);
        
        if (existing) {
          // Update existing setting
          await this.update(existing.id, {
            value: stringValue,
            updated_at: now
          });
        } else {
          // Create new setting
          await this.create({
            key,
            value: stringValue,
            updated_at: now
          });
        }
      }
      
      // Commit the transaction
      await this.db.commit();
      
      // Return all settings
      return this.getAll();
    } catch (error) {
      // Rollback on error
      await this.db.rollback();
      logger.error(`Failed to set multiple settings: ${error.message}`);
      throw error;
    }
  }
}

module.exports = SettingRepository;