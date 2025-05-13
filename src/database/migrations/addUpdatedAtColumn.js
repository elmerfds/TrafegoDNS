/**
 * Migration to add updated_at column to dns_records table
 * This migration will check if the column exists and add it if missing
 */
const logger = require('../../utils/logger');

/**
 * Add updated_at column to dns_records table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function addUpdatedAtColumn(db) {
  // Immediately check if migration is already recorded before any other operations
  try {
    const migrationRecord = await db.get(
      'SELECT id FROM schema_migrations WHERE name = ?',
      ['add_updated_at_column_to_dns_records']
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
  logger.info('Running migration: Add updated_at column to dns_records table');
  
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
    
    // Check if the updated_at column already exists
    const tableInfo = await db.all(`PRAGMA table_info(dns_records)`);
    const updatedAtExists = tableInfo.some(column => column.name === 'updated_at');
    
    if (updatedAtExists) {
      logger.info('updated_at column already exists in dns_records table');
      
      // Record the migration in the schema_migrations table to prevent future runs
      try {
        await db.beginTransaction();
        
        try {
          // Check if migration is already recorded (double-check in transaction)
          const checkAgain = await db.get(
            'SELECT id FROM schema_migrations WHERE name = ?',
            ['add_updated_at_column_to_dns_records']
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
            currentVersion.version + 1 : 3;
          
          // Record this migration to prevent it from running again
          await db.run(
            'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            [newVersion, 'add_updated_at_column_to_dns_records']
          );
          
          await db.commit();
          logger.info('Recorded migration in schema_migrations table');
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
      // Add the updated_at column
      await db.run(`
        ALTER TABLE dns_records
        ADD COLUMN updated_at TIMESTAMP
      `);
      
      // Update the existing records to set updated_at to tracked_at
      await db.run(`
        UPDATE dns_records
        SET updated_at = tracked_at
        WHERE updated_at IS NULL
      `);
      
      // Create an index on updated_at
      await db.run(`
        CREATE INDEX IF NOT EXISTS idx_dns_records_updated_at
        ON dns_records(updated_at)
      `);
      
      // Record the migration version (assuming schema_migrations table exists)
      const currentVersion = await db.get(
        'SELECT MAX(version) as version FROM schema_migrations'
      );
      
      const newVersion = (currentVersion && currentVersion.version) ? 
        currentVersion.version + 1 : 3;
      
      await db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [newVersion, 'add_updated_at_column_to_dns_records']
      );
      
      // Commit the transaction
      await db.commit();
      
      logger.info('Successfully added updated_at column to dns_records table');
      return true;
    } catch (error) {
      // Rollback on error
      await db.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Failed to add updated_at column: ${error.message}`);
    throw error;
  }
}

module.exports = {
  addUpdatedAtColumn
};