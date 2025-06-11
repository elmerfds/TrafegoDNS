/**
 * Server Repository
 * Handles custom server management in the database
 */
const BaseRepository = require('./baseRepository');
const logger = require('../../utils/logger');

class ServerRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'servers';
  }

  /**
   * Initialize the repository
   */
  async initialize() {
    try {
      // Create the servers table if it doesn't exist
      await this._createTable();
      logger.debug('ServerRepository initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize ServerRepository: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create the servers table
   * @private
   */
  async _createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL,
        description TEXT,
        isHost BOOLEAN DEFAULT 0,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedBy TEXT,
        updatedAt TEXT NOT NULL
      )
    `;
    
    await this.db.run(sql);
    
    // Create indexes for better performance
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_servers_name ON ${this.tableName}(name)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_servers_ip ON ${this.tableName}(ip)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_servers_isHost ON ${this.tableName}(isHost)`);
    logger.debug('Servers table and indexes created/verified');
  }

  /**
   * Find all servers excluding the host server
   * @returns {Promise<Array>}
   */
  async findAll() {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE isHost = 0
      ORDER BY createdAt DESC
    `;
    
    try {
      const servers = await this.db.all(sql);
      return servers || [];
    } catch (error) {
      logger.error(`Failed to find servers: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a new server
   * @param {Object} data - Server data
   * @returns {Promise<Object>}
   */
  async create(data) {
    try {
      // Generate a unique ID if not provided
      if (!data.id) {
        data.id = this._generateId();
      }

      // Ensure all values are properly typed for SQLite
      const serverData = {
        id: data.id,
        name: String(data.name || ''),
        ip: String(data.ip || ''),
        description: data.description ? String(data.description) : null,
        isHost: data.isHost ? 1 : 0,
        createdBy: data.createdBy ? String(data.createdBy) : null,
        createdAt: String(data.createdAt || new Date().toISOString()),
        updatedAt: String(data.updatedAt || new Date().toISOString())
      };

      const result = await super.create(serverData);
      logger.info(`Created server: ${serverData.name} (${serverData.ip})`);
      return result;
    } catch (error) {
      logger.error(`Failed to create server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a server
   * @param {string} id - Server ID
   * @param {Object} data - Server data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    try {
      // Ensure all values are properly typed for SQLite
      const serverData = {};
      
      if (data.name !== undefined) serverData.name = String(data.name);
      if (data.ip !== undefined) serverData.ip = String(data.ip);
      if (data.description !== undefined) serverData.description = data.description ? String(data.description) : null;
      if (data.isHost !== undefined) serverData.isHost = data.isHost ? 1 : 0;
      if (data.createdBy !== undefined) serverData.createdBy = data.createdBy ? String(data.createdBy) : null;
      if (data.updatedBy !== undefined) serverData.updatedBy = data.updatedBy ? String(data.updatedBy) : null;
      
      // Always update the timestamp
      serverData.updatedAt = String(new Date().toISOString());

      const result = await super.update(id, serverData);
      logger.info(`Updated server: ${id}`);
      return result;
    } catch (error) {
      logger.error(`Failed to update server ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a server
   * @param {string} id - Server ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    try {
      const result = await super.delete(id);
      if (result) {
        logger.info(`Deleted server: ${id}`);
      }
      return result;
    } catch (error) {
      logger.error(`Failed to delete server ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find server by name
   * @param {string} name - Server name
   * @returns {Promise<Object|null>}
   */
  async findByName(name) {
    try {
      return await this.findOneByField('name', name);
    } catch (error) {
      logger.error(`Failed to find server by name ${name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find server by IP
   * @param {string} ip - Server IP
   * @returns {Promise<Object|null>}
   */
  async findByIp(ip) {
    try {
      return await this.findOneByField('ip', ip);
    } catch (error) {
      logger.error(`Failed to find server by IP ${ip}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if a server exists with the given name or IP
   * @param {string} name - Server name
   * @param {string} ip - Server IP
   * @param {string} excludeId - ID to exclude from check (for updates)
   * @returns {Promise<boolean>}
   */
  async existsByNameOrIp(name, ip, excludeId = null) {
    try {
      let sql = `
        SELECT COUNT(*) as count FROM ${this.tableName}
        WHERE (name = ? OR ip = ?)
      `;
      const params = [name, ip];

      if (excludeId) {
        sql += ' AND id != ?';
        params.push(excludeId);
      }

      const result = await this.db.get(sql, params);
      return result && result.count > 0;
    } catch (error) {
      logger.error(`Failed to check server existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Get server count
   * @returns {Promise<number>}
   */
  async getCount() {
    try {
      const result = await this.db.get(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE isHost = 0`);
      return result ? result.count : 0;
    } catch (error) {
      logger.error(`Failed to get server count: ${error.message}`);
      return 0;
    }
  }

  /**
   * Generate a unique ID
   * @private
   * @returns {string}
   */
  _generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
}

module.exports = ServerRepository;