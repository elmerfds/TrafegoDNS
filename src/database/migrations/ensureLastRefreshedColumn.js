/**
 * Migration to ensure the last_refreshed column exists in dns_records table
 * This is a combined approach that both checks for and adds the column if needed,
 * and also sets a default value to prevent null errors.
 */
const logger = require('../../utils/logger');

/**
 * Ensure last_refreshed column exists and is not null in dns_records table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function ensureLastRefreshedColumn(db) {
  try {
    logger.info('Running migration: Ensuring last_refreshed column in dns_records table');
    
    // Check if the dns_records table exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dns_records'
    `);
    
    if (!tableExists) {
      logger.warn('dns_records table does not exist, skipping migration');
      return false;
    }
    
    // Check if the column already exists
    const tableInfo = await db.all(`PRAGMA table_info(dns_records)`);
    const lastRefreshedExists = tableInfo.some(column => column.name === 'last_refreshed');
    
    if (!lastRefreshedExists) {
      // Begin transaction to add the column
      await db.beginTransaction();
      
      try {
        // Add the column
        await db.run(`
          ALTER TABLE dns_records
          ADD COLUMN last_refreshed TEXT
        `);
        
        // Set default value for existing records to prevent nulls
        const now = new Date().toISOString();
        await db.run(`
          UPDATE dns_records
          SET last_refreshed = ?
          WHERE last_refreshed IS NULL
        `, [now]);
        
        // Create an index for performance
        await db.run(`
          CREATE INDEX IF NOT EXISTS idx_dns_records_lastrefreshed 
          ON dns_records(last_refreshed)
        `);
        
        await db.commit();
        logger.info('Successfully added last_refreshed column to dns_records table');
      } catch (error) {
        await db.rollback();
        logger.error(`Failed to add last_refreshed column: ${error.message}`);
        throw error;
      }
    } else {
      // Column exists, but update any null values to prevent errors
      const now = new Date().toISOString();
      await db.run(`
        UPDATE dns_records
        SET last_refreshed = ?
        WHERE last_refreshed IS NULL
      `, [now]);
      
      logger.info('last_refreshed column exists, ensured no null values');
    }
    
    // Record the migration in schema_migrations
    try {
      await db.beginTransaction();
      
      // Make sure schema_migrations table exists
      await db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Check if this migration is already recorded
      const migrationExists = await db.get(`
        SELECT id FROM schema_migrations
        WHERE name = 'ensure_last_refreshed_column'
      `);
      
      if (!migrationExists) {
        // Get current version and increment
        const currentVersion = await db.get('SELECT MAX(version) as version FROM schema_migrations');
        const newVersion = (currentVersion && currentVersion.version) ? 
          currentVersion.version + 1 : 5;
        
        // Record the migration
        await db.run(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [newVersion, 'ensure_last_refreshed_column']
        );
        
        logger.info('Recorded ensure_last_refreshed_column migration');
      }
      
      await db.commit();
      return true;
    } catch (error) {
      if (db.inTransaction) {
        await db.rollback();
      }
      logger.error(`Error recording migration: ${error.message}`);
      throw error;
    }
  } catch (error) {
    logger.error(`Migration error: ${error.message}`);
    throw error;
  }
}

module.exports = { ensureLastRefreshedColumn };