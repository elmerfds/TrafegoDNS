/**
 * Migration: Add theme_preference column to users table
 */
const logger = require('../../utils/logger');

module.exports = {
  name: 'addThemePreference',
  version: '1.0.0',
  description: 'Add theme_preference column to users table for storing user theme preferences',

  async up(db) {
    try {
      logger.info('Adding theme_preference column to users table');

      // Check if column already exists
      const tableInfo = await db.all(`PRAGMA table_info(users)`);
      const hasThemeColumn = tableInfo.some(column => column.name === 'theme_preference');

      if (!hasThemeColumn) {
        // Add theme_preference column with default value of 'teal'
        await db.run(`
          ALTER TABLE users 
          ADD COLUMN theme_preference TEXT DEFAULT 'teal'
        `);

        logger.info('Successfully added theme_preference column to users table');
      } else {
        logger.info('theme_preference column already exists, skipping migration');
      }

      return true;
    } catch (error) {
      logger.error(`Failed to add theme_preference column: ${error.message}`);
      throw error;
    }
  },

  async down(db) {
    try {
      logger.info('Removing theme_preference column from users table');

      // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
      // First, get the current table structure
      const tableInfo = await db.all(`PRAGMA table_info(users)`);
      const hasThemeColumn = tableInfo.some(column => column.name === 'theme_preference');

      if (hasThemeColumn) {
        // Create backup table without theme_preference
        await db.run(`
          CREATE TABLE users_backup AS 
          SELECT id, username, password_hash, role, created_at, updated_at, last_login
          FROM users
        `);

        // Drop original table
        await db.run(`DROP TABLE users`);

        // Recreate original table structure
        await db.run(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            last_login TEXT
          )
        `);

        // Restore data
        await db.run(`
          INSERT INTO users (id, username, password_hash, role, created_at, updated_at, last_login)
          SELECT id, username, password_hash, role, created_at, updated_at, last_login
          FROM users_backup
        `);

        // Drop backup table
        await db.run(`DROP TABLE users_backup`);

        // Recreate indexes
        await db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
        await db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

        logger.info('Successfully removed theme_preference column from users table');
      } else {
        logger.info('theme_preference column does not exist, nothing to remove');
      }

      return true;
    } catch (error) {
      logger.error(`Failed to remove theme_preference column: ${error.message}`);
      throw error;
    }
  }
};