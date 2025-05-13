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
      logger.info('updated_at column already exists, skipping migration');
      return true;
    }
    
    // Begin transaction
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