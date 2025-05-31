/**
 * Migration to populate settings table with initial configuration
 */
const logger = require('../../utils/logger');

module.exports = {
  name: 'populate-settings-table',
  version: 1,
  
  async up(db, repositories) {
    try {
      // Check if settings table already has entries (skip if already populated)
      const existingSettings = await repositories.setting.getAll();
      
      if (Object.keys(existingSettings).length > 1) {
        logger.info('Settings table already populated, skipping migration');
        return true;
      }
      
      logger.info('Populating settings table with initial configuration...');
      
      // Get the config manager instance to save its current state
      const { ConfigManager } = require('../../config');
      const config = new ConfigManager();
      
      // Save the configuration to database
      const result = await config.saveToDatabase();
      
      if (result.success) {
        logger.info('Successfully populated settings table with initial configuration');
        return true;
      } else {
        logger.error(`Failed to populate settings table: ${result.error}`);
        return false;
      }
    } catch (error) {
      logger.error(`Error in populate-settings-table migration: ${error.message}`);
      return false;
    }
  },
  
  async down(db, repositories) {
    // This migration doesn't need a down method as it's just populating data
    return true;
  }
};