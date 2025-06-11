/**
 * Improved Base Repository
 * Enhanced base class with connection pooling and transaction support
 */
const { pool } = require('../connectionPool');
const logger = require('../../utils/logger');

class ImprovedBaseRepository {
  constructor(tableName) {
    if (new.target === ImprovedBaseRepository) {
      throw new Error('ImprovedBaseRepository is an abstract class and cannot be instantiated directly');
    }
    this.tableName = tableName;
    this.pool = pool;
  }

  /**
   * Execute a database operation with automatic connection management
   * @param {Function} operation - Database operation to execute
   * @returns {Promise<any>} Operation result
   */
  async withConnection(operation) {
    const connection = await this.pool.acquire();
    try {
      return await operation(connection);
    } finally {
      await this.pool.release(connection);
    }
  }

  /**
   * Execute a database operation within a transaction
   * @param {Function} operation - Database operation to execute
   * @returns {Promise<any>} Operation result
   */
  async withTransaction(operation) {
    return this.withConnection(async (connection) => {
      return connection.transaction(async (tx) => {
        return operation(tx);
      });
    });
  }

  /**
   * Find all entities with advanced querying
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Found entities with pagination info
   */
  async findAll(options = {}) {
    const { 
      where = {}, 
      orderBy = 'id DESC', 
      limit = 100, 
      offset = 0,
      include = [],
      attributes = ['*']
    } = options;

    return this.withConnection(async (connection) => {
      // Build SELECT clause
      const selectClause = attributes.join(', ');
      
      // Build WHERE clause with support for operators
      const { whereClause, whereParams } = this._buildAdvancedWhereClause(where);
      
      // Build the query
      const sql = `
        SELECT ${selectClause} 
        FROM ${this.tableName}
        ${whereClause ? `WHERE ${whereClause}` : ''}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `;
      
      const params = [...whereParams, limit, offset];
      const rows = await connection.all(sql, params);
      
      // Get total count for pagination
      const countSql = `
        SELECT COUNT(*) as total 
        FROM ${this.tableName}
        ${whereClause ? `WHERE ${whereClause}` : ''}
      `;
      
      const countResult = await connection.get(countSql, whereParams);
      const total = countResult ? countResult.total : 0;
      
      // Handle includes (relations)
      if (include.length > 0 && rows.length > 0) {
        await this._handleIncludes(connection, rows, include);
      }
      
      return {
        data: rows,
        pagination: {
          total,
          limit,
          offset,
          page: Math.floor(offset / limit) + 1,
          pages: Math.ceil(total / limit)
        }
      };
    });
  }

  /**
   * Find entity by ID
   * @param {number|string} id - Entity ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Found entity or null
   */
  async findById(id, options = {}) {
    const { include = [], attributes = ['*'] } = options;
    
    return this.withConnection(async (connection) => {
      const selectClause = attributes.join(', ');
      const sql = `SELECT ${selectClause} FROM ${this.tableName} WHERE id = ?`;
      const row = await connection.get(sql, [id]);
      
      if (row && include.length > 0) {
        await this._handleIncludes(connection, [row], include);
      }
      
      return row;
    });
  }

  /**
   * Find one entity by conditions
   * @param {Object} where - Where conditions
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Found entity or null
   */
  async findOne(where, options = {}) {
    const result = await this.findAll({
      where,
      limit: 1,
      ...options
    });
    
    return result.data.length > 0 ? result.data[0] : null;
  }

