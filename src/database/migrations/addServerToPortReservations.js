/**
 * Migration: Add Server Column to Port Reservations Table
 * Adds server_id column to track which server the reservation is for
 */

const logger = require('../../utils/logger');

const migration = {
  id: 'addServerToPortReservations',
  description: 'Add server_id column to port_reservations table',
  
  async up(db) {
    try {
      logger.info('Adding server_id column to port_reservations table...');
      
      // Check if the column already exists
      const tableInfo = await db.all("PRAGMA table_info(port_reservations)");
      const hasServerColumn = tableInfo.some(column => column.name === 'server_id');
      
      if (!hasServerColumn) {
        // Add server_id column with default value
        await db.exec(`
          ALTER TABLE port_reservations 
          ADD COLUMN server_id TEXT DEFAULT 'host'
        `);
        
        // Create index for the new column
        await db.exec(`
          CREATE INDEX IF NOT EXISTS idx_port_reservations_server_id 
          ON port_reservations (server_id)
        `);
        
        // Update the unique constraint to include server_id
        // Note: SQLite doesn't support adding constraints to existing tables,
        // so we'll create a new table and migrate data
        logger.info('Recreating table with updated constraints...');
        
        // Create new table with updated schema
        await db.exec(`
          CREATE TABLE port_reservations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            port INTEGER NOT NULL,
            container_id TEXT NOT NULL,
            protocol TEXT NOT NULL DEFAULT 'tcp',
            server_id TEXT NOT NULL DEFAULT 'host',
            expires_at TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            created_by TEXT DEFAULT 'system',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(port, protocol, server_id, container_id)
          )
        `);
        
        // Copy data from old table to new table
        await db.exec(`
          INSERT INTO port_reservations_new 
          (id, port, container_id, protocol, server_id, expires_at, metadata, created_by, created_at, updated_at)
          SELECT id, port, container_id, protocol, 'host', expires_at, metadata, created_by, created_at, updated_at
          FROM port_reservations
        `);
        
        // Drop old table
        await db.exec('DROP TABLE port_reservations');
        
        // Rename new table
        await db.exec('ALTER TABLE port_reservations_new RENAME TO port_reservations');
        
        // Recreate all indexes
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_port ON port_reservations (port)',
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_container ON port_reservations (container_id)',
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_expires ON port_reservations (expires_at)',
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_protocol ON port_reservations (protocol)',
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_server_id ON port_reservations (server_id)',
          'CREATE INDEX IF NOT EXISTS idx_port_reservations_active ON port_reservations (port, protocol, server_id, expires_at)'
        ];
        
        for (const indexSql of indexes) {
          await db.exec(indexSql);
        }
        
        logger.info('Server column added to port_reservations table successfully');
      } else {
        logger.info('Server column already exists in port_reservations table');
      }
    } catch (error) {
      logger.error(`Failed to add server column to port_reservations table: ${error.message}`);
      throw error;
    }
  },
  
  async down(db) {
    try {
      logger.info('Removing server_id column from port_reservations table...');
      
      // Create table without server_id column
      await db.exec(`
        CREATE TABLE port_reservations_old (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          port INTEGER NOT NULL,
          container_id TEXT NOT NULL,
          protocol TEXT NOT NULL DEFAULT 'tcp',
          expires_at TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_by TEXT DEFAULT 'system',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(port, protocol, container_id)
        )
      `);
      
      // Copy data back (excluding server_id)
      await db.exec(`
        INSERT INTO port_reservations_old 
        (id, port, container_id, protocol, expires_at, metadata, created_by, created_at, updated_at)
        SELECT id, port, container_id, protocol, expires_at, metadata, created_by, created_at, updated_at
        FROM port_reservations
      `);
      
      // Drop current table
      await db.exec('DROP TABLE port_reservations');
      
      // Rename old table back
      await db.exec('ALTER TABLE port_reservations_old RENAME TO port_reservations');
      
      // Recreate original indexes
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_port_reservations_port ON port_reservations (port)',
        'CREATE INDEX IF NOT EXISTS idx_port_reservations_container ON port_reservations (container_id)',
        'CREATE INDEX IF NOT EXISTS idx_port_reservations_expires ON port_reservations (expires_at)',
        'CREATE INDEX IF NOT EXISTS idx_port_reservations_protocol ON port_reservations (protocol)',
        'CREATE INDEX IF NOT EXISTS idx_port_reservations_active ON port_reservations (port, protocol, expires_at)'
      ];
      
      for (const indexSql of indexes) {
        await db.exec(indexSql);
      }
      
      logger.info('Server column removed from port_reservations table successfully');
    } catch (error) {
      logger.error(`Failed to remove server column from port_reservations table: ${error.message}`);
      throw error;
    }
  }
};

module.exports = migration;