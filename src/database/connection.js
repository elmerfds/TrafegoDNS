/**
 * SQLite Database Connection Manager
 * Manages SQLite connections and provides transaction support
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.isInitialized = false;
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
   * Initialize the database connection
   * @returns {Promise<boolean>} - Connection success status
   */
  async initialize() {
    if (this.isInitialized) return true;
    
    try {
      // Open the database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database,
        // Set WAL journal mode for better concurrency
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
      });
      
      // Enable foreign keys support
      await this.db.exec('PRAGMA foreign_keys = ON;');
      
      // Set WAL journal mode for better concurrency
      await this.db.exec('PRAGMA journal_mode = WAL;');
      
      // Reasonable cache size (4MB)
      await this.db.exec('PRAGMA cache_size = -4000;');
      
      // Reasonable busy timeout (5 seconds)
      await this.db.exec('PRAGMA busy_timeout = 5000;');
      
      // Check if migration is necessary
      const needsMigration = await this.checkMigration();
      
      if (needsMigration) {
        logger.info('Database needs migration, running migrations...');
        await this.runMigrations();
      }
      
      this.isConnected = true;
      this.isInitialized = true;
      logger.info(`Successfully connected to SQLite database at ${this.dbPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize database: ${error.message}`);
      logger.debug(error.stack);
      this.isConnected = false;
      this.isInitialized = false;
      
      return false;
    }
  }

  /**
   * Check if database needs migration
   * @returns {Promise<boolean>} - Whether migration is needed
   */
  async checkMigration() {
    try {
      // Check if schema_migrations table exists
      const result = await this.db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      );
      
      if (!result) {
        return true;
      }
      
      // Check the current version
      const versionResult = await this.db.get('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      const currentVersion = versionResult ? versionResult.version : 0;
      
      // Compare with the latest migration version
      // This would be updated as new migrations are added
      const latestVersion = 2;
      
      return currentVersion < latestVersion;
    } catch (error) {
      logger.error(`Error checking migration status: ${error.message}`);
      return true;
    }
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      // Create migrations table if it doesn't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Run migrations in order
      await this.createTables();
      
      // Record the migration
      await this.db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [2, 'add_last_processed_and_managed_columns']
      );
      
      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error(`Error running migrations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create database tables
   * @returns {Promise<void>}
   */
  async createTables() {
    // Run everything in a transaction
    await this.db.exec('BEGIN TRANSACTION');
    
    try {
      // DNS Records table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS dns_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          ttl INTEGER,
          proxied INTEGER DEFAULT 0,
          tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_processed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_orphaned INTEGER DEFAULT 0,
          orphaned_at TIMESTAMP,
          fingerprint TEXT,
          managed INTEGER DEFAULT 0,
          UNIQUE(provider, record_id)
        )
      `);
      
      // Create indexes for dns_records
      await this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_records_name ON dns_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_records_is_orphaned ON dns_records(is_orphaned);
      `);
      
      // Users table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP,
          last_login TIMESTAMP
        )
      `);
      
      // Revoked tokens table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS revoked_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT UNIQUE NOT NULL,
          revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL
        )
      `);
      
      // Settings table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Audit logs table
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          path TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          user_id TEXT,
          source TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await this.db.exec('COMMIT');
      logger.info('Database tables created successfully');
    } catch (error) {
      await this.db.exec('ROLLBACK');
      logger.error(`Error creating database tables: ${error.message}`);
      throw error;
    }
  }

  /**
   * Begin a transaction
   * @returns {Promise<void>}
   */
  async beginTransaction() {
    if (!this.isConnected) await this.initialize();
    await this.db.exec('BEGIN TRANSACTION');
  }

  /**
   * Commit a transaction
   * @returns {Promise<void>}
   */
  async commit() {
    if (!this.isConnected) throw new Error('Not connected to database');
    await this.db.exec('COMMIT');
  }

  /**
   * Rollback a transaction
   * @returns {Promise<void>}
   */
  async rollback() {
    if (!this.isConnected) throw new Error('Not connected to database');
    await this.db.exec('ROLLBACK');
  }

  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async run(sql, params = []) {
    if (!this.isConnected) await this.initialize();
    return this.db.run(sql, params);
  }

  /**
   * Get a single row
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Row or undefined
   */
  async get(sql, params = []) {
    if (!this.isConnected) await this.initialize();
    return this.db.get(sql, params);
  }

  /**
   * Get multiple rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any[]>} - Array of rows
   */
  async all(sql, params = []) {
    if (!this.isConnected) await this.initialize();
    return this.db.all(sql, params);
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      await this.db.close();
      this.isConnected = false;
      this.isInitialized = false;
      logger.debug('Database connection closed');
    }
  }
}

// Export singleton instance
module.exports = new DatabaseConnection();