  /**
   * Create a new entity with validation
   * @param {Object} data - Entity data
   * @param {Object} options - Create options
   * @returns {Promise<Object>} - Created entity
   */
  async create(data, options = {}) {
    const { validate = true, returning = true } = options;
    
    return this.withTransaction(async (tx) => {
      // Validate entity data
      if (validate) {
        const validatedData = await this.validateEntity(data, false);
        data = validatedData;
      }
      
      // Add timestamps
      const now = new Date().toISOString();
      if (!data.created_at) data.created_at = now;
      if (!data.updated_at) data.updated_at = now;
      
      const fields = Object.keys(data).filter(k => k !== 'id');
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(field => data[field]);
      
      const sql = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES (${placeholders})
      `;
      
      const result = await tx.run(sql, values);
      const id = result.lastID;
      
      if (returning) {
        // Return the created entity
        return this.findById(id);
      }
      
      return { id, ...data };
    });
  }

  /**
   * Bulk create entities
   * @param {Array<Object>} items - Array of entities to create
   * @param {Object} options - Create options
   * @returns {Promise<Array>} - Created entities
   */
  async bulkCreate(items, options = {}) {
    const { validate = true, chunkSize = 100 } = options;
    
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }
    
    return this.withTransaction(async (tx) => {
      const results = [];
      const now = new Date().toISOString();
      
      // Process in chunks to avoid SQL length limits
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        
        // Prepare data
        const preparedItems = [];
        for (const item of chunk) {
          let data = item;
          if (validate) {
            data = await this.validateEntity(item, false);
          }
          
          // Add timestamps
          if (!data.created_at) data.created_at = now;
          if (!data.updated_at) data.updated_at = now;
          
          preparedItems.push(data);
        }
        
        // Build bulk insert
        if (preparedItems.length > 0) {
          const fields = Object.keys(preparedItems[0]).filter(k => k !== 'id');
          const placeholders = preparedItems
            .map(() => `(${fields.map(() => '?').join(', ')})`)
            .join(', ');
          
          const values = preparedItems.flatMap(item => 
            fields.map(field => item[field])
          );
          
          const sql = `
            INSERT INTO ${this.tableName} (${fields.join(', ')})
            VALUES ${placeholders}
          `;
          
          await tx.run(sql, values);
          results.push(...preparedItems);
        }
      }
      
      return results;
    });
  }

  /**
   * Update an entity
   * @param {number|string} id - Entity ID
   * @param {Object} data - Entity data
   * @param {Object} options - Update options
   * @returns {Promise<Object>} - Updated entity
   */
  async update(id, data, options = {}) {
    const { validate = true, returning = true } = options;
    
    return this.withTransaction(async (tx) => {
      // Check if entity exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`Entity with id ${id} not found in ${this.tableName}`);
      }
      
      // Validate entity data
      if (validate) {
        const validatedData = await this.validateEntity(data, true);
        data = validatedData;
      }
      
      // Add updated timestamp
      if (!data.updated_at) {
        data.updated_at = new Date().toISOString();
      }
      
      const fields = Object.keys(data).filter(k => k !== 'id');
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = [...fields.map(field => data[field]), id];
      
      const sql = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE id = ?
      `;
      
      await tx.run(sql, values);
      
      if (returning) {
        return this.findById(id);
      }
      
      return { ...existing, ...data, id };
    });
  }

  /**
   * Update multiple entities by condition
   * @param {Object} where - Where conditions
   * @param {Object} data - Update data
   * @param {Object} options - Update options
   * @returns {Promise<number>} - Number of updated rows
   */
  async updateWhere(where, data, options = {}) {
    const { validate = true } = options;
    
    return this.withTransaction(async (tx) => {
      // Validate update data
      if (validate) {
        const validatedData = await this.validateEntity(data, true);
        data = validatedData;
      }
      
      // Add updated timestamp
      if (!data.updated_at) {
        data.updated_at = new Date().toISOString();
      }
      
      const { whereClause, whereParams } = this._buildAdvancedWhereClause(where);
      const fields = Object.keys(data);
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = [...fields.map(field => data[field]), ...whereParams];
      
      const sql = `
        UPDATE ${this.tableName}
        SET ${setClause}
        ${whereClause ? `WHERE ${whereClause}` : ''}
      `;
      
      const result = await tx.run(sql, values);
      return result.changes;
    });
  }

  /**
   * Delete an entity
   * @param {number|string} id - Entity ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    return this.withTransaction(async (tx) => {
      const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
      const result = await tx.run(sql, [id]);
      return result.changes > 0;
    });
  }

  /**
   * Delete multiple entities by condition
   * @param {Object} where - Where conditions
   * @returns {Promise<number>} - Number of deleted rows
   */
  async deleteWhere(where) {
    return this.withTransaction(async (tx) => {
      const { whereClause, whereParams } = this._buildAdvancedWhereClause(where);
      
      const sql = `
        DELETE FROM ${this.tableName}
        ${whereClause ? `WHERE ${whereClause}` : ''}
      `;
      
      const result = await tx.run(sql, whereParams);
      return result.changes;
    });
  }

  /**
   * Count entities
   * @param {Object} where - Where conditions
   * @returns {Promise<number>} - Entity count
   */
  async count(where = {}) {
    return this.withConnection(async (connection) => {
      const { whereClause, whereParams } = this._buildAdvancedWhereClause(where);
      
      const sql = `
        SELECT COUNT(*) as count FROM ${this.tableName}
        ${whereClause ? `WHERE ${whereClause}` : ''}
      `;
      
      const result = await connection.get(sql, whereParams);
      return result ? result.count : 0;
    });
  }

