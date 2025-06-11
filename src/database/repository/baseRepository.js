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
    // Validate entity data
    const validatedData = this.validateEntity(data, false);
    
    const fields = Object.keys(validatedData).filter(k => k !== 'id');
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(field => validatedData[field]);
    
    const sql = `
      INSERT INTO ${this.tableName} (${fields.join(', ')})
      VALUES (${placeholders})
    `;
    
    const result = await this.db.run(sql, values);
    const id = result.lastID;
    
    return { ...validatedData, id };
  }

  /**
   * Update an entity
   * @param {number|string} id - Entity ID
   * @param {Object} data - Entity data
   * @returns {Promise<Object>} - Updated entity
   */
  async update(id, data) {
    // Validate entity data
    const validatedData = this.validateEntity(data, true);
    
    const fields = Object.keys(validatedData).filter(k => k !== 'id');
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...fields.map(field => validatedData[field]), id];
    
    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = ?
    `;
    
    await this.db.run(sql, values);
    return { ...validatedData, id };
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
   * Run data consistency checks for this repository
   * @param {Object} options - Check options
   * @returns {Promise<Object>} - Consistency report
   */
  async runConsistencyChecks(options = {}) {
    const { fixInconsistencies = false } = options;
    
    const report = {
      tableName: this.tableName,
      timestamp: new Date().toISOString(),
      checks: [],
      issues: [],
      fixes: []
    };

    try {
      // Basic data integrity checks
      await this._checkBasicIntegrity(report, fixInconsistencies);
      
      // Table-specific checks (to be overridden by subclasses)
      if (this._checkTableSpecific) {
        await this._checkTableSpecific(report, fixInconsistencies);
      }

      return report;
    } catch (error) {
      report.error = error.message;
      return report;
    }
  }

  /**
   * Basic integrity checks for all repositories
   * @private
   */
  async _checkBasicIntegrity(report, fix = false) {
    // Check for NULL IDs
    const nullIds = await this.db.all(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE id IS NULL`);
    if (nullIds[0].count > 0) {
      report.issues.push(`Found ${nullIds[0].count} records with NULL id`);
      
      if (fix) {
        // Delete records with NULL id
        const result = await this.db.run(`DELETE FROM ${this.tableName} WHERE id IS NULL`);
        report.fixes.push(`Deleted ${result.changes} records with NULL id`);
      }
    }

    // Check for empty string IDs
    const emptyIds = await this.db.all(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE id = ''`);
    if (emptyIds[0].count > 0) {
      report.issues.push(`Found ${emptyIds[0].count} records with empty id`);
      
      if (fix) {
        // Delete records with empty id
        const result = await this.db.run(`DELETE FROM ${this.tableName} WHERE id = ''`);
        report.fixes.push(`Deleted ${result.changes} records with empty id`);
      }
    }

    // Check for duplicate IDs
    const duplicateIds = await this.db.all(`
      SELECT id, COUNT(*) as count 
      FROM ${this.tableName} 
      GROUP BY id 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateIds.length > 0) {
      report.issues.push(`Found ${duplicateIds.length} duplicate IDs`);
      
      if (fix) {
        // Keep only the first occurrence of each duplicate ID
        for (const dup of duplicateIds) {
          const result = await this.db.run(`
            DELETE FROM ${this.tableName} 
            WHERE id = ? 
            AND rowid NOT IN (
              SELECT MIN(rowid) 
              FROM ${this.tableName} 
              WHERE id = ?
            )
          `, [dup.id, dup.id]);
          
          if (result.changes > 0) {
            report.fixes.push(`Removed ${result.changes} duplicate records for id ${dup.id}`);
          }
        }
      }
    }

    report.checks.push({
      name: 'Basic Integrity',
      passed: report.issues.length === 0,
      issues: report.issues.length
    });
  }

  /**
   * Validate entity data before create/update
   * @param {Object} data - Entity data
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} - Validated data
   */
  validateEntity(data, isUpdate = false) {
    if (!data || typeof data !== 'object') {
      throw new Error('Entity data must be an object');
    }

    // Remove undefined values and ensure proper typing for SQLite
    const validated = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        const value = data[key];
        
        // Convert booleans to numbers for SQLite (0 = false, 1 = true)
        if (typeof value === 'boolean') {
          validated[key] = value ? 1 : 0;
        }
        // Ensure strings, numbers, and null are passed as-is
        else if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
          validated[key] = value;
        }
        // Convert other types to strings
        else {
          validated[key] = String(value);
        }
      }
    });

    // Basic validation for common fields
    if (validated.id !== undefined && (validated.id === '' || validated.id === null)) {
      delete validated.id; // Let database generate ID
    }

    return validated;
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