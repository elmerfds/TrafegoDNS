const logger = require('../../utils/logger');

/**
 * Migration to create port monitoring tables
 */
async function createPortMonitoringTables(db) {
  try {
    logger.info('Creating port monitoring tables...');

    // Create ports table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'tcp',
        status TEXT NOT NULL DEFAULT 'unknown',
        service_name TEXT,
        service_version TEXT,
        description TEXT,
        labels TEXT, -- JSON string for custom labels
        container_id TEXT,
        container_name TEXT,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(host, port, protocol)
      )
    `);

    // Create port_scans table for scan history
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        scan_type TEXT NOT NULL DEFAULT 'local', -- local, remote, container
        ports_discovered INTEGER DEFAULT 0,
        ports_changed INTEGER DEFAULT 0,
        scan_duration INTEGER, -- milliseconds
        status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
        error_message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        created_by TEXT, -- user who initiated scan
        metadata TEXT -- JSON string for additional scan metadata
      )
    `);

    // Create port_history table for tracking changes
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        port_id INTEGER NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        protocol TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        old_service TEXT,
        new_service TEXT,
        change_type TEXT NOT NULL, -- opened, closed, service_changed, metadata_updated
        scan_id INTEGER,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE,
        FOREIGN KEY (scan_id) REFERENCES port_scans(id) ON DELETE SET NULL
      )
    `);

    // Create port_alerts table for security notifications
    db.exec(`
      CREATE TABLE IF NOT EXISTS port_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        port_id INTEGER NOT NULL,
        alert_type TEXT NOT NULL, -- unexpected_open, security_risk, service_changed
        severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
        title TEXT NOT NULL,
        description TEXT,
        acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by TEXT,
        acknowledged_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ports_host ON ports(host)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ports_status ON ports(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ports_container ON ports(container_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ports_last_seen ON ports(last_seen)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_scans_host ON port_scans(host)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_scans_status ON port_scans(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_history_port_id ON port_history(port_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_history_change_type ON port_history(change_type)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_alerts_port_id ON port_alerts(port_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_port_alerts_acknowledged ON port_alerts(acknowledged)`);

    // Create triggers for updating timestamps
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_ports_timestamp 
      AFTER UPDATE ON ports
      BEGIN
        UPDATE ports SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_port_scans_timestamp 
      AFTER UPDATE ON port_scans
      BEGIN
        UPDATE port_scans SET completed_at = CURRENT_TIMESTAMP WHERE id = NEW.id AND OLD.status != 'completed' AND NEW.status = 'completed';
      END;
    `);

    logger.info('Port monitoring tables created successfully');
    return true;
  } catch (error) {
    logger.error('Failed to create port monitoring tables:', error);
    throw error;
  }
}

module.exports = { createPortMonitoringTables };