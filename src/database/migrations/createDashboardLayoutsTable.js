/**
 * Migration: Create dashboard_layouts table
 * Creates a table to store multiple named dashboard layouts per user
 */
const logger = require('../../utils/logger');

module.exports = {
  name: 'createDashboardLayoutsTable',
  
  async up(db) {
    logger.info('Creating dashboard_layouts table...');
    
    try {
      // Create the dashboard_layouts table
      await db.run(`
        CREATE TABLE IF NOT EXISTS dashboard_layouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name VARCHAR(100) NOT NULL,
          layout TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, name)
        )
      `);
      
      // Create index on user_id for faster queries
      await db.run(`
        CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user_id 
        ON dashboard_layouts(user_id)
      `);
      
      // Create index on is_active for faster active layout queries
      await db.run(`
        CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_active 
        ON dashboard_layouts(user_id, is_active) 
        WHERE is_active = 1
      `);
      
      logger.info('Successfully created dashboard_layouts table');
      
      // Migrate existing dashboard layouts from user_preferences if they exist
      logger.info('Migrating existing dashboard layouts from user_preferences...');
      
      const existingLayouts = await db.all(`
        SELECT 
          up.user_id,
          up.preference_value as layout,
          u.username
        FROM user_preferences up
        JOIN users u ON u.id = up.user_id
        WHERE up.preference_key = 'dashboard_layout'
      `);
      
      if (existingLayouts.length > 0) {
        for (const userLayout of existingLayouts) {
          try {
            // Insert as the default layout for each user
            await db.run(`
              INSERT INTO dashboard_layouts (user_id, name, layout, is_active, created_at, updated_at)
              VALUES (?, 'Default', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [userLayout.user_id, userLayout.layout]);
            
            logger.info(`Migrated dashboard layout for user ${userLayout.username}`);
          } catch (error) {
            logger.error(`Failed to migrate layout for user ${userLayout.user_id}: ${error.message}`);
          }
        }
        
        logger.info(`Successfully migrated ${existingLayouts.length} existing layouts`);
      } else {
        logger.info('No existing layouts to migrate');
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to create dashboard_layouts table: ${error.message}`);
      throw error;
    }
  },
  
  async down(db) {
    logger.info('Dropping dashboard_layouts table...');
    
    try {
      // Drop indexes first
      await db.run('DROP INDEX IF EXISTS idx_dashboard_layouts_active');
      await db.run('DROP INDEX IF EXISTS idx_dashboard_layouts_user_id');
      
      // Drop the table
      await db.run('DROP TABLE IF EXISTS dashboard_layouts');
      
      logger.info('Successfully dropped dashboard_layouts table');
      return true;
    } catch (error) {
      logger.error(`Failed to drop dashboard_layouts table: ${error.message}`);
      throw error;
    }
  }
};