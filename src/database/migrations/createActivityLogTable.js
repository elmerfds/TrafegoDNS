/**
 * Create Activity Log Table Migration
 * This table stores all DNS activity events for historical tracking
 */
const logger = require('../../utils/logger');

/**
 * Create the activity_log table
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Whether the migration was successful
 */
async function createActivityLogTable(db) {
  logger.info('Creating activity_log table...');
  
  try {
    // Check if table already exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='activity_log'
    `);
    
    if (tableExists) {
      logger.info('activity_log table already exists');
      return true;
    }
    
    // Create the activity log table
    await db.run(`
      CREATE TABLE activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        recordType TEXT NOT NULL,
        hostname TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        details TEXT,
        source TEXT NOT NULL,
        provider TEXT,
        record_id TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for efficient querying
    await db.run(`CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp DESC)`);
    await db.run(`CREATE INDEX idx_activity_log_hostname ON activity_log(hostname)`);
    await db.run(`CREATE INDEX idx_activity_log_type ON activity_log(type)`);
    await db.run(`CREATE INDEX idx_activity_log_record_id ON activity_log(record_id)`);
    
    logger.info('Successfully created activity_log table and indexes');
    return true;
  } catch (error) {
    logger.error(`Failed to create activity_log table: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createActivityLogTable
};