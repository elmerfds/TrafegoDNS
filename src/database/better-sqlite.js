/**
 * SQLite Implementation using better-sqlite3 module
 * This is an alternative SQLite implementation that doesn't require native compilation
 * Provides a simplified API compatible with our needs
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class BetterSQLite {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.isInitialized = false;
    this.inTransaction = false;
    this.skipMigrations = false;
    this._initializing = false;
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
   * Connect to the database without running migrations
   * Used when another process is already running migrations
   * @returns {Promise<boolean>} Success status
   */
  async connectWithoutMigrations() {
    if (this.isInitialized) return true;
    
    this._initializing = true;
    
    try {
      // Try to dynamically import better-sqlite3
      if (!this.SQLite) {
        try {
          const { default: SQLite } = await import('better-sqlite3');
          this.SQLite = SQLite;
        } catch (importError) {
          logger.warn(`Could not import better-sqlite3: ${importError.message}`);
          logger.warn('Falling back to JSON storage');
          this._initializing = false;
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
      
      // Skip migrations completely
      logger.info('Skipping database migrations (another process is handling them)');
      
      this.isConnected = true;
      this.isInitialized = true;
      this._initializing = false;
      logger.info(`Successfully connected to SQLite database at ${this.dbPath} (no migrations)`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to connect to database: ${error.message}`);
      this.isConnected = false;
      this.isInitialized = false;
      this._initializing = false;
      return false;
    }
  }

  /**
   * Initialize the database
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.isInitialized) return true;

    // Check for concurrent initialization
    if (this._initializing) {
      logger.warn('Database initialization already in progress, waiting...');
      // Wait for initialization to complete (up to 5 seconds)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (this.isInitialized) return true;
      }
      logger.error('Timed out waiting for database initialization');
      return false;
    }

    this._initializing = true;

    try {
      // Check if we should skip migrations (set by parent module)
      if (this.skipMigrations) {
        logger.info('skipMigrations flag set, connecting without migrations');
        return await this.connectWithoutMigrations();
      }
      
      // Try to dynamically import better-sqlite3
      // If it fails, we'll return false and the app will use JSON storage
      try {
        const { default: SQLite } = await import('better-sqlite3');
        this.SQLite = SQLite;
      } catch (importError) {
        logger.warn(`Could not import better-sqlite3: ${importError.message}`);
        logger.warn('Falling back to JSON storage');
        this._initializing = false;
        return false;
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
      
      // Check if migration is necessary
      const needsMigration = await this.checkMigration();
      
      if (needsMigration) {
        logger.info('Database needs migration, running migrations...');
        
        // Make sure we're not in a transaction when starting migrations
        if (this.inTransaction) {
          logger.warn('Transaction already in progress before migrations, committing first');
          await this.commit();
        }
        
        // Run migrations with enhanced error handling
        try {
          await this.runMigrations();
        } catch (migrationError) {
          logger.error(`Migration error: ${migrationError.message}`);
          // Ensure we're not left in a transaction state
          if (this.inTransaction) {
            logger.warn('Rolling back transaction after migration error');
            await this.rollback();
          }
          throw migrationError;
        }
      }
      
      this.isConnected = true;
      this.isInitialized = true;
      this._initializing = false;
      logger.info(`Successfully connected to SQLite database at ${this.dbPath}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize database: ${error.message}`);
      logger.debug(error.stack);
      this.isConnected = false;
      this.isInitialized = false;
      this._initializing = false;
      
      // Make sure we're not left in a transaction state
      if (this.inTransaction) {
        try {
          await this.rollback();
          logger.debug('Rolled back transaction after initialization error');
        } catch (rollbackError) {
          logger.error(`Failed to rollback transaction: ${rollbackError.message}`);
        }
      }
      
      return false;
    }
  }

  /**
   * Check if database needs migration
   * @returns {Promise<boolean>} Whether migration is needed
   */
  async checkMigration() {
    try {
      // Check if schema_migrations table exists
      const stmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
      const result = stmt.get();
      
      if (!result) {
        return true;
      }
      
      // Check the current version
      const versionStmt = this.db.prepare('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      const versionResult = versionStmt.get();
      const currentVersion = versionResult ? versionResult.version : 0;
      
      // Compare with the latest migration version
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
    // Check if a transaction is already in progress
    const wasInTransaction = this.inTransaction;
    
    if (!wasInTransaction) {
      // Start a transaction if one isn't already in progress
      await this.beginTransaction();
    }
    
    try {
      // Create migrations table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Run migrations in order - createTables will handle its own transaction state
      await this.createTables();
      
      // Record the migration
      const stmt = this.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
      stmt.run(2, 'add_last_processed_and_managed_columns');
      
      // Commit the transaction if we started it
      if (!wasInTransaction && this.inTransaction) {
        await this.commit();
      }
      
      logger.info('Database migrations completed successfully');
    } catch (error) {
      // Rollback the transaction if we started it and it hasn't been rolled back
      if (!wasInTransaction && this.inTransaction) {
        await this.rollback();
      }
      
      logger.error(`Error running migrations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create database tables with retry for locks
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<void>}
   */
  async createTables(retries = 5) {
    try {
      // Check if a transaction is already in progress
      if (this.inTransaction) {
        logger.debug('Transaction already in progress during createTables');
      } else {
        // Begin transaction
        try {
          await this.beginTransaction();
        } catch (txError) {
          // If we can't begin transaction, log and rethrow
          logger.error(`Failed to begin transaction for createTables: ${txError.message}`);
          throw txError;
        }
      }

      // Helper function to execute SQL with retry for locked database
      const execWithRetry = async (sql, label, remainingRetries = 5) => {
        try {
          // Log what we're creating
          logger.info(`Creating ${label}...`);
          this.db.exec(sql);
        } catch (error) {
          // Handle database locked errors with retries
          if (error.message.includes('database is locked') && remainingRetries > 0) {
            logger.debug(`Database locked while creating ${label}, retrying in 200ms (${remainingRetries} retries left)...`);
            await new Promise(resolve => setTimeout(resolve, 200));
            return execWithRetry(sql, label, remainingRetries - 1);
          }
          // Rethrow other errors
          throw error;
        }
      };

      // Create tables with retry capability
      await execWithRetry(`
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
      `, 'dns_records table');

      // Create indexes for dns_records
      await execWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_records_name ON dns_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_records_is_orphaned ON dns_records(is_orphaned);
      `, 'dns_records indexes');

      // Users table
      await execWithRetry(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP,
          last_login TIMESTAMP
        )
      `, 'users table');

      // Revoked tokens table
      await execWithRetry(`
        CREATE TABLE IF NOT EXISTS revoked_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT UNIQUE NOT NULL,
          revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL
        )
      `, 'revoked_tokens table');

      // Settings table
      await execWithRetry(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, 'settings table');

      // Audit logs table
      await execWithRetry(`
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
      `, 'audit_logs table');

      // DNS tracked records table
      await execWithRetry(`
        CREATE TABLE IF NOT EXISTS dns_tracked_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          record_id TEXT NOT NULL,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT,
          ttl INTEGER,
          proxied INTEGER DEFAULT 0,
          is_orphaned INTEGER DEFAULT 0,
          orphaned_at TEXT,
          tracked_at TEXT NOT NULL,
          updated_at TEXT,
          metadata TEXT,
          UNIQUE(provider, record_id)
        )
      `, 'dns_tracked_records table');

      // Create indexes for dns_tracked_records
      await execWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_provider ON dns_tracked_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_name ON dns_tracked_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_type ON dns_tracked_records(type);
        CREATE INDEX IF NOT EXISTS idx_dns_tracked_orphaned ON dns_tracked_records(is_orphaned);
      `, 'dns_tracked_records indexes');

      // Only commit if we started the transaction
      if (!this.inTransaction) {
        logger.error('Transaction flag inconsistency in createTables');
      } else {
        // Commit transaction safely
        try {
          await this.commit();
          logger.info('Database tables created successfully');
        } catch (commitError) {
          // If commit fails due to a lock, retry it
          if (commitError.message.includes('database is locked') && retries > 0) {
            logger.debug(`Database locked while committing table creation, retrying in 200ms (${retries} retries left)...`);
            await new Promise(resolve => setTimeout(resolve, 200));
            // Just retry the commit, as tables are already created
            return this.commit(retries - 1);
          }
          // If commit fails for other reasons, log and rethrow
          logger.error(`Failed to commit table creation: ${commitError.message}`);
          throw commitError;
        }
      }
    } catch (error) {
      // Only rollback if we started the transaction
      if (this.inTransaction) {
        // Rollback transaction safely
        try {
          await this.rollback();
        } catch (rollbackError) {
          // If rollback fails, just log - we've done what we can
          logger.error(`Failed to rollback after table creation error: ${rollbackError.message}`);
        }
      }

      // If error is a database locked error and we have retries left, retry the whole operation
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked during table creation, retrying entire operation in 500ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.createTables(retries - 1);
      }

      logger.error(`Error creating database tables: ${error.message}`);
      throw error;
    }
  }

  /**
   * Begin a transaction with retry for locks
   * With enhanced handling for nested transactions and database state
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<void>}
   */
  async beginTransaction(retries = 5) {
    // Make sure we're connected first
    if (!this.isConnected) {
      try {
        await this.initialize();
      } catch (initError) {
        logger.error(`Failed to initialize database before transaction: ${initError.message}`);
        throw initError;
      }
    }

    // Check our transaction flag first
    if (this.inTransaction) {
      logger.debug('Transaction flag already set, skipping beginTransaction');
      return;
    }

    // Check if a transaction is already active in SQLite itself
    // This handles cases where the flag doesn't match the actual DB state
    try {
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        if (inProgressCheck && inProgressCheck.transaction_status > 0) {
          logger.warn('Transaction active in SQLite but flag not set. Setting inTransaction flag.');
          this.inTransaction = true;
          return;
        }
      } catch (pragmaError) {
        // If pragma check fails (older SQLite versions), try the regular way
        logger.debug('Could not check transaction status via pragma, continuing with normal begin');
      }

      // Start the transaction
      logger.debug('Starting SQLite transaction');
      this.db.exec('BEGIN TRANSACTION');
      this.inTransaction = true;
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying beginTransaction in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.beginTransaction(retries - 1);
      }

      // Handle nested transaction errors - CRITICAL CASE
      if (error.message.includes('cannot start a transaction within a transaction')) {
        logger.warn('Nested transaction detected but flag not set. Setting inTransaction flag to maintain consistency.');
        this.inTransaction = true;
        return;
      }

      // Log any other errors but don't throw them to prevent fatal errors
      // This makes beginTransaction more resilient
      logger.error(`Error starting transaction: ${error.message}`);
      logger.debug('Continuing execution despite transaction start failure');
      return;
    }
  }

  /**
   * Commit a transaction with retry for locks
   * With enhanced error handling and state recovery
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<void>}
   */
  async commit(retries = 5) {
    // Defend against commit when not connected
    if (!this.db) {
      logger.debug('No database connection, cannot commit');
      this.inTransaction = false; // Reset transaction flag
      return;
    }

    // Skip if not in transaction (according to our flag)
    if (!this.inTransaction) {
      logger.debug('No transaction in progress (according to flag), skipping commit');
      return;
    }

    try {
      // Check if a transaction is actually active in SQLite
      // This handles cases where our flag is out of sync with SQLite
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        if (!inProgressCheck || inProgressCheck.transaction_status === 0) {
          logger.warn('Transaction flag set but no actual transaction active in SQLite. Resetting flag.');
          this.inTransaction = false;
          return;
        }
      } catch (pragmaError) {
        // If we can't check (older SQLite versions), continue with commit attempt
        logger.debug('Could not check transaction status via pragma, attempting commit anyway');
      }

      // Perform the actual commit
      logger.debug('Committing SQLite transaction');
      this.db.exec('COMMIT');
      this.inTransaction = false;
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying commit in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.commit(retries - 1);
      }

      // Handle no transaction errors - important case
      if (error.message.includes('no transaction is active')) {
        logger.warn('Attempted to commit with no transaction active. Clearing inTransaction flag.');
        this.inTransaction = false;
        return;
      }

      // For commit errors, try to rollback to keep database consistent
      logger.error(`Error committing transaction: ${error.message}`);
      logger.debug('Attempting to rollback after commit failure');

      try {
        await this.rollback();
        logger.debug('Successfully rolled back transaction after commit failure');
      } catch (rollbackError) {
        logger.error(`Failed to rollback after commit error: ${rollbackError.message}`);
      }

      // Always reset transaction state to avoid inconsistency
      this.inTransaction = false;
    }
  }

  /**
   * Rollback a transaction with retry for locks
   * This method is highly defensive to ensure transaction state is always consistent
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<void>}
   */
  async rollback(retries = 5) {
    // Defend against rollback when not connected
    if (!this.db) {
      logger.debug('No database connection, cannot rollback');
      this.inTransaction = false; // Reset transaction flag
      return;
    }

    // Skip if not in transaction (according to our flag)
    if (!this.inTransaction) {
      logger.debug('No transaction in progress (according to flag), skipping rollback');
      return;
    }

    try {
      // Check if a transaction is actually active in SQLite
      // This handles cases where our flag is out of sync with SQLite
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        if (!inProgressCheck || inProgressCheck.transaction_status === 0) {
          logger.warn('Transaction flag set but no actual transaction active in SQLite. Resetting flag.');
          this.inTransaction = false;
          return;
        }
      } catch (pragmaError) {
        // If we can't check (older SQLite versions), continue with rollback attempt
        logger.debug('Could not check transaction status via pragma, attempting rollback anyway');
      }

      // Perform the actual rollback
      logger.debug('Rolling back SQLite transaction');
      this.db.exec('ROLLBACK');
      this.inTransaction = false;
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying rollback in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.rollback(retries - 1);
      }

      // Handle no transaction errors - most important case to handle
      if (error.message.includes('no transaction is active')) {
        logger.warn('Attempted to rollback with no transaction active. Clearing inTransaction flag.');
        this.inTransaction = false;
        return;
      }

      // For any other error, log it but ensure our flag is reset
      // This prevents the flag staying inconsistent with actual DB state
      logger.error(`Error rolling back transaction: ${error.message}`);
      this.inTransaction = false; // Reset the flag regardless of error
    }
  }

  /**
   * Execute a query with parameters with automatic retry for locked database
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<any>} - Query result
   */
  async run(sql, params = [], retries = 5) {
    if (!this.isConnected) await this.initialize();

    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastID: result.lastInsertRowid
      };
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.run(sql, params, retries - 1);
      }

      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`Query: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }

  /**
   * Get a single row with automatic retry for locked database
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<any>} - Row or undefined
   */
  async get(sql, params = [], retries = 5) {
    if (!this.isConnected) await this.initialize();

    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.get(sql, params, retries - 1);
      }

      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`Query: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }

  /**
   * Get multiple rows with automatic retry for locked database
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<any[]>} - Array of rows
   */
  async all(sql, params = [], retries = 5) {
    if (!this.isConnected) await this.initialize();

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked, retrying in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.all(sql, params, retries - 1);
      }

      logger.error(`Error executing query: ${error.message}`);
      logger.debug(`Query: ${sql}`);
      logger.debug(`Params: ${JSON.stringify(params)}`);
      throw error;
    }
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.isConnected = false;
      this.isInitialized = false;
      logger.debug('Database connection closed');
    }
  }
}

module.exports = new BetterSQLite();