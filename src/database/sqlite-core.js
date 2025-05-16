/**
 * Simplified SQLite Core Implementation
 * A more reliable, simplified approach to SQLite database operations
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class SQLiteCore {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.isInitialized = false;
    this.inTransaction = false;
    this.dataDir = path.join(process.env.CONFIG_DIR || '/config', 'data');
    this.dbPath = path.join(this.dataDir, 'trafegodns.db');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
        logger.debug(`Created database directory: ${this.dataDir}`);
      } catch (error) {
        logger.error(`Failed to create database directory: ${error.message}`);
      }
    }
  }

  /**
   * Initialize the database connection and create tables
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.isInitialized) return true;
    
    try {
      logger.info('Initializing SQLite database with simplified approach');
      
      // Try to dynamically import better-sqlite3
      if (!this.SQLite) {
        try {
          const { default: SQLite } = await import('better-sqlite3');
          this.SQLite = SQLite;
        } catch (importError) {
          logger.error(`Could not import better-sqlite3: ${importError.message}`);
          return false;
        }
      }
      
      // Open database connection
      this.db = new this.SQLite(this.dbPath, { 
        verbose: process.env.DEBUG_MODE === 'true' ? logger.debug : null
      });
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Set WAL journal mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      // Reasonable cache size
      this.db.pragma('cache_size = -4000');
      
      // Create tables
      await this.createTables();
      
      // Set connection status
      this.isConnected = true;
      this.isInitialized = true;
      
      logger.info(`Successfully initialized SQLite database at ${this.dbPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to initialize SQLite database: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Create database tables
   */
  async createTables() {
    try {
      // Schema migrations table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // DNS records table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS dns_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'unknown',
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT,
          ttl INTEGER DEFAULT 1,
          proxied INTEGER DEFAULT 0,
          tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_processed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_orphaned INTEGER DEFAULT 0,
          orphaned_at TIMESTAMP,
          fingerprint TEXT,
          managed INTEGER DEFAULT 0,
          updated_at TIMESTAMP,
          last_refreshed TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(provider, record_id)
        )
      `);
      
      // Create indexes for dns_records
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_dns_provider ON dns_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_name ON dns_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_type ON dns_records(type);
        CREATE INDEX IF NOT EXISTS idx_dns_orphaned ON dns_records(is_orphaned);
        CREATE INDEX IF NOT EXISTS idx_dns_lastrefreshed ON dns_records(last_refreshed);
      `);
      
      // DNS tracked records table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS dns_tracked_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL DEFAULT 'unknown',
          record_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT,
          ttl INTEGER DEFAULT 1,
          proxied INTEGER DEFAULT 0,
          is_orphaned INTEGER DEFAULT 0,
          orphaned_at TEXT,
          tracked_at TEXT NOT NULL,
          updated_at TEXT,
          first_seen TEXT,
          metadata TEXT,
          UNIQUE(provider, record_id)
        )
      `);
      
      // Create indexes for dns_tracked_records
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_provider ON dns_tracked_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_name ON dns_tracked_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_type ON dns_tracked_records(type);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_orphaned ON dns_tracked_records(is_orphaned);
      `);
      
      // Update existing records to ensure non-null values
      const now = new Date().toISOString();
      
      // Fix null providers
      this.db.exec(`
        UPDATE dns_records
        SET provider = 'unknown'
        WHERE provider IS NULL
      `);
      
      this.db.exec(`
        UPDATE dns_tracked_records
        SET provider = 'unknown'
        WHERE provider IS NULL
      `);
      
      // Fix null last_refreshed values
      this.db.exec(`
        UPDATE dns_records
        SET last_refreshed = ?
        WHERE last_refreshed IS NULL
      `, [now]);
      
      logger.info('Created and validated all required database tables');
      
      // Record migration in schema_migrations
      const migrationExists = this.db.prepare(`
        SELECT id FROM schema_migrations
        WHERE name = 'simplified_core_implementation'
      `).get();
      
      if (!migrationExists) {
        // Get current version and increment
        const currentVersion = this.db.prepare(`
          SELECT MAX(version) as version FROM schema_migrations
        `).get();
        
        const newVersion = (currentVersion && currentVersion.version) ? 
          currentVersion.version + 1 : 1;
        
        // Record the migration
        this.db.prepare(`
          INSERT INTO schema_migrations (version, name)
          VALUES (?, ?)
        `).run(newVersion, 'simplified_core_implementation');
        
        logger.info('Recorded simplified_core_implementation migration');
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to create database tables: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Begin a transaction
   */
  beginTransaction() {
    if (this.inTransaction) {
      logger.debug('Transaction already in progress, skipping beginTransaction');
      return;
    }
    
    try {
      this.db.exec('BEGIN TRANSACTION');
      this.inTransaction = true;
      logger.debug('Started new transaction');
    } catch (error) {
      // If we're already in a transaction, just set the flag
      if (error.message.includes('cannot start a transaction within a transaction')) {
        this.inTransaction = true;
        logger.debug('Already in transaction (detected from error)');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Commit a transaction
   */
  commit() {
    if (!this.inTransaction) {
      logger.debug('No transaction in progress, skipping commit');
      return;
    }
    
    try {
      this.db.exec('COMMIT');
      this.inTransaction = false;
      logger.debug('Committed transaction');
    } catch (error) {
      if (error.message.includes('no transaction is active')) {
        this.inTransaction = false;
        logger.debug('No active transaction to commit (flag was wrong)');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Rollback a transaction
   */
  rollback() {
    if (!this.inTransaction) {
      logger.debug('No transaction in progress, skipping rollback');
      return;
    }
    
    try {
      this.db.exec('ROLLBACK');
      this.inTransaction = false;
      logger.debug('Rolled back transaction');
    } catch (error) {
      if (error.message.includes('no transaction is active')) {
        this.inTransaction = false;
        logger.debug('No active transaction to rollback (flag was wrong)');
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object} - Query result
   */
  run(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      
      return {
        changes: result.changes,
        lastID: result.lastInsertRowid
      };
    } catch (error) {
      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`SQL: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }
  
  /**
   * Get a single row
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Object|undefined} - Row or undefined
   */
  get(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } catch (error) {
      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`SQL: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }
  
  /**
   * Get multiple rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Array} - Array of rows
   */
  all(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`SQL: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }
  
  /**
   * Execute a statement directly
   * @param {string} sql - SQL statement
   */
  exec(sql) {
    try {
      this.db.exec(sql);
    } catch (error) {
      logger.error(`Error executing statement: ${error.message}`);
      logger.debug(`SQL: ${sql}`);
      throw error;
    }
  }
  
  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.isConnected = false;
      this.isInitialized = false;
      logger.debug('Database connection closed');
    }
  }
}

// Create a singleton instance
const instance = new SQLiteCore();

module.exports = instance;