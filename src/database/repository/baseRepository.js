/**
 * Base Repository
 * Abstract base class for all repositories
 */
class BaseRepository {
  constructor(db) {
    if (new.target === BaseRepository) {
      throw new Error('BaseRepository is an abstract class and cannot be instantiated directly');
    }
    this.db = db;
    this.tableName = '';
  }

  /**
   * Find all entities
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Found entities
   */
  async findAll(options = {}) {
    const { where = {}, orderBy, limit, offset } = options;
    
    // Build WHERE clause
    const whereClause = this._buildWhereClause(where);
    const whereParams = this._extractWhereParams(where);
    
    // Build ORDER BY clause
    let orderByClause = '';
    if (orderBy) {
      orderByClause = `ORDER BY ${orderBy}`;
    }
    
    // Build LIMIT and OFFSET
    let limitClause = '';
    if (limit) {
      limitClause = `LIMIT ${parseInt(limit)}`;
      
      if (offset) {
        limitClause += ` OFFSET ${parseInt(offset)}`;
      }
    }
    
    // Build the query
    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause ? `WHERE ${whereClause}` : ''}
      ${orderByClause}
      ${limitClause}
    `;
    
    return this.db.all(sql, whereParams);
  }

  /**
   * Find entity by ID
   * @param {number|string} id - Entity ID
   * @returns {Promise<Object>} - Found entity or null
   */
  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return this.db.get(sql, [id]);
  }

  /**
   * Find entities by field
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @returns {Promise<Array>} - Found entities
   */
  async findByField(field, value) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ?`;
    return this.db.all(sql, [value]);
  }

  /**
   * Find one entity by field
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @returns {Promise<Object>} - Found entity or null
   */
  async findOneByField(field, value) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ?`;
    return this.db.get(sql, [value]);
  }

  /**
   * Create a new entity
   * @param {Object} data - Entity data
   * @returns {Promise<Object>} - Created entity
   */
  async create(data) {
    const fields = Object.keys(data).filter(k => k !== 'id');
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => data[field]);
    
    const sql = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
    `;
    
    const result = await this.db.run(sql, values);
    const id = result.lastID;
    
    return { ...data, id };
  }

  /**
   * Update an entity
   * @param {number|string} id - Entity ID
   * @param {Object} data - Entity data
   * @returns {Promise<Object>} - Updated entity
   */
  async update(id, data) {
    const fields = Object.keys(data).filter(k => k !== 'id');
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...fields.map(field => data[field]), id];
    
    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = ?
    `;
    
    await this.db.run(sql, values);
    return { ...data, id };
  }

  /**
   * Delete an entity
   * @param {number|string} id - Entity ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  /**
   * Delete entities by field
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @returns {Promise<number>} - Number of deleted entities
   */
  async deleteByField(field, value) {
    const sql = `DELETE FROM ${this.tableName} WHERE ${field} = ?`;
    const result = await this.db.run(sql, [value]);
    return result.changes;
  }

  /**
   * Count entities
   * @param {Object} where - Where clause
   * @returns {Promise<number>} - Entity count
   */
  async count(where = {}) {
    // Build WHERE clause
    const whereClause = this._buildWhereClause(where);
    const whereParams = this._extractWhereParams(where);
    
    // Build the query
    const sql = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      ${whereClause ? `WHERE ${whereClause}` : ''}
    `;
    
    const result = await this.db.get(sql, whereParams);
    return result ? result.count : 0;
  }

  /**
   * Execute a custom query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async query(sql, params = []) {
    return this.db.all(sql, params);
  }

  /**
   * Execute a custom update query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async execute(sql, params = []) {
    return this.db.run(sql, params);
  }

  /**
   * Build a WHERE clause from an object
   * @param {Object} where - Where conditions
   * @returns {string} - WHERE clause
   * @private
   */
  _buildWhereClause(where) {
    if (!where || Object.keys(where).length === 0) {
      return '';
    }
    
    return Object.keys(where)
      .map(key => `${key} = ?`)
      .join(' AND ');
  }

  /**
   * Extract parameters from where object
   * @param {Object} where - Where conditions
   * @returns {Array} - Parameters
   * @private
   */
  _extractWhereParams(where) {
    if (!where || Object.keys(where).length === 0) {
      return [];
    }
    
    return Object.values(where);
  }
}

module.exports = BaseRepository;