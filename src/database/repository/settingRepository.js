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
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // Check if table exists
      const tableExists = await this.tableExists();

      if (!tableExists) {
        logger.info(`Creating ${this.tableName} table...`);

        await this.db.run(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);

        // Create index for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_settings_key ON ${this.tableName}(key)`);

        logger.info(`Created ${this.tableName} table and indexes`);
      } else {
        logger.debug(`${this.tableName} table already exists`);
      }
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} table: ${error.message}`);
      // Don't throw the error, just log it - allow application to continue
    }
  }

  /**
   * Check if the table exists
   * @returns {Promise<boolean>} Whether the table exists
   */
  async tableExists() {
    try {
      const result = await this.db.get(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `, [this.tableName]);

      const exists = !!result;
      logger.debug(`Table ${this.tableName} exists check: ${exists}`);
      return exists;
    } catch (error) {
      logger.error(`Failed to check if table exists: ${error.message}`);
      // If we can't check, assume it doesn't exist to trigger creation
      return false;
    }
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