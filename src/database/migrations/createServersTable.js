/**
 * Create Servers Table Migration
 * Creates the servers table for managing custom servers in port monitoring
 */
const logger = require('../../utils/logger');

/**
 * Create the servers table
 * @param {Object} db - Database connection
 * @returns {Promise<void>}
 */
async function createServersTable(db) {
  try {
    // Create the servers table if it doesn't exist
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL,
        description TEXT,
        isHost BOOLEAN DEFAULT 0,
        createdBy TEXT,
        createdAt TEXT NOT NULL,
        updatedBy TEXT,
        updatedAt TEXT NOT NULL
      )
    `;
    
    await db.run(createTableSql);
    
    // Create indexes for better performance
    await db.run('CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_servers_ip ON servers(ip)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_servers_isHost ON servers(isHost)');
    
    logger.info('Servers table and indexes created/verified successfully');
  } catch (error) {
    logger.error(`Failed to create servers table: ${error.message}`);
    throw error;
  }
}

/**
 * Drop the servers table (for rollback)
 * @param {Object} db - Database connection
 * @returns {Promise<void>}
 */
async function dropServersTable(db) {
  try {
    await db.run('DROP TABLE IF EXISTS servers');
    logger.info('Servers table dropped successfully');
  } catch (error) {
    logger.error(`Failed to drop servers table: ${error.message}`);
    throw error;
  }
}

module.exports = {
  up: createServersTable,
  down: dropServersTable
};