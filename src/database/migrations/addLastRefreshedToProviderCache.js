/**
 * Migration to add last_refreshed column to dns_records table
 * This is specifically for the provider cache functionality
 */
const logger = require('../../utils/logger');

/**
 * Add last_refreshed column to dns_records table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} Success status
 */
async function addLastRefreshedToProviderCache(db) {
  try {
    logger.info('Running migration: Adding last_refreshed column to dns_records table');
    
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
    
    if (lastRefreshedExists) {
      logger.info('last_refreshed column already exists in dns_records table');
      return true;
    }
    
    // Begin transaction
    await db.beginTransaction();
    
    try {
      // Add the column
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
      
      // Create index
      await db.run(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_last_refreshed
        ON dns_records(last_refreshed)
      `);
      
      // Record migration in schema_migrations table
      await db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Get current schema version
      const currentVersion = await db.get('SELECT MAX(version) as version FROM schema_migrations');
      const newVersion = (currentVersion && currentVersion.version) ? 
        currentVersion.version + 1 : 4;
      
      // Insert migration record
      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [newVersion, 'add_last_refreshed_to_provider_cache']
      );
      
      // Commit transaction
      await db.commit();
      
      logger.info('Successfully added last_refreshed column to dns_records table');
      return true;
    } catch (error) {
      // Rollback on error
      await db.rollback();
      logger.error(`Failed to add last_refreshed column: ${error.message}`);
      throw error;
    }
  } catch (error) {
    logger.error(`Migration error: ${error.message}`);
    throw error;
  }
}

module.exports = { addLastRefreshedToProviderCache };