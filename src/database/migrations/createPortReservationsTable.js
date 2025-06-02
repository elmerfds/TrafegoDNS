/**
 * Migration: Create Port Reservations Table
 * Creates the table for managing port reservations with proper indexes
 */

const migration = {
  id: 'createPortReservationsTable',
  description: 'Create port_reservations table for managing port reservations',
  
  async up(db) {
    console.log('Creating port_reservations table...');
    
    // Create the port_reservations table
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS port_reservations (
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
    `;
    
    await db.exec(createTableSql);
    console.log('Port reservations table created successfully');
    
    // Create indexes for better performance
    console.log('Creating indexes...');
    
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
    
    console.log('Port reservations indexes created successfully');
  },
  
  async down(db) {
    console.log('Dropping port_reservations table...');
    
    // Drop indexes first
    const dropIndexes = [
      'DROP INDEX IF EXISTS idx_port_reservations_port',
      'DROP INDEX IF EXISTS idx_port_reservations_container',
      'DROP INDEX IF EXISTS idx_port_reservations_expires',
      'DROP INDEX IF EXISTS idx_port_reservations_protocol',
      'DROP INDEX IF EXISTS idx_port_reservations_active'
    ];
    
    for (const dropIndexSql of dropIndexes) {
      await db.exec(dropIndexSql);
    }
    
    // Drop the table
    await db.exec('DROP TABLE IF EXISTS port_reservations');
    console.log('Port reservations table dropped successfully');
  }
};

module.exports = migration;