/**
 * Ensure orphaned_at column exists in dns_tracked_records table
 * This migration adds the orphaned_at column if it doesn't exist
 */
const logger = require('../../utils/logger');

/**
 * Run the migration
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function up(db) {
  try {
    // Check if the column already exists
    const tableInfo = await db.all(`PRAGMA table_info(dns_tracked_records)`);
    const hasOrphanedAt = tableInfo.some(col => col.name === 'orphaned_at');
    
    if (!hasOrphanedAt) {
      logger.info('Adding orphaned_at column to dns_tracked_records table');
      
      // Add the column
      await db.run(`
        ALTER TABLE dns_tracked_records 
        ADD COLUMN orphaned_at TEXT
      `);
      
      // Update existing orphaned records to have a timestamp
      const now = new Date().toISOString();
      await db.run(`
        UPDATE dns_tracked_records 
        SET orphaned_at = ? 
        WHERE is_orphaned = 1 AND orphaned_at IS NULL
      `, [now]);
      
      logger.info('Successfully added orphaned_at column to dns_tracked_records table');
      return true;
    } else {
      logger.debug('orphaned_at column already exists in dns_tracked_records table');
      
      // Even if column exists, ensure orphaned records have timestamps
      const orphanedWithoutTime = await db.get(`
        SELECT COUNT(*) as count 
        FROM dns_tracked_records 
        WHERE is_orphaned = 1 AND orphaned_at IS NULL
      `);
      
      if (orphanedWithoutTime && orphanedWithoutTime.count > 0) {
        logger.info(`Found ${orphanedWithoutTime.count} orphaned records without timestamps, updating...`);
        const now = new Date().toISOString();
        await db.run(`
          UPDATE dns_tracked_records 
          SET orphaned_at = ? 
          WHERE is_orphaned = 1 AND orphaned_at IS NULL
        `, [now]);
        logger.info(`Updated ${orphanedWithoutTime.count} orphaned records with current timestamp`);
      }
      
      return true;
    }
  } catch (error) {
    logger.error(`Failed to ensure orphaned_at column: ${error.message}`);
    throw error;
  }
}

/**
 * Rollback the migration (no-op for this migration)
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} - Success status
 */
async function down(db) {
  // We don't remove columns in down migrations for safety
  return true;
}

module.exports = {
  up,
  down,
  description: 'Ensure orphaned_at column exists in dns_tracked_records table'
};