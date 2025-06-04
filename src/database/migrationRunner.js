/**
 * Database Migration Runner
 * Handles database schema migrations in a controlled manner
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { pool } = require('./connectionPool');

class MigrationRunner {
  constructor(options = {}) {
    this.options = {
      migrationsPath: options.migrationsPath || path.join(__dirname, 'migrations'),
      tableName: options.tableName || 'schema_migrations',
      ...options
    };
  }
  
  /**
   * Run all pending migrations
   * @returns {Promise<Object>} Migration results
   */
  async run() {
    const results = {
      success: true,
      migrationsRun: [],
      errors: [],
      totalTime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable();
      
      // Get all migration files
      const migrationFiles = await this.getMigrationFiles();
      
      // Get applied migrations
      const appliedMigrations = await this.getAppliedMigrations();
      
      // Determine pending migrations
      const pendingMigrations = migrationFiles.filter(file => 
        !appliedMigrations.some(applied => applied.name === file)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations to run');
        return results;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations`);
      
      // Run each migration
      for (const migrationFile of pendingMigrations) {
        const migrationResult = await this.runMigration(migrationFile);
        
        if (migrationResult.success) {
          results.migrationsRun.push(migrationResult);
        } else {
          results.errors.push(migrationResult);
          
          // Stop on first error by default
          if (!this.options.continueOnError) {
            results.success = false;
            break;
          }
        }
      }
      
    } catch (error) {
      logger.error(`Migration runner error: ${error.message}`);
      results.success = false;
      results.errors.push({
        name: 'runner',
        error: error.message
      });
    }
    
    results.totalTime = Date.now() - startTime;
    
    // Log summary
    logger.info(`Migration run completed in ${results.totalTime}ms`);
    logger.info(`Migrations run: ${results.migrationsRun.length}`);
    if (results.errors.length > 0) {
      logger.error(`Errors encountered: ${results.errors.length}`);
    }
    
    return results;
  }
  
  /**
   * Ensure migrations tracking table exists
   * @private
   */
  async ensureMigrationsTable() {
    const connection = await pool.acquire();
    
    try {
      await connection.exec(`
        CREATE TABLE IF NOT EXISTS ${this.options.tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL UNIQUE,
          checksum TEXT,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time INTEGER,
          status TEXT DEFAULT 'completed',
          error_message TEXT
        )
      `);
      
      // Create index
      await connection.exec(`
        CREATE INDEX IF NOT EXISTS idx_migrations_name 
        ON ${this.options.tableName}(name)
      `);
      
    } finally {
      await pool.release(connection);
    }
  }
  
  /**
   * Get list of migration files
   * @private
   */
  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.options.migrationsPath);
      
      // Filter for .js files and sort by name
      return files
        .filter(file => file.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b));
        
    } catch (error) {
      logger.error(`Error reading migrations directory: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get list of applied migrations
   * @private
   */
  async getAppliedMigrations() {
    const connection = await pool.acquire();
    
    try {
      const rows = await connection.all(`
        SELECT * FROM ${this.options.tableName}
        WHERE status = 'completed'
        ORDER BY version ASC
      `);
      
      return rows;
    } finally {
      await pool.release(connection);
    }
  }
  
  /**
   * Run a single migration
   * @private
   */
  async runMigration(migrationFile) {
    const result = {
      name: migrationFile,
      success: false,
      executionTime: 0,
      error: null
    };
    
    const startTime = Date.now();
    logger.info(`Running migration: ${migrationFile}`);
    
    const connection = await pool.acquire();
    
    try {
      // Load migration module
      const migrationPath = path.join(this.options.migrationsPath, migrationFile);
      const migration = require(migrationPath);
      
      // Validate migration structure
      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${migrationFile} does not export an 'up' function`);
      }
      
      // Get next version number
      const maxVersion = await connection.get(`
        SELECT MAX(version) as max_version 
        FROM ${this.options.tableName}
      `);
      
      const nextVersion = (maxVersion?.max_version || 0) + 1;
      
      // Run migration in transaction
      await connection.transaction(async (tx) => {
        // Record migration start
        const insertResult = await tx.run(`
          INSERT INTO ${this.options.tableName} (version, name, status)
          VALUES (?, ?, 'running')
        `, [nextVersion, migrationFile]);
        
        const migrationId = insertResult.lastID;
        
        try {
          // Run the migration
          await migration.up(tx, logger);
          
          // Update migration record
          const executionTime = Date.now() - startTime;
          await tx.run(`
            UPDATE ${this.options.tableName}
            SET status = 'completed',
                execution_time = ?
            WHERE id = ?
          `, [executionTime, migrationId]);
          
          result.success = true;
          result.executionTime = executionTime;
          result.version = nextVersion;
          
          logger.info(`Migration ${migrationFile} completed in ${executionTime}ms`);
          
        } catch (error) {
          // Update migration record with error
          await tx.run(`
            UPDATE ${this.options.tableName}
            SET status = 'failed',
                error_message = ?,
                execution_time = ?
            WHERE id = ?
          `, [error.message, Date.now() - startTime, migrationId]);
          
          throw error;
        }
      });
      
    } catch (error) {
      logger.error(`Migration ${migrationFile} failed: ${error.message}`);
      result.error = error.message;
      result.executionTime = Date.now() - startTime;
      
    } finally {
      await pool.release(connection);
    }
    
    return result;
  }
  
  /**
   * Rollback migrations
   * @param {number} steps - Number of migrations to rollback
   * @returns {Promise<Object>} Rollback results
   */
  async rollback(steps = 1) {
    const results = {
      success: true,
      migrationsRolledBack: [],
      errors: []
    };
    
    try {
      // Get applied migrations in reverse order
      const appliedMigrations = await this.getAppliedMigrations();
      const migrationsToRollback = appliedMigrations
        .reverse()
        .slice(0, steps);
      
      if (migrationsToRollback.length === 0) {
        logger.info('No migrations to rollback');
        return results;
      }
      
      for (const migration of migrationsToRollback) {
        const rollbackResult = await this.rollbackMigration(migration);
        
        if (rollbackResult.success) {
          results.migrationsRolledBack.push(rollbackResult);
        } else {
          results.errors.push(rollbackResult);
          results.success = false;
          
          if (!this.options.continueOnError) {
            break;
          }
        }
      }
      
    } catch (error) {
      logger.error(`Rollback error: ${error.message}`);
      results.success = false;
      results.errors.push({
        name: 'rollback',
        error: error.message
      });
    }
    
    return results;
  }
  
  /**
   * Rollback a single migration
   * @private
   */
  async rollbackMigration(migrationRecord) {
    const result = {
      name: migrationRecord.name,
      success: false,
      error: null
    };
    
    logger.info(`Rolling back migration: ${migrationRecord.name}`);
    
    const connection = await pool.acquire();
    
    try {
      // Load migration module
      const migrationPath = path.join(this.options.migrationsPath, migrationRecord.name);
      const migration = require(migrationPath);
      
      // Check if migration supports rollback
      if (typeof migration.down !== 'function') {
        throw new Error(`Migration ${migrationRecord.name} does not support rollback`);
      }
      
      // Run rollback in transaction
      await connection.transaction(async (tx) => {
        // Run the rollback
        await migration.down(tx, logger);
        
        // Remove migration record
        await tx.run(`
          DELETE FROM ${this.options.tableName}
          WHERE id = ?
        `, [migrationRecord.id]);
        
        result.success = true;
        logger.info(`Migration ${migrationRecord.name} rolled back successfully`);
      });
      
    } catch (error) {
      logger.error(`Rollback of ${migrationRecord.name} failed: ${error.message}`);
      result.error = error.message;
      
    } finally {
      await pool.release(connection);
    }
    
    return result;
  }
  
  /**
   * Get migration status
   * @returns {Promise<Object>} Migration status
   */
  async getStatus() {
    const connection = await pool.acquire();
    
    try {
      // Get all migrations
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await connection.all(`
        SELECT * FROM ${this.options.tableName}
        ORDER BY version ASC
      `);
      
      // Build status
      const status = {
        total: allMigrations.length,
        applied: appliedMigrations.filter(m => m.status === 'completed').length,
        failed: appliedMigrations.filter(m => m.status === 'failed').length,
        pending: 0,
        migrations: []
      };
      
      // Build detailed list
      for (const migrationFile of allMigrations) {
        const applied = appliedMigrations.find(m => m.name === migrationFile);
        
        status.migrations.push({
          name: migrationFile,
          status: applied ? applied.status : 'pending',
          version: applied?.version,
          appliedAt: applied?.applied_at,
          executionTime: applied?.execution_time,
          error: applied?.error_message
        });
        
        if (!applied || applied.status !== 'completed') {
          status.pending++;
        }
      }
      
      return status;
      
    } finally {
      await pool.release(connection);
    }
  }
  
  /**
   * Reset all migrations (dangerous!)
   * @param {boolean} confirm - Must be true to proceed
   * @returns {Promise<void>}
   */
  async reset(confirm = false) {
    if (!confirm) {
      throw new Error('Reset requires confirmation');
    }
    
    logger.warn('Resetting all migrations - this is destructive!');
    
    const connection = await pool.acquire();
    
    try {
      await connection.exec(`DROP TABLE IF EXISTS ${this.options.tableName}`);
      logger.info('Migrations table dropped');
      
    } finally {
      await pool.release(connection);
    }
  }
}

// Create singleton instance
const migrationRunner = new MigrationRunner();

module.exports = {
  MigrationRunner,
  migrationRunner
};