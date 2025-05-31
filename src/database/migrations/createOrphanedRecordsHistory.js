/**
 * Create Orphaned Records History Table Migration
 * This table preserves records of all orphaned DNS entries for historical tracking
 */
const logger = require('../../utils/logger');

/**
 * Create the orphaned_records_history table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Whether the migration was successful
 */
async function createOrphanedRecordsHistory(db) {
  logger.info('Creating orphaned_records_history table...');
  
  try {
    // Check if table already exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='orphaned_records_history'
    `);
    
    if (tableExists) {
      logger.info('orphaned_records_history table already exists');
      return true;
    }
    
    // Create the history table
    await db.run(`
      CREATE TABLE orphaned_records_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        record_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT,
        ttl INTEGER,
        proxied INTEGER DEFAULT 0,
        orphaned_at TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        grace_period_seconds INTEGER,
        deletion_reason TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for efficient querying
    await db.run(`CREATE INDEX idx_orphaned_history_name ON orphaned_records_history(name)`);
    await db.run(`CREATE INDEX idx_orphaned_history_orphaned ON orphaned_records_history(orphaned_at)`);
    await db.run(`CREATE INDEX idx_orphaned_history_deleted ON orphaned_records_history(deleted_at)`);
    await db.run(`CREATE INDEX idx_orphaned_history_provider ON orphaned_records_history(provider)`);
    
    logger.info('Successfully created orphaned_records_history table and indexes');
    return true;
  } catch (error) {
    logger.error(`Failed to create orphaned_records_history table: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createOrphanedRecordsHistory
};