  /**
   * Check if entity exists
   * @param {Object} where - Where conditions
   * @returns {Promise<boolean>} - Existence status
   */
  async exists(where) {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Execute raw query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async query(sql, params = []) {
    return this.withConnection(async (connection) => {
      return connection.all(sql, params);
    });
  }

  /**
   * Execute raw update/delete query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async execute(sql, params = []) {
    return this.withConnection(async (connection) => {
      return connection.run(sql, params);
    });
  }

  /**
   * Build advanced WHERE clause with operator support
   * @private
   */
  _buildAdvancedWhereClause(where) {
    if (!where || Object.keys(where).length === 0) {
      return { whereClause: '', whereParams: [] };
    }
    
    const clauses = [];
    const params = [];
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        clauses.push(`${key} IS NULL`);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Handle operators
        for (const [op, val] of Object.entries(value)) {
          switch (op) {
            case '$eq':
              clauses.push(`${key} = ?`);
              params.push(val);
              break;
            case '$ne':
              clauses.push(`${key} != ?`);
              params.push(val);
              break;
            case '$gt':
              clauses.push(`${key} > ?`);
              params.push(val);
              break;
            case '$gte':
              clauses.push(`${key} >= ?`);
              params.push(val);
              break;
            case '$lt':
              clauses.push(`${key} < ?`);
              params.push(val);
              break;
            case '$lte':
              clauses.push(`${key} <= ?`);
              params.push(val);
              break;
            case '$like':
              clauses.push(`${key} LIKE ?`);
              params.push(val);
              break;
            case '$in':
              if (Array.isArray(val) && val.length > 0) {
                const placeholders = val.map(() => '?').join(', ');
                clauses.push(`${key} IN (${placeholders})`);
                params.push(...val);
              }
              break;
            case '$notIn':
              if (Array.isArray(val) && val.length > 0) {
                const placeholders = val.map(() => '?').join(', ');
                clauses.push(`${key} NOT IN (${placeholders})`);
                params.push(...val);
              }
              break;
            case '$between':
              if (Array.isArray(val) && val.length === 2) {
                clauses.push(`${key} BETWEEN ? AND ?`);
                params.push(val[0], val[1]);
              }
              break;
          }
        }
      } else if (Array.isArray(value)) {
        // Handle array as IN operator
        if (value.length > 0) {
          const placeholders = value.map(() => '?').join(', ');
          clauses.push(`${key} IN (${placeholders})`);
          params.push(...value);
        }
      } else {
        // Simple equality
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    }
    
    return {
      whereClause: clauses.join(' AND '),
      whereParams: params
    };
  }

  /**
   * Handle includes (relations)
   * @private
   */
  async _handleIncludes(connection, rows, includes) {
    // To be implemented by subclasses
    // This is a placeholder for relationship loading
  }

  /**
   * Validate entity data
   * @param {Object} data - Entity data
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Promise<Object>} - Validated data
   */
  async validateEntity(data, isUpdate = false) {
    if (!data || typeof data !== 'object') {
      throw new Error('Entity data must be an object');
    }

    // Remove undefined values
    const validated = {};
    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        validated[key] = data[key];
      }
    });

    // Basic validation
    if (!isUpdate) {
      // Validation for create
      if (validated.id) {
        delete validated.id; // Let database generate ID
      }
    }

    // Call entity-specific validation if available
    if (this.validateEntitySpecific) {
      return this.validateEntitySpecific(validated, isUpdate);
    }

    return validated;
  }

  /**
   * Run data consistency checks
   * @param {Object} options - Check options
   * @returns {Promise<Object>} - Consistency report
   */
  async runConsistencyChecks(options = {}) {
    const { fix = false } = options;
    
    const report = {
      tableName: this.tableName,
      timestamp: new Date().toISOString(),
      checks: [],
      issues: [],
      fixes: []
    };

    return this.withTransaction(async (tx) => {
      try {
        // Check for NULL or empty IDs
        const invalidIds = await tx.all(`
          SELECT COUNT(*) as count 
          FROM ${this.tableName} 
          WHERE id IS NULL OR id = ''
        `);
        
        if (invalidIds[0].count > 0) {
          report.issues.push(`Found ${invalidIds[0].count} records with invalid IDs`);
          
          if (fix) {
            const result = await tx.run(`
              DELETE FROM ${this.tableName} 
              WHERE id IS NULL OR id = ''
            `);
            report.fixes.push(`Deleted ${result.changes} records with invalid IDs`);
          }
        }

        // Check for duplicate IDs
        const duplicates = await tx.all(`
          SELECT id, COUNT(*) as count 
          FROM ${this.tableName} 
          GROUP BY id 
          HAVING COUNT(*) > 1
        `);
        
        if (duplicates.length > 0) {
          report.issues.push(`Found ${duplicates.length} duplicate IDs`);
          
          if (fix) {
            for (const dup of duplicates) {
              const result = await tx.run(`
                DELETE FROM ${this.tableName} 
                WHERE id = ? 
                AND rowid NOT IN (
                  SELECT MIN(rowid) 
                  FROM ${this.tableName} 
                  WHERE id = ?
                )
              `, [dup.id, dup.id]);
              
              report.fixes.push(`Removed ${result.changes} duplicates for ID ${dup.id}`);
            }
          }
        }

        // Run table-specific checks
        if (this.runSpecificChecks) {
          await this.runSpecificChecks(tx, report, fix);
        }

        report.checks.push({
          name: 'Data Consistency',
          passed: report.issues.length === 0,
          issues: report.issues.length
        });

        return report;
      } catch (error) {
        report.error = error.message;
        throw error;
      }
    });
  }
}

module.exports = ImprovedBaseRepository;