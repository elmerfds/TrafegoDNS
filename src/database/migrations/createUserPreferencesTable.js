/**
 * Migration: Create user_preferences table
 * Creates a table for storing user-specific preferences including dashboard layouts
 */
const logger = require('../../utils/logger');

async function up(db) {
  try {
    // Create user_preferences table
    await db.run(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, preference_key)
      )
    `);

    // Create indexes
    await db.run(`CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key)`);

    logger.info('Created user_preferences table');
    return true;
  } catch (error) {
    logger.error(`Failed to create user_preferences table: ${error.message}`);
    return false;
  }
}

async function down(db) {
  try {
    await db.run('DROP TABLE IF EXISTS user_preferences');
    logger.info('Dropped user_preferences table');
    return true;
  } catch (error) {
    logger.error(`Failed to drop user_preferences table: ${error.message}`);
    return false;
  }
}

module.exports = {
  up,
  down,
  version: 11, // Increment this based on the last migration version
  description: 'Create user_preferences table for storing user-specific settings'
};