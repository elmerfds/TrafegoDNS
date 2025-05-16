/**
 * Fix SQLite Constraints
 * A migration to fix common SQLite constraint issues
 */
const logger = require('../../utils/logger');

/**
 * Fix common SQLite constraints
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function fixSqliteConstraints(db) {
  try {
    logger.info('Running migration: Fixing SQLite constraints');
    
    // Check if necessary tables exist
    const dnsRecordsExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dns_records'
    `);
    
    const dnsTrackedRecordsExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dns_tracked_records'
    `);
    
    // Fix last_refreshed column in dns_records
    if (dnsRecordsExists) {
      // Check if last_refreshed column exists
      const tableInfo = await db.all(`PRAGMA table_info(dns_records)`);
      const lastRefreshedExists = tableInfo.some(column => column.name === 'last_refreshed');
      
      if (!lastRefreshedExists) {
        // Begin transaction to add column
        await db.beginTransaction();
        
        try {
          logger.info('Adding missing last_refreshed column to dns_records table');
          
          // Add the column
          await db.run(`
            ALTER TABLE dns_records
            ADD COLUMN last_refreshed TEXT
          `);
          
          // Set default values to prevent nulls
          const now = new Date().toISOString();
          await db.run(`
            UPDATE dns_records
            SET last_refreshed = ?
            WHERE last_refreshed IS NULL
          `, [now]);
          
          // Create index for performance
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
        // Update any null values to prevent errors
        const now = new Date().toISOString();
        
        try {
          await db.beginTransaction();
          
          const nullCount = await db.get(`
            SELECT COUNT(*) as count
            FROM dns_records
            WHERE last_refreshed IS NULL
          `);
          
          if (nullCount && nullCount.count > 0) {
            logger.info(`Fixing ${nullCount.count} null values in last_refreshed column`);
            
            await db.run(`
              UPDATE dns_records
              SET last_refreshed = ?
              WHERE last_refreshed IS NULL
            `, [now]);
          }
          
          await db.commit();
        } catch (error) {
          await db.rollback();
          logger.error(`Failed to update null values in last_refreshed column: ${error.message}`);
        }
      }
    }
    
    // Fix provider NULL constraints in dns_tracked_records
    if (dnsTrackedRecordsExists) {
      try {
        await db.beginTransaction();
        
        // Check for null provider values
        const nullProviderCount = await db.get(`
          SELECT COUNT(*) as count
          FROM dns_tracked_records
          WHERE provider IS NULL
        `);
        
        if (nullProviderCount && nullProviderCount.count > 0) {
          logger.info(`Fixing ${nullProviderCount.count} null provider values in dns_tracked_records`);
          
          // Update null provider values to 'unknown'
          await db.run(`
            UPDATE dns_tracked_records
            SET provider = 'unknown'
            WHERE provider IS NULL
          `);
          
          logger.info('Successfully fixed null provider values');
        }
        
        await db.commit();
      } catch (error) {
        await db.rollback();
        logger.error(`Failed to fix null provider values: ${error.message}`);
      }
    }
    
    // Record migration in schema_migrations table
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
        WHERE name = 'fix_sqlite_constraints'
      `);
      
      if (!migrationExists) {
        // Get current version and increment
        const currentVersion = await db.get('SELECT MAX(version) as version FROM schema_migrations');
        const newVersion = (currentVersion && currentVersion.version) ? 
          currentVersion.version + 1 : 5;
        
        // Record the migration
        await db.run(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [newVersion, 'fix_sqlite_constraints']
        );
        
        logger.info('Recorded fix_sqlite_constraints migration');
      }
      
      await db.commit();
      return true;
    } catch (error) {
      if (db.inTransaction) {
        await db.rollback();
      }
      logger.error(`Error recording migration: ${error.message}`);
      return false;
    }
  } catch (error) {
    logger.error(`Migration error: ${error.message}`);
    return false;
  }
}

module.exports = { fixSqliteConstraints };