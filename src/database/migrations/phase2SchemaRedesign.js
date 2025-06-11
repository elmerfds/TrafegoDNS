/**
 * Phase 2 Database Schema Redesign Migration
 * Implements foreign key constraints, indexing, and data normalization
 */

const logger = require('../../utils/logger');

/**
 * Phase 2 Schema Redesign Migration
 * This migration implements:
 * 1. Foreign key constraints between tables
 * 2. Standardized timestamp columns
 * 3. Performance indexes
 * 4. Data consistency triggers
 * 5. Cascade delete rules
 */
async function up(db) {
  logger.info('Starting Phase 2 database schema redesign migration...');

  try {
    // First, create the servers table if it doesn't exist (it should from Phase 1)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL,
        description TEXT,
        isHost BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create a default localhost server entry if none exists
    const existingServers = db.prepare('SELECT COUNT(*) as count FROM servers').get();
    if (existingServers.count === 0) {
      db.prepare(`
        INSERT INTO servers (name, ip, description, isHost)
        VALUES ('localhost', '127.0.0.1', 'Local host server', 1)
      `).run();
      logger.info('Created default localhost server entry');
    }

    // Step 1: Add server_id column to ports table (if not exists)
    logger.info('Adding server_id column to ports table...');
    
    // Check if column exists
    const portsColumns = db.prepare(`PRAGMA table_info(ports)`).all();
    const hasServerId = portsColumns.some(col => col.name === 'server_id');
    
    if (!hasServerId) {
      await db.exec(`
        ALTER TABLE ports ADD COLUMN server_id TEXT;
      `);
      
      // Update existing records to reference localhost server
      const localhostServer = db.prepare('SELECT id FROM servers WHERE isHost = 1 LIMIT 1').get();
      if (localhostServer) {
        db.prepare('UPDATE ports SET server_id = ? WHERE server_id IS NULL').run(localhostServer.id);
        logger.info('Updated existing ports to reference localhost server');
      }
    }

    // Step 2: Create new normalized ports table with proper structure
    logger.info('Creating new normalized ports table...');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ports_new (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        server_id TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        status TEXT NOT NULL DEFAULT 'unknown',
        service_name TEXT,
        service_version TEXT,
        alternative_service_name TEXT,
        source TEXT DEFAULT 'system',
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
        scan_count INTEGER DEFAULT 1,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        UNIQUE(server_id, port, protocol)
      );
    `);

    // Step 3: Migrate data from old ports table to new structure
    logger.info('Migrating data to new ports table structure...');
    
    // Check if old ports table exists and has data
    try {
      const oldPorts = db.prepare('SELECT COUNT(*) as count FROM ports').get();
      if (oldPorts.count > 0) {
        // Get localhost server ID for migration
        const localhostServer = db.prepare('SELECT id FROM servers WHERE isHost = 1 LIMIT 1').get();
        
        if (localhostServer) {
          await db.exec(`
            INSERT OR IGNORE INTO ports_new (
              server_id, port, protocol, status, service_name, service_version,
              alternative_service_name, source, last_seen, first_detected,
              scan_count, metadata, created_at, updated_at
            )
            SELECT 
              '${localhostServer.id}' as server_id,
              port,
              COALESCE(protocol, 'tcp') as protocol,
              COALESCE(status, 'unknown') as status,
              service_name,
              service_version,
              alternative_service_name,
              COALESCE(source, 'system') as source,
              COALESCE(last_seen, CURRENT_TIMESTAMP) as last_seen,
              COALESCE(first_detected, CURRENT_TIMESTAMP) as first_detected,
              COALESCE(scan_count, 1) as scan_count,
              metadata,
              COALESCE(created_at, CURRENT_TIMESTAMP) as created_at,
              COALESCE(updated_at, CURRENT_TIMESTAMP) as updated_at
            FROM ports
            WHERE port IS NOT NULL;
          `);
          logger.info('Migrated existing port data to new structure');
        }
      }
    } catch (error) {
      logger.warn('Old ports table does not exist or migration failed:', error.message);
    }

    // Step 4: Replace old ports table with new one
    await db.exec('DROP TABLE IF EXISTS ports_old');
    await db.exec('ALTER TABLE ports RENAME TO ports_old');
    await db.exec('ALTER TABLE ports_new RENAME TO ports');
    logger.info('Replaced ports table with new normalized structure');

    // Step 5: Update port_reservations table to add proper foreign keys
    logger.info('Updating port_reservations table...');
    
    await db.exec(`
      CREATE TABLE IF NOT EXISTS port_reservations_new (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        port_id TEXT,
        server_id TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        container_id TEXT NOT NULL,
        container_name TEXT,
        reserved_by TEXT,
        reserved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        released_at DATETIME,
        duration_seconds INTEGER DEFAULT 3600,
        status TEXT DEFAULT 'active',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE SET NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
    `);

    // Migrate existing reservations
    try {
      const oldReservations = db.prepare('SELECT COUNT(*) as count FROM port_reservations').get();
      if (oldReservations.count > 0) {
        const localhostServer = db.prepare('SELECT id FROM servers WHERE isHost = 1 LIMIT 1').get();
        
        if (localhostServer) {
          await db.exec(`
            INSERT OR IGNORE INTO port_reservations_new (
              server_id, port, protocol, container_id, container_name,
              reserved_by, reserved_at, expires_at, released_at,
              duration_seconds, status, metadata, created_at, updated_at
            )
            SELECT 
              '${localhostServer.id}' as server_id,
              port,
              COALESCE(protocol, 'tcp') as protocol,
              container_id,
              container_name,
              reserved_by,
              COALESCE(reserved_at, CURRENT_TIMESTAMP) as reserved_at,
              expires_at,
              released_at,
              COALESCE(duration_seconds, 3600) as duration_seconds,
              COALESCE(status, 'active') as status,
              metadata,
              COALESCE(created_at, CURRENT_TIMESTAMP) as created_at,
              COALESCE(updated_at, CURRENT_TIMESTAMP) as updated_at
            FROM port_reservations;
          `);
          
          // Update port_id references where possible
          await db.exec(`
            UPDATE port_reservations_new 
            SET port_id = (
              SELECT p.id 
              FROM ports p 
              WHERE p.server_id = port_reservations_new.server_id 
                AND p.port = port_reservations_new.port 
                AND p.protocol = port_reservations_new.protocol
              LIMIT 1
            )
            WHERE port_id IS NULL;
          `);
          
          logger.info('Migrated existing reservation data');
        }
      }
    } catch (error) {
      logger.warn('Port reservations migration failed:', error.message);
    }

    // Replace reservations table
    await db.exec('DROP TABLE IF EXISTS port_reservations_old');
    await db.exec('ALTER TABLE port_reservations RENAME TO port_reservations_old');
    await db.exec('ALTER TABLE port_reservations_new RENAME TO port_reservations');

    // Step 6: Create other related tables with proper structure
    logger.info('Creating/updating related tables...');

    // Port alerts table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS port_alerts (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        port_id TEXT,
        server_id TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        title TEXT NOT NULL,
        description TEXT,
        acknowledged BOOLEAN DEFAULT 0,
        acknowledged_by TEXT,
        acknowledged_at DATETIME,
        resolved BOOLEAN DEFAULT 0,
        resolved_at DATETIME,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
    `);

    // Port scans table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS port_scans (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        server_id TEXT NOT NULL,
        scan_type TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'pending',
        host TEXT NOT NULL,
        port_range TEXT,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        ports_discovered INTEGER DEFAULT 0,
        ports_changed INTEGER DEFAULT 0,
        scan_duration INTEGER,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        created_by TEXT,
        results TEXT,
        error_message TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );
    `);

    // Step 7: Create performance indexes
    logger.info('Creating performance indexes...');
    
    const indexes = [
      // Ports table indexes
      'CREATE INDEX IF NOT EXISTS idx_ports_server_id ON ports(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_ports_port_protocol ON ports(port, protocol)',
      'CREATE INDEX IF NOT EXISTS idx_ports_status ON ports(status)',
      'CREATE INDEX IF NOT EXISTS idx_ports_last_seen ON ports(last_seen)',
      'CREATE INDEX IF NOT EXISTS idx_ports_service_name ON ports(service_name)',
      'CREATE INDEX IF NOT EXISTS idx_ports_source ON ports(source)',
      
      // Port reservations indexes
      'CREATE INDEX IF NOT EXISTS idx_reservations_server_id ON port_reservations(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_port_id ON port_reservations(port_id)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_container_id ON port_reservations(container_id)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_status ON port_reservations(status)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON port_reservations(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_reservations_port_protocol ON port_reservations(port, protocol)',
      
      // Port alerts indexes
      'CREATE INDEX IF NOT EXISTS idx_alerts_port_id ON port_alerts(port_id)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_server_id ON port_alerts(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_severity ON port_alerts(severity)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON port_alerts(acknowledged)',
      'CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON port_alerts(created_at)',
      
      // Port scans indexes
      'CREATE INDEX IF NOT EXISTS idx_scans_server_id ON port_scans(server_id)',
      'CREATE INDEX IF NOT EXISTS idx_scans_status ON port_scans(status)',
      'CREATE INDEX IF NOT EXISTS idx_scans_started_at ON port_scans(started_at)',
      'CREATE INDEX IF NOT EXISTS idx_scans_created_by ON port_scans(created_by)',
      
      // Servers table indexes
      'CREATE INDEX IF NOT EXISTS idx_servers_ip ON servers(ip)',
      'CREATE INDEX IF NOT EXISTS idx_servers_isHost ON servers(isHost)'
    ];

    for (const indexSql of indexes) {
      await db.exec(indexSql);
    }
    
    logger.info('Created performance indexes');

    // Step 8: Create triggers for data consistency
    logger.info('Creating data consistency triggers...');
    
    // Trigger to update updated_at timestamp
    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_ports_timestamp 
      AFTER UPDATE ON ports
      BEGIN
        UPDATE ports SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_reservations_timestamp 
      AFTER UPDATE ON port_reservations
      BEGIN
        UPDATE port_reservations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_servers_timestamp 
      AFTER UPDATE ON servers
      BEGIN
        UPDATE servers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Trigger to automatically update port_id in reservations when ports are created
    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS sync_reservation_port_id 
      AFTER INSERT ON ports
      BEGIN
        UPDATE port_reservations 
        SET port_id = NEW.id 
        WHERE server_id = NEW.server_id 
          AND port = NEW.port 
          AND protocol = NEW.protocol 
          AND port_id IS NULL;
      END;
    `);

    // Trigger to clean up orphaned reservations when ports are deleted
    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS cleanup_orphaned_reservations 
      AFTER DELETE ON ports
      BEGIN
        UPDATE port_reservations 
        SET port_id = NULL 
        WHERE port_id = OLD.id;
      END;
    `);

    // Step 9: Create views for common queries
    logger.info('Creating database views...');
    
    await db.exec(`
      CREATE VIEW IF NOT EXISTS port_summary AS
      SELECT 
        p.id,
        p.server_id,
        s.name as server_name,
        s.ip as server_ip,
        p.port,
        p.protocol,
        p.status,
        p.service_name,
        p.service_version,
        p.last_seen,
        p.first_detected,
        p.scan_count,
        COUNT(DISTINCT pr.id) as active_reservations,
        COUNT(DISTINCT pa.id) as unresolved_alerts
      FROM ports p
      LEFT JOIN servers s ON p.server_id = s.id
      LEFT JOIN port_reservations pr ON p.id = pr.port_id AND pr.status = 'active'
      LEFT JOIN port_alerts pa ON p.id = pa.port_id AND pa.acknowledged = 0
      GROUP BY p.id, p.server_id, s.name, s.ip, p.port, p.protocol, p.status, 
               p.service_name, p.service_version, p.last_seen, p.first_detected, p.scan_count;
    `);

    await db.exec(`
      CREATE VIEW IF NOT EXISTS server_port_stats AS
      SELECT 
        s.id as server_id,
        s.name as server_name,
        s.ip as server_ip,
        COUNT(DISTINCT p.id) as total_ports,
        COUNT(DISTINCT CASE WHEN p.status = 'open' THEN p.id END) as open_ports,
        COUNT(DISTINCT CASE WHEN p.status = 'closed' THEN p.id END) as closed_ports,
        COUNT(DISTINCT pr.id) as active_reservations,
        COUNT(DISTINCT pa.id) as unresolved_alerts,
        MAX(p.last_seen) as last_scan
      FROM servers s
      LEFT JOIN ports p ON s.id = p.server_id
      LEFT JOIN port_reservations pr ON s.id = pr.server_id AND pr.status = 'active'
      LEFT JOIN port_alerts pa ON s.id = pa.server_id AND pa.acknowledged = 0
      GROUP BY s.id, s.name, s.ip;
    `);

    logger.info('Created database views for optimized queries');

    // Step 10: Clean up old tables after successful migration
    try {
      await db.exec('DROP TABLE IF EXISTS ports_old');
      await db.exec('DROP TABLE IF EXISTS port_reservations_old');
      logger.info('Cleaned up old tables');
    } catch (error) {
      logger.warn('Failed to clean up old tables:', error.message);
    }

    logger.info('Phase 2 database schema redesign migration completed successfully');
    
    return true;
  } catch (error) {
    logger.error('Phase 2 migration failed:', error);
    throw error;
  }
}

/**
 * Rollback the Phase 2 migration
 */
async function down(db) {
  logger.info('Rolling back Phase 2 database schema redesign migration...');
  
  try {
    // Drop views
    await db.exec('DROP VIEW IF EXISTS port_summary');
    await db.exec('DROP VIEW IF EXISTS server_port_stats');
    
    // Drop triggers
    await db.exec('DROP TRIGGER IF EXISTS update_ports_timestamp');
    await db.exec('DROP TRIGGER IF EXISTS update_reservations_timestamp');
    await db.exec('DROP TRIGGER IF EXISTS update_servers_timestamp');
    await db.exec('DROP TRIGGER IF EXISTS sync_reservation_port_id');
    await db.exec('DROP TRIGGER IF EXISTS cleanup_orphaned_reservations');
    
    // Restore old table structures if backup exists
    try {
      await db.exec('ALTER TABLE ports RENAME TO ports_new');
      await db.exec('ALTER TABLE ports_old RENAME TO ports');
      await db.exec('DROP TABLE ports_new');
      
      await db.exec('ALTER TABLE port_reservations RENAME TO port_reservations_new');
      await db.exec('ALTER TABLE port_reservations_old RENAME TO port_reservations');
      await db.exec('DROP TABLE port_reservations_new');
    } catch (error) {
      logger.warn('Could not restore old table structures:', error.message);
    }
    
    logger.info('Phase 2 migration rollback completed');
    return true;
  } catch (error) {
    logger.error('Phase 2 migration rollback failed:', error);
    throw error;
  }
}

module.exports = {
  up,
  down,
  description: 'Phase 2 database schema redesign with foreign keys, indexes, and normalization'
};