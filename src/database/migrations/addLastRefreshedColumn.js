/**
 * Migration to add last_refreshed column to dns_records table
 * This migration will check if the column exists and add it if missing
 */
const logger = require('../../utils/logger');

// Migration counter to detect loops
let migrationAttempts = 0;
const MAX_MIGRATION_ATTEMPTS = 3;

/**
 * Add last_refreshed column to dns_records table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function addLastRefreshedColumn(db) {
  // Increment and check migration attempts to prevent infinite loops
  migrationAttempts++;
  if (migrationAttempts > MAX_MIGRATION_ATTEMPTS) {
    logger.warn(`Migration attempted ${migrationAttempts} times, exceeding limit of ${MAX_MIGRATION_ATTEMPTS}. Exiting to prevent loop.`);
    return true; // Return true to prevent further attempts
  }

  // Immediately check if migration is already recorded before any other operations
  try {
    const migrationRecord = await db.get(
      'SELECT id FROM schema_migrations WHERE name = ?',
      ['add_last_refreshed_column_to_dns_records']
    );
    
    if (migrationRecord) {
      logger.debug('Migration already applied according to schema_migrations table, skipping');
      return true; // Exit early without logging "Running migration"
    }
  } catch (checkError) {
    // If the query fails due to missing table or other issue, continue
    logger.debug(`Could not verify migration status from schema_migrations: ${checkError.message}`);
  }

  // Only log this if we're actually going to attempt the migration
  logger.info(`Running migration: Add last_refreshed column to dns_records table (attempt ${migrationAttempts}/${MAX_MIGRATION_ATTEMPTS})`);
  
  try {    
    // Check if the dns_records table exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dns_records'
    `);
    
    if (!tableExists) {
      logger.warn('dns_records table does not exist, skipping migration');
      return false;
    }
    
    // Check if the last_refreshed column already exists
    const tableInfo = await db.all(`PRAGMA table_info(dns_records)`);
    const lastRefreshedExists = tableInfo.some(column => column.name === 'last_refreshed');
    
    if (lastRefreshedExists) {
      logger.info('last_refreshed column already exists in dns_records table');
      
      // Check if schema_migrations table exists
      const migrationTableExists = await db.get(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='schema_migrations'
      `);
      
      if (!migrationTableExists) {
        logger.warn('schema_migrations table does not exist, cannot record migration');
        return true; // Return true to indicate migration is "done"
      }
      
      // Record the migration in the schema_migrations table to prevent future runs
      try {
        await db.beginTransaction();
        
        try {
          // Check if migration is already recorded (double-check in transaction)
          const checkAgain = await db.get(
            'SELECT id FROM schema_migrations WHERE name = ?',
            ['add_last_refreshed_column_to_dns_records']
          );
          
          if (checkAgain) {
            logger.debug('Migration already recorded in schema_migrations, skipping insert');
            await db.commit();
            return true;
          }
          
          // Determine the version number to use
          const currentVersion = await db.get(
            'SELECT MAX(version) as version FROM schema_migrations'
          );
          
          const newVersion = (currentVersion && currentVersion.version) ? 
            currentVersion.version + 1 : 4;
          
          // Record this migration to prevent it from running again
          await db.run(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [newVersion, 'add_last_refreshed_column_to_dns_records']
          );
          
          await db.commit();
          logger.info('Recorded migration in schema_migrations table');
          migrationAttempts = 0; // Reset counter on success
        } catch (txError) {
          await db.rollback();
          logger.warn(`Could not record migration: ${txError.message}`);
        }
      } catch (recordError) {
        logger.warn(`Error handling migration recording: ${recordError.message}`);
      }
      
      return true;
    }
    
    // Begin transaction for actual migration
    await db.beginTransaction();
    
    try {
      // Add the last_refreshed column
      await db.run(`
        ALTER TABLE dns_records
        ADD COLUMN last_refreshed TEXT
      `);
      
      // Set default value for existing records
      const now = new Date().toISOString();
      await db.run(`
        UPDATE dns_records
        SET last_refreshed = ?
        WHERE last_refreshed IS NULL
      `, [now]);
      
      // Create an index on last_refreshed
      await db.run(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_last_refreshed
        ON dns_records(last_refreshed)
      `);
      
      // Make sure schema_migrations table exists
      await db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Record the migration version
      const currentVersion = await db.get(
        'SELECT MAX(version) as version FROM schema_migrations'
      );
      
      const newVersion = (currentVersion && currentVersion.version) ? 
        currentVersion.version + 1 : 4;
      
      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [newVersion, 'add_last_refreshed_column_to_dns_records']
      );
      
      // Commit the transaction
      await db.commit();
      
      logger.info('Successfully added last_refreshed column to dns_records table');
      migrationAttempts = 0; // Reset counter on success
      return true;
    } catch (error) {
      // Rollback on error
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to add last_refreshed column: ${error.message}`);
    throw error;
  }
}

module.exports = {
  addLastRefreshedColumn
};