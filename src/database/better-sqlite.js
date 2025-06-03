/**
 * SQLite Implementation using better-sqlite3 module
 * This is an alternative SQLite implementation that doesn't require native compilation
 * Provides a simplified API compatible with our needs
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Static flag for global migration coordination across instances
let _GLOBAL_MIGRATING_FLAG = false;

class BetterSQLite {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.isInitialized = false;
    this.inTransaction = false;
    this.skipMigrations = false;
    this._initializing = false;
    this._migratingFlag = false;
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
    let initAttempts = 0;
    const MAX_INIT_ATTEMPTS = 3;

    // Set to track if we've already created tables in this initialization cycle
    let tablesCreated = false;

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
      
      // Check database integrity first
      const isHealthy = await this.checkIntegrity();
      if (!isHealthy) {
        logger.error('Database corruption detected');
        
        // Attempt recovery
        const recoveryNeeded = await this.attemptRecovery();
        if (recoveryNeeded === false) {
          // Recovery deleted the database file, we need to start fresh
          // Close the current corrupted connection
          if (this.db) {
            try {
              this.db.close();
            } catch (e) {
              // Ignore close errors on corrupted db
            }
            this.db = null;
          }
          
          // Open a fresh database connection
          logger.info('Creating fresh database after corruption recovery...');
          this.db = new this.SQLite(this.dbPath, { 
            verbose: process.env.DEBUG_MODE === 'true' ? logger.debug : null
          });
          
          // Continue with normal initialization
        } else {
          throw new Error('Database is corrupted and recovery failed');
        }
      }
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');
      
      // Set WAL journal mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      
      // Reasonable cache size
      this.db.pragma('cache_size = -4000');
      
      // First, try to create the tables
      // This ensures we have the basic schema in place
      if (!tablesCreated) {
        try {
          await this.createTables(5, false);
          logger.info('Database tables created successfully');
          tablesCreated = true;
        } catch (tableError) {
          logger.warn(`Error in table creation: ${tableError.message}`);
          // We'll still continue to check migrations
        }
      }
      
      // Now check if migration is necessary
      // This is separated to avoid the loop between tables and migrations
      const needsMigration = await this.checkMigration();
      
      if (needsMigration) {
        initAttempts++;
        logger.info(`Database needs migration, running migrations... (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);
        
        // Only proceed if we haven't exceeded the maximum attempts
        if (initAttempts <= MAX_INIT_ATTEMPTS) {
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
        } else {
          logger.warn(`Exceeded maximum migration attempts (${MAX_INIT_ATTEMPTS}), continuing without migration`);
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
   * Check database integrity
   * @returns {Promise<boolean>} Whether database is healthy
   */
  async checkIntegrity() {
    try {
      if (!this.db) return false;
      
      const result = this.db.prepare('PRAGMA integrity_check').get();
      
      if (result && result.integrity_check === 'ok') {
        logger.debug('Database integrity check passed');
        return true;
      }
      
      logger.error(`Database integrity check failed: ${result ? result.integrity_check : 'unknown error'}`);
      return false;
    } catch (error) {
      logger.error(`Error checking database integrity: ${error.message}`);
      return false;
    }
  }

  /**
   * Attempt to recover corrupted database
   * @returns {Promise<boolean>} Whether recovery was successful
   */
  async attemptRecovery() {
    try {
      logger.warn('Attempting database recovery...');
      
      // Create backup of corrupted database
      const backupPath = `${this.dbPath}.corrupted.${Date.now()}`;
      
      try {
        fs.copyFileSync(this.dbPath, backupPath);
        logger.info(`Created backup of corrupted database: ${backupPath}`);
      } catch (backupError) {
        logger.warn(`Could not create backup: ${backupError.message}`);
      }
      
      // Close current connection
      if (this.db) {
        try {
          this.db.close();
        } catch (closeError) {
          logger.debug(`Error closing corrupted database: ${closeError.message}`);
        }
        this.db = null;
        this.isConnected = false;
      }
      
      // Delete corrupted database
      try {
        fs.unlinkSync(this.dbPath);
        logger.info('Removed corrupted database file');
      } catch (unlinkError) {
        logger.error(`Could not remove corrupted database: ${unlinkError.message}`);
        return false;
      }
      
      // Reinitialize with fresh database
      this.isInitialized = false;
      this._initializing = false; // Reset initialization flag
      
      // We cannot reinitialize here because we're already in the initialize method
      // Instead, we'll return false to indicate recovery is needed
      // The caller should handle reinitialization
      
      logger.info('Database file removed. A fresh database will be created.');
      return false; // Return false to trigger a fresh initialization
    } catch (error) {
      logger.error(`Database recovery error: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if database needs migration
   * @returns {Promise<boolean>} Whether migration is needed
   */
  async checkMigration() {
    try {
      // First check if dns_records table exists 
      const recordsTableStmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dns_records'");
      const recordsTableResult = recordsTableStmt.get();
      
      if (!recordsTableResult) {
        logger.debug('dns_records table does not exist, will create tables first');
        return false; // Don't need migration yet, need to create tables first
      }
      
      // Check if schema_migrations table exists
      const migrationTableStmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
      const migrationTableResult = migrationTableStmt.get();
      
      if (!migrationTableResult) {
        logger.debug('schema_migrations table does not exist, will create it');
        return true;
      }
      
      // Check if the updated_at column exists in dns_records
      try {
        const tableInfo = this.db.prepare('PRAGMA table_info(dns_records)').all();
        const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
        
        if (!hasUpdatedAt) {
          // If the column doesn't exist, definitely need migration
          logger.debug('updated_at column does not exist in dns_records table, migration needed');
          return true;
        }
        
        // Check if the migration is recorded in schema_migrations
        const migrationStmt = this.db.prepare('SELECT id FROM schema_migrations WHERE name = ?');
        const updateAtMigrationResult = migrationStmt.get('add_updated_at_column_to_dns_records');
        
        if (updateAtMigrationResult) {
          logger.debug('Migration for updated_at column is already recorded in schema_migrations');
          return false; // Migration is already recorded, no need to run again
        }
        
        // Column exists but migration record is missing - need to record the migration
        logger.debug('updated_at column exists but migration record is missing, will record it');
        return true;
      } catch (pragmaError) {
        logger.warn(`Could not check table info: ${pragmaError.message}`);
      }
      
      // Check the current migration version
      const versionStmt = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations');
      const versionResult = versionStmt.get();
      const currentVersion = versionResult && versionResult.version ? versionResult.version : 0;
      
      // Compare with the latest migration version
      const latestVersion = 3; // Updated to include the updated_at column migration
      
      if (currentVersion >= latestVersion) {
        logger.debug(`Current migration version (${currentVersion}) is up to date (${latestVersion})`);
        return false;
      }
      
      logger.debug(`Current migration version (${currentVersion}) is behind latest (${latestVersion})`);
      return true;
    } catch (error) {
      logger.error(`Error checking migration status: ${error.message}`);
      // If there's an error checking migration status, assume we need migration
      // but with a warning so it's clear this is a fallback
      logger.warn('Assuming migration is needed due to error checking status');
      return true;
    }
  }

  /**
   * Run database migrations with enhanced transaction safety
   * Each operation runs in its own transaction to prevent nesting issues
   * @param {number} retries - Number of retries remaining for locked database
   * @param {number} attempts - Number of migration attempts to track infinite loops
   * @returns {Promise<void>}
   */
  async runMigrations(retries = 3, attempts = 0) {
    // If we have no database connection, fail early
    if (!this.db) {
      throw new Error('Database connection not established');
    }
    
    // Track migration attempts to prevent infinite loops
    attempts++;
    const MAX_MIGRATION_ATTEMPTS = 3;
    if (attempts > MAX_MIGRATION_ATTEMPTS) {
      logger.warn(`Migration attempt limit exceeded (${attempts}/${MAX_MIGRATION_ATTEMPTS}). Stopping to prevent infinite loop.`);
      return; // Just return, don't throw, to allow the app to continue
    }
    
    logger.info(`Starting database migration process (attempt ${attempts}/${MAX_MIGRATION_ATTEMPTS})`);
    
    // Make sure we're not already in a migration process - use static class flag
    // This prevents ANY instance from running migrations concurrently
    if (_GLOBAL_MIGRATING_FLAG) {
      logger.warn('Migration already in progress in another instance, waiting for it to complete');
      // Wait up to 10 seconds for migration to complete
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!_GLOBAL_MIGRATING_FLAG) break;
      }
      
      if (_GLOBAL_MIGRATING_FLAG) {
        // If it's still migrating after waiting, don't throw - just log and continue
        logger.warn('Migration still in progress in another instance after timeout, proceeding anyway');
        _GLOBAL_MIGRATING_FLAG = false; // Force reset the flag to prevent deadlock
      } else {
        // Migration completed while we were waiting
        logger.info('Existing migration completed while waiting');
        return;
      }
    }
    
    // CRITICAL FIX: Reset ALL transaction state before starting migrations
    // This will solve the "cannot start a transaction within a transaction" errors
    try {
      // First try with a simple rollback - this works if there's actually a transaction active
      try {
        logger.debug('Performing preliminary rollback to clear any active transactions');
        this.db.exec('ROLLBACK');
        this.inTransaction = false;
        logger.debug('Successfully rolled back existing transaction');
      } catch (prelimRollbackError) {
        // If no transaction is active, that's actually fine
        if (prelimRollbackError.message.includes('no transaction is active')) {
          logger.debug('No transaction was active, continuing with clean state');
          this.inTransaction = false;
        } else {
          // Log other errors but continue
          logger.warn(`Non-critical error in preliminary rollback: ${prelimRollbackError.message}`);
        }
      }
      
      // Next, attempt a clean BEGIN/COMMIT cycle to reset SQLite's internal state
      try {
        logger.debug('Performing a clean transaction cycle to reset SQLite state');
        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        this.db.exec('COMMIT');
        this.inTransaction = false;
        logger.debug('Clean transaction cycle completed');
      } catch (cycleError) {
        // If this fails with "cannot start a transaction within a transaction"
        // we need to be more aggressive
        if (cycleError.message.includes('cannot start a transaction within a transaction')) {
          logger.warn('SQLite believes there is still an active transaction, attempting forced cleanup');
          
          // Try a forced ROLLBACK, then a COMMIT to be thorough
          try {
            this.db.exec('ROLLBACK');
            logger.debug('Forced rollback succeeded');
          } catch (err1) {
            logger.debug(`Rollback attempt result: ${err1.message}`);
          }
          
          try {
            this.db.exec('COMMIT');
            logger.debug('Forced commit succeeded');
          } catch (err2) {
            logger.debug(`Commit attempt result: ${err2.message}`);
          }
          
          // As a last resort, try the PRAGMA to directly reset the transaction state
          try {
            this.db.exec('PRAGMA journal_mode=WAL');
            logger.debug('Reset journal mode to clear transaction state');
          } catch (pragmaError) {
            logger.debug(`PRAGMA reset attempt: ${pragmaError.message}`);
          }
        } else {
          logger.warn(`Clean transaction cycle error: ${cycleError.message}`);
        }
      }
      
      // Reset our internal transaction flag regardless
      this.inTransaction = false;
    } catch (transactionResetError) {
      logger.error(`Error during transaction state reset: ${transactionResetError.message}`);
      // Continue anyway, as we've done our best to reset
    }
    
    // Set global migration flag to prevent any other instance from migrating
    _GLOBAL_MIGRATING_FLAG = true;
    
    // Also set instance flag
    this._migratingFlag = true;
    
    try {
      // Now we're definitely not in a transaction, enforce that our flag matches
      this.inTransaction = false;
      
      // CRITICAL: We'll run each part of the migration in its own transaction
      // Rather than one big transaction, to avoid issues with nested transactions
      
      // 1. Create migrations table
      try {
        logger.debug('Creating schema_migrations table (separate transaction)');
        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        this.inTransaction = true;
        
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            name TEXT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        this.db.exec('COMMIT');
        this.inTransaction = false;
        logger.debug('Migrations table created successfully');
      } catch (tableError) {
        // Clean up transaction on error
        if (this.inTransaction) {
          try {
            this.db.exec('ROLLBACK');
          } catch (rollbackError) {
            logger.error('Error rolling back migrations table creation: ' + rollbackError.message);
          }
          this.inTransaction = false;
        }
        
        if (tableError.message.includes('database is locked') && retries > 0) {
          // If database is locked, try again after a delay
          logger.warn(`Database locked creating migrations table, retrying in 500ms (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, 500));
          this._migratingFlag = false;
          _GLOBAL_MIGRATING_FLAG = false;
          return this.runMigrations(retries - 1, attempts);
        }
        
        logger.error('Error creating migrations table: ' + tableError.message);
        throw tableError;
      }
      
      // 2. Create application tables - using a completely separate process
      try {
        logger.debug('Creating application tables (separate process)');
        // createTables will handle its own transactions
        await this.createTables(5, false);
      } catch (tablesError) {
        logger.error('Error creating application tables: ' + tablesError.message);
        throw tablesError;
      }
      
      // 3. Run the updated_at column migration
      try {
        // Double-check if we can skip this migration entirely
        try {
          // Check if the column already exists
          const tableInfo = await this.all('PRAGMA table_info(dns_records)');
          const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
          
          // Check if the migration is recorded
          const migrationRecorded = await this.get(
            'SELECT id FROM schema_migrations WHERE name = ?',
            ['add_updated_at_column_to_dns_records']
          );
          
          if (hasUpdatedAt && migrationRecorded) {
            logger.info('Updated_at column exists and migration is recorded - no migration needed');
            return; // Exit the function early, migration is complete
          }
        } catch (doubleCheckError) {
          logger.debug(`Error in migration double-check: ${doubleCheckError.message}`);
          // Continue with migration if the check fails
        }
        
        // Check if migration is already recorded
        const migrationRecorded = await this.get(
          'SELECT id FROM schema_migrations WHERE name = ?',
          ['add_updated_at_column_to_dns_records']
        );
        
        if (migrationRecorded) {
          logger.debug('add_updated_at_column_to_dns_records migration already recorded, skipping');
        } else {
          logger.debug('Running updated_at column migration (separate transaction)');
          
          // Make sure there's no active transaction
          if (this.inTransaction) {
            try {
              logger.warn('Unexpected transaction active before updated_at migration, rolling back');
              this.db.exec('ROLLBACK');
            } catch (unexpectedRollbackError) {
              logger.debug(`Unexpected rollback result: ${unexpectedRollbackError.message}`);
            }
            this.inTransaction = false;
          }
          
          // Check if the column already exists
          const tableInfo = await this.all('PRAGMA table_info(dns_records)');
          const columnExists = tableInfo.some(col => col.name === 'updated_at');
          
          if (columnExists) {
            logger.info('updated_at column already exists in dns_records table, recording migration without changes');
            
            // Just record the migration since the column exists
            try {
              await this.beginTransaction();
              
              const currentVersion = await this.get('SELECT MAX(version) as version FROM schema_migrations');
              const newVersion = (currentVersion && currentVersion.version) ? 
                currentVersion.version + 1 : 3;
              
              await this.run(
                'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
                [newVersion, 'add_updated_at_column_to_dns_records']
              );
              
              await this.commit();
              logger.info('Successfully recorded migration for existing updated_at column');
            } catch (recordError) {
              await this.rollback();
              throw recordError;
            }
          } else {
            // Run the full migration to add the column
            try {
              // Dynamically import the migration file
              const { addUpdatedAtColumn } = require('./migrations/addUpdatedAtColumn');
              
              // Create a simple db adapter for the migration
              const dbAdapter = {
                get: (...args) => this.get(...args),
                all: (...args) => this.all(...args),
                run: (...args) => this.run(...args),
                beginTransaction: () => this.beginTransaction(),
                commit: () => this.commit(),
                rollback: () => this.rollback()
              };
              
              // Run the updated_at column migration
              await addUpdatedAtColumn(dbAdapter);
              
              // Run the last_refreshed column migration
              try {
                // Dynamically import the migration file
                const { addLastRefreshedColumn } = require('./migrations/addLastRefreshedColumn');
                await addLastRefreshedColumn(dbAdapter);
              } catch (lastRefreshedError) {
                logger.error(`Failed to run last_refreshed column migration: ${lastRefreshedError.message}`);
                throw lastRefreshedError;
              }
            } catch (migrationError) {
              logger.error(`Failed to run updated_at column migration: ${migrationError.message}`);
              throw migrationError;
            }
          }
        }
      } catch (versionError) {
        // Clean up transaction on error
        if (this.inTransaction) {
          try {
            this.db.exec('ROLLBACK');
          } catch (rollbackError) {
            logger.error('Error rolling back after migration error: ' + rollbackError.message);
          }
          this.inTransaction = false;
        }
        
        logger.error('Error during migrations: ' + versionError.message);
        throw versionError;
      }
      
      // 4. Record the migration version if needed
      try {
        logger.debug('Recording migration version (separate transaction)');
        // CRITICAL FIX: Verify transaction state before starting a new one
        if (this.inTransaction) {
          try {
            logger.warn('Unexpected transaction active before version recording, rolling back');
            this.db.exec('ROLLBACK');
          } catch (unexpectedRollbackError) {
            logger.debug(`Unexpected rollback result: ${unexpectedRollbackError.message}`);
          }
          this.inTransaction = false;
        }
        
        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        this.inTransaction = true;
        
        // Get current max version
        const versionStmt = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations');
        const versionResult = versionStmt.get();
        const currentVersion = versionResult && versionResult.version ? versionResult.version : 0;
        
        // Insert version 2 if needed
        if (currentVersion < 2) {
          try {
            const stmt = this.db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
            stmt.run(2, 'add_last_processed_and_managed_columns');
            logger.debug('Recorded migration version 2');
          } catch (recordError) {
            if (recordError.message.includes('UNIQUE constraint failed')) {
              logger.info('Migration version 2 already recorded, skipping');
            } else {
              throw recordError;
            }
          }
        }
        
        this.db.exec('COMMIT');
        this.inTransaction = false;
        logger.debug('Migration version recording completed successfully');
      } catch (versionError) {
        // Clean up transaction on error
        if (this.inTransaction) {
          try {
            this.db.exec('ROLLBACK');
          } catch (rollbackError) {
            logger.error('Error rolling back version recording: ' + rollbackError.message);
          }
          this.inTransaction = false;
        }
        
        logger.error('Error recording migration version: ' + versionError.message);
        throw versionError;
      }
      
      // Final check to see if the migration was successful
      try {
        const columnExists = await this.get(`PRAGMA table_info(dns_records)`).then(
          result => result && result.some(col => col.name === 'updated_at')
        );
        
        const migrationRecorded = await this.get(
          'SELECT id FROM schema_migrations WHERE name = ?',
          ['add_updated_at_column_to_dns_records']
        );
        
        if (columnExists && !migrationRecorded && attempts < MAX_MIGRATION_ATTEMPTS) {
          logger.warn('Column exists but migration not recorded, will retry migration process');
          
          // Clear flags and try again
          this._migratingFlag = false;
          _GLOBAL_MIGRATING_FLAG = false;
          
          // Small delay to let things settle
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Try again with incremented attempts
          return this.runMigrations(retries, attempts);
        }
      } catch (finalCheckError) {
        logger.debug(`Error in final migration check: ${finalCheckError.message}`);
      }
      
      logger.info('Database migrations completed successfully');
    } catch (migrationError) {
      // Ensure any transaction is rolled back on error
      if (this.inTransaction) {
        try {
          logger.debug('Rolling back any active transaction after migration error');
          this.db.exec('ROLLBACK');
          this.inTransaction = false;
        } catch (rollbackError) {
          logger.error('Error rolling back after migration error: ' + rollbackError.message);
          this.inTransaction = false;
        }
      }
      
      // Log and rethrow the original error
      logger.error(`Error running migrations: ${migrationError.message}`);
      throw migrationError;
    } finally {
      // Always clear the migration flags
      this._migratingFlag = false;
      _GLOBAL_MIGRATING_FLAG = false;
      
      // Make absolutely sure we're not left in a transaction state
      if (this.inTransaction) {
        try {
          logger.warn('Forcing transaction rollback in finally block');
          this.db.exec('ROLLBACK');
          this.inTransaction = false;
        } catch (finalRollbackError) {
          logger.error('Error in final forced rollback: ' + finalRollbackError.message);
          this.inTransaction = false;
        }
      }
    }
  }

  /**
   * Create database tables with retry for locks
   * @param {number} retries - Number of retries remaining
   * @param {boolean} alreadyInTransaction - Whether we're already in a transaction (avoids checks)
   * @returns {Promise<void>}
   */
  async createTables(retries = 5, alreadyInTransaction = false) {
    try {
      // Check transaction state
      if (alreadyInTransaction) {
        // Trust the caller about transaction state
        logger.debug('Using existing transaction for createTables (external flag)');
        this.inTransaction = true;
      } else if (this.inTransaction) {
        // Using our internal flag
        logger.debug('Transaction already in progress during createTables (internal flag)');
      } else {
        // Begin transaction if needed
        try {
          logger.debug('Starting new transaction for createTables');
          this.db.exec('BEGIN IMMEDIATE TRANSACTION');
          this.inTransaction = true;
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
          content TEXT,
          ttl INTEGER,
          proxied INTEGER DEFAULT 0,
          tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_processed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_orphaned INTEGER DEFAULT 0,
          orphaned_at TIMESTAMP,
          fingerprint TEXT,
          managed INTEGER DEFAULT 0,
          updated_at TIMESTAMP,
          last_refreshed TEXT,
          UNIQUE(provider, record_id)
        )
      `, 'dns_records table');
      
      // Check if this is a new table creation with the latest schema (including updated_at column)
      try {
        // First check if dns_records table exists and has updated_at column
        const tableInfo = await this.all('PRAGMA table_info(dns_records)');
        const hasUpdatedAt = tableInfo && tableInfo.some(col => col.name === 'updated_at');
        
        if (hasUpdatedAt) {
          logger.debug('New tables created with updated_at column, ensuring migrations are recorded');
          
          // Make sure schema_migrations table exists
          try {
            await this.run(`
              CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                name TEXT NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
          } catch (createError) {
            logger.debug(`Error creating schema_migrations table: ${createError.message}`);
          }
          
          // Check if migrations are already recorded
          const migrationsRecorded = await this.get(`
            SELECT COUNT(*) as count FROM schema_migrations 
            WHERE name = 'add_updated_at_column_to_dns_records'
          `);
          
          // Only record migrations if they haven't been recorded yet
          if (!migrationsRecorded || migrationsRecorded.count === 0) {
            logger.info('Recording all migrations for dns_records since table was created with latest schema');
            
            try {
              // Use a transaction for this to ensure atomicity
              await this.beginTransaction();
              
              // Record all migrations up to current version (3) using our safer run method
              await this.run(
                'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
                [1, 'initial_schema']
              );
              
              await this.run(
                'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
                [2, 'add_last_processed_and_managed_columns']
              );
              
              await this.run(
                'INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)',
                [3, 'add_updated_at_column_to_dns_records']
              );
              
              await this.commit();
              logger.info('All migrations recorded for newly created tables - migration system will be skipped');
            } catch (migrationRecordError) {
              await this.rollback();
              logger.debug(`Error recording migrations: ${migrationRecordError.message}`);
            }
          } else {
            logger.debug('Migrations already recorded in schema_migrations table');
          }
        } else {
          logger.debug('Tables created but updated_at column not found - migrations will still be needed');
        }
      } catch (checkError) {
        logger.debug(`Error checking table state: ${checkError.message}`);
      }

      // Create indexes for dns_records
      await execWithRetry(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_provider ON dns_records(provider);
        CREATE INDEX IF NOT EXISTS idx_dns_records_name ON dns_records(name);
        CREATE INDEX IF NOT EXISTS idx_dns_records_is_orphaned ON dns_records(is_orphaned);
        CREATE INDEX IF NOT EXISTS idx_dns_records_lastrefresh ON dns_records(last_refreshed);
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
          last_login TIMESTAMP,
          theme_preference TEXT DEFAULT 'teal'
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
      if (!alreadyInTransaction) {
        if (!this.inTransaction) {
          logger.warn('Transaction flag inconsistency in createTables - attempting to recover');
          
          // First, check if there's actually a transaction in progress in SQLite
          try {
            const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
            if (inProgressCheck && inProgressCheck.transaction_status > 0) {
              logger.info('Found active transaction despite flag mismatch, committing');
              this.db.exec('COMMIT');
              logger.info('Database tables created successfully');
              return;
            } else {
              logger.info('No active transaction found, continuing without commit');
              return;
            }
          } catch (pragmaError) {
            logger.debug(`Could not check transaction status: ${pragmaError.message}`);
            
            // Try best effort commit - this will either succeed or fail with "no transaction active"
            try {
              this.db.exec('COMMIT');
              logger.info('Commit succeeded despite transaction flag mismatch');
            } catch (commitAttemptError) {
              // If no transaction active, that's fine
              if (commitAttemptError.message.includes('no transaction is active')) {
                logger.debug('No transaction was active, continuing');
              } else {
                // For other errors, log but don't throw to avoid breaking initialization
                logger.warn(`Non-critical error during commit attempt: ${commitAttemptError.message}`);
              }
            }
          }
        } else {
          // Commit transaction safely
          try {
            this.db.exec('COMMIT');
            this.inTransaction = false;
            logger.info('Database tables created successfully');
          } catch (commitError) {
            // If commit fails due to a lock, retry it
            if (commitError.message.includes('database is locked') && retries > 0) {
              logger.debug(`Database locked while committing table creation, retrying in 200ms (${retries} retries left)...`);
              await new Promise(resolve => setTimeout(resolve, 200));
              // Just retry the commit, as tables are already created
              this.db.exec('COMMIT');
              this.inTransaction = false;
              return;
            }
            // If commit fails for other reasons, log and rethrow
            logger.error(`Failed to commit table creation: ${commitError.message}`);
            throw commitError;
          }
        }
      }
    } catch (error) {
      // Only rollback if we started the transaction and not alreadyInTransaction
      if (this.inTransaction && !alreadyInTransaction) {
        // Rollback transaction safely
        try {
          this.db.exec('ROLLBACK');
          this.inTransaction = false;
        } catch (rollbackError) {
          // If rollback fails, just log - we've done what we can
          logger.error(`Failed to rollback after table creation error: ${rollbackError.message}`);
          this.inTransaction = false;
        }
      }

      // If error is a database locked error and we have retries left, retry the whole operation
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`Database locked during table creation, retrying entire operation in 500ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.createTables(retries - 1, alreadyInTransaction);
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
    const txId = Math.floor(Math.random() * 10000); // Generate a transaction ID for logging
    logger.debug(`[TX-${txId}] Begin transaction requested. Current state: inTransaction=${this.inTransaction}`);
    
    // Make sure we're connected first
    if (!this.isConnected) {
      try {
        logger.debug(`[TX-${txId}] Database not connected, initializing first`);
        await this.initialize();
      } catch (initError) {
        logger.error(`[TX-${txId}] Failed to initialize database before transaction: ${initError.message}`);
        throw initError;
      }
    }
    
    // Check our transaction flag first
    if (this.inTransaction) {
      logger.debug(`[TX-${txId}] Transaction flag already set, skipping beginTransaction`);
      return;
    }

    // Check if a transaction is already active in SQLite itself
    // This handles cases where the flag doesn't match the actual DB state
    try {
      let transactionActive = false;
      
      // First try using PRAGMA to check transaction status
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        if (inProgressCheck && inProgressCheck.transaction_status > 0) {
          transactionActive = true;
          logger.warn(`[TX-${txId}] Transaction active in SQLite but flag not set. Setting inTransaction flag.`);
          this.inTransaction = true;
          
          // Log details about the existing transaction
          try {
            const journalMode = this.db.prepare("PRAGMA journal_mode").get();
            logger.debug(`[TX-${txId}] Current journal mode: ${JSON.stringify(journalMode)}`);
          } catch (err) {
            // Non-critical, just for debugging
          }
          
          return;
        } else {
          logger.debug(`[TX-${txId}] PRAGMA check shows no active transaction`);
        }
      } catch (pragmaError) {
        // If pragma check fails (older SQLite versions), try an alternative test
        logger.debug(`[TX-${txId}] Could not check via PRAGMA (${pragmaError.message}), trying alternative method`);
        
        try {
          // Try a dummy BEGIN/ROLLBACK to test if a transaction exists
          this.db.exec('BEGIN IMMEDIATE TRANSACTION');
          this.db.exec('ROLLBACK');
          logger.debug(`[TX-${txId}] Alternative test confirms no active transaction`);
          transactionActive = false;
        } catch (testError) {
          if (testError.message.includes('cannot start a transaction within a transaction')) {
            logger.warn(`[TX-${txId}] Alternative test found existing transaction`);
            transactionActive = true;
            this.inTransaction = true;
            return;
          }
        }
      }
      
      if (!transactionActive) {
        // Start the transaction
        logger.debug(`[TX-${txId}] Starting new SQLite transaction (no active transaction detected)`);
        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        this.inTransaction = true;
        logger.debug(`[TX-${txId}] Transaction successfully started`);
      }
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`[TX-${txId}] Database locked, retrying beginTransaction in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.beginTransaction(retries - 1);
      }

      // Handle nested transaction errors - CRITICAL CASE
      if (error.message.includes('cannot start a transaction within a transaction')) {
        logger.warn(`[TX-${txId}] Nested transaction detected but flag not set. Setting inTransaction flag.`);
        this.inTransaction = true;
        return;
      }

      // Log any other errors but don't throw them to prevent fatal errors
      // This makes beginTransaction more resilient
      logger.error(`[TX-${txId}] Error starting transaction: ${error.message}`);
      logger.debug(`[TX-${txId}] Continuing execution despite transaction start failure`);
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
    const txId = Math.floor(Math.random() * 10000); // Generate a transaction ID for logging
    logger.debug(`[TX-${txId}] Commit requested. Current state: inTransaction=${this.inTransaction}`);
    
    // Defend against commit when not connected
    if (!this.db) {
      logger.debug(`[TX-${txId}] No database connection, cannot commit`);
      this.inTransaction = false; // Reset transaction flag
      return;
    }

    // Skip if not in transaction (according to our flag)
    if (!this.inTransaction) {
      logger.debug(`[TX-${txId}] No transaction in progress (according to flag), skipping commit`);
      return;
    }

    try {
      // Check if a transaction is actually active in SQLite
      // This handles cases where our flag is out of sync with SQLite
      let transactionActive = true; // Default to assuming active
      
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        logger.debug(`[TX-${txId}] PRAGMA transaction_status: ${JSON.stringify(inProgressCheck)}`);
        
        if (!inProgressCheck || inProgressCheck.transaction_status === 0) {
          transactionActive = false;
          logger.warn(`[TX-${txId}] Transaction flag set but no actual transaction active in SQLite. Resetting flag.`);
          this.inTransaction = false;
          return;
        } else {
          logger.debug(`[TX-${txId}] Verified active transaction via PRAGMA`);
        }
      } catch (pragmaError) {
        // If PRAGMA fails, try alternative verification
        logger.debug(`[TX-${txId}] Could not check via PRAGMA (${pragmaError.message}), using alternative verification`);
        
        // Try to detect transaction status indirectly
        try {
          // If we can start a transaction, there isn't one active
          this.db.exec('BEGIN IMMEDIATE TRANSACTION');
          this.db.exec('ROLLBACK'); 
          transactionActive = false;
          logger.warn(`[TX-${txId}] Successfully started test transaction - no real transaction was active despite flag. Resetting flag.`);
          this.inTransaction = false;
          return;
        } catch (testError) {
          if (testError.message.includes('cannot start a transaction within a transaction')) {
            // This confirms a transaction is active
            transactionActive = true;
            logger.debug(`[TX-${txId}] Confirmed active transaction via alternative test`);
          } else {
            // Some other error, assume we can proceed
            logger.debug(`[TX-${txId}] Alternative test had error: ${testError.message}, proceeding with commit`);
          }
        }
      }

      if (transactionActive) {
        // Perform the actual commit
        logger.debug(`[TX-${txId}] Committing SQLite transaction`);
        this.db.exec('COMMIT');
        this.inTransaction = false;
        logger.debug(`[TX-${txId}] Successfully committed transaction`);
      }
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`[TX-${txId}] Database locked, retrying commit in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.commit(retries - 1);
      }

      // Handle no transaction errors - important case
      if (error.message.includes('no transaction is active')) {
        logger.warn(`[TX-${txId}] Attempted to commit with no transaction active. Clearing inTransaction flag.`);
        this.inTransaction = false;
        return;
      }

      // For commit errors, try to rollback to keep database consistent
      logger.error(`[TX-${txId}] Error committing transaction: ${error.message}`);
      logger.debug(`[TX-${txId}] Attempting to rollback after commit failure`);
      
      try {
        await this.rollback();
        logger.debug(`[TX-${txId}] Successfully rolled back transaction after commit failure`);
      } catch (rollbackError) {
        logger.error(`[TX-${txId}] Failed to rollback after commit error: ${rollbackError.message}`);
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
    const txId = Math.floor(Math.random() * 10000); // Generate a transaction ID for logging
    logger.debug(`[TX-${txId}] Rollback requested. Current state: inTransaction=${this.inTransaction}`);
    
    // Defend against rollback when not connected
    if (!this.db) {
      logger.debug(`[TX-${txId}] No database connection, cannot rollback`);
      this.inTransaction = false; // Reset transaction flag
      return;
    }

    // Skip if not in transaction (according to our flag)
    if (!this.inTransaction) {
      logger.debug(`[TX-${txId}] No transaction in progress (according to flag), skipping rollback`);
      return;
    }

    try {
      // Check if a transaction is actually active in SQLite 
      // This handles cases where our flag is out of sync with SQLite
      let transactionActive = true; // Default to assuming active
      
      try {
        const inProgressCheck = this.db.prepare("PRAGMA transaction_status").get();
        logger.debug(`[TX-${txId}] PRAGMA transaction_status: ${JSON.stringify(inProgressCheck)}`);
        
        if (!inProgressCheck || inProgressCheck.transaction_status === 0) {
          transactionActive = false;
          logger.warn(`[TX-${txId}] Transaction flag set but no actual transaction active in SQLite. Resetting flag.`);
          this.inTransaction = false;
          return;
        } else {
          logger.debug(`[TX-${txId}] Verified active transaction via PRAGMA`);
        }
      } catch (pragmaError) {
        // If PRAGMA fails, try alternative verification
        logger.debug(`[TX-${txId}] Could not check via PRAGMA (${pragmaError.message}), using alternative verification`);
        
        // Try to detect transaction status indirectly
        try {
          // If we can start a transaction, there isn't one active
          this.db.exec('BEGIN IMMEDIATE TRANSACTION');
          this.db.exec('ROLLBACK'); 
          transactionActive = false;
          logger.warn(`[TX-${txId}] Successfully started test transaction - no real transaction was active despite flag. Resetting flag.`);
          this.inTransaction = false;
          return;
        } catch (testError) {
          if (testError.message.includes('cannot start a transaction within a transaction')) {
            // This confirms a transaction is active
            transactionActive = true;
            logger.debug(`[TX-${txId}] Confirmed active transaction via alternative test`);
          } else {
            // Some other error, assume we can proceed
            logger.debug(`[TX-${txId}] Alternative test had error: ${testError.message}, proceeding with rollback`);
          }
        }
      }

      if (transactionActive) {
        // Perform the actual rollback
        logger.debug(`[TX-${txId}] Rolling back SQLite transaction`);
        this.db.exec('ROLLBACK');
        this.inTransaction = false;
        logger.debug(`[TX-${txId}] Successfully rolled back transaction`);
      }
    } catch (error) {
      // Handle database locked errors with retries
      if (error.message.includes('database is locked') && retries > 0) {
        logger.debug(`[TX-${txId}] Database locked, retrying rollback in 200ms (${retries} retries left)...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return this.rollback(retries - 1);
      }

      // Handle no transaction errors - most important case to handle
      if (error.message.includes('no transaction is active')) {
        logger.warn(`[TX-${txId}] Attempted to rollback with no transaction active. Clearing inTransaction flag.`);
        this.inTransaction = false;
        return;
      }

      // For any other error, log it but ensure our flag is reset
      // This prevents the flag staying inconsistent with actual DB state
      logger.error(`[TX-${txId}] Error rolling back transaction: ${error.message}`);
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

      // Check for database corruption
      if (error.message.includes('database disk image is malformed')) {
        logger.error('Database corruption detected during query execution');
        
        // Attempt recovery
        const recovered = await this.attemptRecovery();
        if (!recovered) {
          // Recovery failed or needs reinitialization
          logger.warn('Database recovery initiated. Application restart may be required.');
          
          // Try to reinitialize the database module
          try {
            const dbModule = require('./index');
            await dbModule.reinitializeAfterRecovery();
          } catch (reinitError) {
            logger.error(`Failed to reinitialize database module: ${reinitError.message}`);
          }
        }
        
        throw new Error('Database corruption detected. Recovery attempted. Please retry the operation.');
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

      // Check for database corruption
      if (error.message.includes('database disk image is malformed')) {
        logger.error('Database corruption detected during query execution');
        
        // Attempt recovery
        const recovered = await this.attemptRecovery();
        if (!recovered) {
          // Recovery failed or needs reinitialization
          logger.warn('Database recovery initiated. Application restart may be required.');
          
          // Try to reinitialize the database module
          try {
            const dbModule = require('./index');
            await dbModule.reinitializeAfterRecovery();
          } catch (reinitError) {
            logger.error(`Failed to reinitialize database module: ${reinitError.message}`);
          }
        }
        
        throw new Error('Database corruption detected. Recovery attempted. Please retry the operation.');
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

      // Check for database corruption
      if (error.message.includes('database disk image is malformed')) {
        logger.error('Database corruption detected during query execution');
        
        // Attempt recovery
        const recovered = await this.attemptRecovery();
        if (!recovered) {
          // Recovery failed or needs reinitialization
          logger.warn('Database recovery initiated. Application restart may be required.');
          
          // Try to reinitialize the database module
          try {
            const dbModule = require('./index');
            await dbModule.reinitializeAfterRecovery();
          } catch (reinitError) {
            logger.error(`Failed to reinitialize database module: ${reinitError.message}`);
          }
        }
        
        throw new Error('Database corruption detected. Recovery attempted. Please retry the operation.');
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