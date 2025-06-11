/**
 * Data Consistency Checker
 * Provides comprehensive data validation and consistency checks across repositories
 */

const logger = require('../../utils/logger');

class DataConsistencyChecker {
  constructor(database, repositories) {
    this.db = database;
    this.repositories = repositories;
    this.inconsistencyLog = [];
    this.fixLog = [];
  }

  /**
   * Run comprehensive consistency checks across all port-related data
   * @param {Object} options - Check options
   * @returns {Promise<Object>} - Consistency report
   */
  async runFullCheck(options = {}) {
    const {
      fixInconsistencies = false,
      includeOrphaned = true,
      includeExpired = true,
      includeForeignKeys = true,
      includeTimestamps = true
    } = options;

    logger.info('Starting comprehensive data consistency check', options);
    
    const startTime = Date.now();
    this.inconsistencyLog = [];
    this.fixLog = [];

    const report = {
      timestamp: new Date().toISOString(),
      checks: {},
      summary: {
        totalChecks: 0,
        passed: 0,
        failed: 0,
        fixed: 0,
        warnings: 0
      },
      inconsistencies: [],
      fixes: [],
      duration: 0
    };

    try {
      // 1. Foreign Key Consistency Checks
      if (includeForeignKeys) {
        report.checks.foreignKeys = await this._checkForeignKeyConsistency(fixInconsistencies);
        report.summary.totalChecks++;
        if (report.checks.foreignKeys.passed) report.summary.passed++;
        else report.summary.failed++;
      }

      // 2. Orphaned Records Check
      if (includeOrphaned) {
        report.checks.orphanedRecords = await this._checkOrphanedRecords(fixInconsistencies);
        report.summary.totalChecks++;
        if (report.checks.orphanedRecords.passed) report.summary.passed++;
        else report.summary.failed++;
      }

      // 3. Expired Reservations Check
      if (includeExpired) {
        report.checks.expiredReservations = await this._checkExpiredReservations(fixInconsistencies);
        report.summary.totalChecks++;
        if (report.checks.expiredReservations.passed) report.summary.passed++;
        else report.summary.failed++;
      }

      // 4. Timestamp Consistency
      if (includeTimestamps) {
        report.checks.timestamps = await this._checkTimestampConsistency(fixInconsistencies);
        report.summary.totalChecks++;
        if (report.checks.timestamps.passed) report.summary.passed++;
        else report.summary.failed++;
      }

      // 5. Port Status Consistency
      report.checks.portStatus = await this._checkPortStatusConsistency(fixInconsistencies);
      report.summary.totalChecks++;
      if (report.checks.portStatus.passed) report.summary.passed++;
      else report.summary.failed++;

      // 6. Alert Correlation Check
      report.checks.alertCorrelation = await this._checkAlertCorrelation(fixInconsistencies);
      report.summary.totalChecks++;
      if (report.checks.alertCorrelation.passed) report.summary.passed++;
      else report.summary.failed++;

      // 7. Container Reference Validation
      report.checks.containerReferences = await this._checkContainerReferences(fixInconsistencies);
      report.summary.totalChecks++;
      if (report.checks.containerReferences.passed) report.summary.passed++;
      else report.summary.failed++;

      // 8. Duplicate Data Check
      report.checks.duplicates = await this._checkDuplicateData(fixInconsistencies);
      report.summary.totalChecks++;
      if (report.checks.duplicates.passed) report.summary.passed++;
      else report.summary.failed++;

      report.summary.fixed = this.fixLog.length;
      report.inconsistencies = this.inconsistencyLog;
      report.fixes = this.fixLog;
      report.duration = Date.now() - startTime;

      logger.info('Data consistency check completed', {
        duration: report.duration,
        totalChecks: report.summary.totalChecks,
        passed: report.summary.passed,
        failed: report.summary.failed,
        fixed: report.summary.fixed,
        warnings: report.summary.warnings
      });

      return report;
    } catch (error) {
      logger.error('Data consistency check failed', error);
      throw error;
    }
  }

  /**
   * Check foreign key consistency across tables
   * @private
   */
  async _checkForeignKeyConsistency(fix = false) {
    const check = {
      name: 'Foreign Key Consistency',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check port_id references in port_reservations
      const orphanedReservations = await this.db.all(`
        SELECT pr.id, pr.port_id, pr.server_id, pr.port, pr.protocol
        FROM port_reservations pr
        WHERE pr.port_id IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM ports p 
          WHERE p.id = pr.port_id
        )
      `);

      if (orphanedReservations.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${orphanedReservations.length} reservations with invalid port_id references`);
        this._logInconsistency('foreign_key', 'port_reservations.port_id', orphanedReservations);

        if (fix) {
          // Set port_id to NULL for orphaned reservations
          const result = await this.db.run(`
            UPDATE port_reservations 
            SET port_id = NULL 
            WHERE port_id IS NOT NULL 
            AND NOT EXISTS (
              SELECT 1 FROM ports p 
              WHERE p.id = port_reservations.port_id
            )
          `);
          
          check.fixes.push(`Cleared ${result.changes} orphaned port_id references`);
          this._logFix('foreign_key', `Cleared ${result.changes} orphaned port_id references in port_reservations`);
        }
      }

      // Check port_id references in port_alerts
      const orphanedAlerts = await this.db.all(`
        SELECT pa.id, pa.port_id, pa.server_id, pa.port, pa.protocol
        FROM port_alerts pa
        WHERE pa.port_id IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM ports p 
          WHERE p.id = pa.port_id
        )
      `);

      if (orphanedAlerts.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${orphanedAlerts.length} alerts with invalid port_id references`);
        this._logInconsistency('foreign_key', 'port_alerts.port_id', orphanedAlerts);

        if (fix) {
          // Delete orphaned alerts
          const result = await this.db.run(`
            DELETE FROM port_alerts 
            WHERE port_id IS NOT NULL 
            AND NOT EXISTS (
              SELECT 1 FROM ports p 
              WHERE p.id = port_alerts.port_id
            )
          `);
          
          check.fixes.push(`Deleted ${result.changes} orphaned alerts`);
          this._logFix('foreign_key', `Deleted ${result.changes} orphaned alerts`);
        }
      }

      // Check server_id references across tables
      const orphanedPortsByServer = await this.db.all(`
        SELECT p.id, p.server_id
        FROM ports p
        WHERE NOT EXISTS (
          SELECT 1 FROM servers s 
          WHERE s.id = p.server_id
        )
      `);

      if (orphanedPortsByServer.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${orphanedPortsByServer.length} ports with invalid server_id references`);
        this._logInconsistency('foreign_key', 'ports.server_id', orphanedPortsByServer);

        if (fix) {
          // Get default localhost server
          const localhostServer = await this.db.get('SELECT id FROM servers WHERE isHost = 1 LIMIT 1');
          if (localhostServer) {
            const result = await this.db.run(`
              UPDATE ports 
              SET server_id = ? 
              WHERE NOT EXISTS (
                SELECT 1 FROM servers s 
                WHERE s.id = ports.server_id
              )
            `, [localhostServer.id]);
            
            check.fixes.push(`Fixed ${result.changes} orphaned port server references`);
            this._logFix('foreign_key', `Fixed ${result.changes} orphaned port server references`);
          }
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Foreign key check failed: ${error.message}`);
      logger.error('Foreign key consistency check failed', error);
    }

    return check;
  }

  /**
   * Check for orphaned records that should be cleaned up
   * @private
   */
  async _checkOrphanedRecords(fix = false) {
    const check = {
      name: 'Orphaned Records',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for old completed scans (older than 30 days)
      const oldScans = await this.db.all(`
        SELECT id, started_at, status 
        FROM port_scans 
        WHERE status IN ('completed', 'failed', 'cancelled')
        AND datetime(started_at, '+30 days') < datetime('now')
      `);

      if (oldScans.length > 0) {
        check.issues.push(`Found ${oldScans.length} old completed scans (>30 days)`);
        this._logInconsistency('orphaned', 'old_scans', oldScans);

        if (fix) {
          const result = await this.db.run(`
            DELETE FROM port_scans 
            WHERE status IN ('completed', 'failed', 'cancelled')
            AND datetime(started_at, '+30 days') < datetime('now')
          `);
          
          check.fixes.push(`Cleaned up ${result.changes} old scans`);
          this._logFix('orphaned', `Cleaned up ${result.changes} old scans`);
        }
      }

      // Check for very old acknowledged alerts (older than 90 days)
      const oldAlerts = await this.db.all(`
        SELECT id, created_at, acknowledged, resolved 
        FROM port_alerts 
        WHERE (acknowledged = 1 OR resolved = 1)
        AND datetime(created_at, '+90 days') < datetime('now')
      `);

      if (oldAlerts.length > 0) {
        check.issues.push(`Found ${oldAlerts.length} old resolved alerts (>90 days)`);
        this._logInconsistency('orphaned', 'old_alerts', oldAlerts);

        if (fix) {
          const result = await this.db.run(`
            DELETE FROM port_alerts 
            WHERE (acknowledged = 1 OR resolved = 1)
            AND datetime(created_at, '+90 days') < datetime('now')
          `);
          
          check.fixes.push(`Cleaned up ${result.changes} old alerts`);
          this._logFix('orphaned', `Cleaned up ${result.changes} old alerts`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Orphaned records check failed: ${error.message}`);
      logger.error('Orphaned records check failed', error);
    }

    if (check.issues.length > 0) {
      check.passed = false;
    }

    return check;
  }

  /**
   * Check and clean up expired reservations
   * @private
   */
  async _checkExpiredReservations(fix = false) {
    const check = {
      name: 'Expired Reservations',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Find expired active reservations
      const expiredReservations = await this.db.all(`
        SELECT id, port, protocol, container_id, expires_at, status
        FROM port_reservations 
        WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND datetime(expires_at) < datetime('now')
      `);

      if (expiredReservations.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${expiredReservations.length} expired active reservations`);
        this._logInconsistency('expired', 'reservations', expiredReservations);

        if (fix) {
          const result = await this.db.run(`
            UPDATE port_reservations 
            SET status = 'expired', released_at = CURRENT_TIMESTAMP
            WHERE status = 'active'
            AND expires_at IS NOT NULL
            AND datetime(expires_at) < datetime('now')
          `);
          
          check.fixes.push(`Marked ${result.changes} reservations as expired`);
          this._logFix('expired', `Marked ${result.changes} reservations as expired`);
        }
      }

      // Check for reservations without expiration dates
      const reservationsWithoutExpiry = await this.db.all(`
        SELECT id, port, protocol, container_id, reserved_at, status
        FROM port_reservations 
        WHERE status = 'active'
        AND expires_at IS NULL
        AND datetime(reserved_at, '+24 hours') < datetime('now')
      `);

      if (reservationsWithoutExpiry.length > 0) {
        check.issues.push(`Found ${reservationsWithoutExpiry.length} active reservations without expiry dates (>24h old)`);
        this._logInconsistency('expired', 'no_expiry_reservations', reservationsWithoutExpiry);

        if (fix) {
          // Set expiry to 24 hours from reservation time
          const result = await this.db.run(`
            UPDATE port_reservations 
            SET expires_at = datetime(reserved_at, '+24 hours')
            WHERE status = 'active'
            AND expires_at IS NULL
            AND datetime(reserved_at, '+24 hours') < datetime('now')
          `);
          
          check.fixes.push(`Added expiry dates to ${result.changes} reservations`);
          this._logFix('expired', `Added expiry dates to ${result.changes} reservations`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Expired reservations check failed: ${error.message}`);
      logger.error('Expired reservations check failed', error);
    }

    return check;
  }

  /**
   * Check timestamp consistency
   * @private
   */
  async _checkTimestampConsistency(fix = false) {
    const check = {
      name: 'Timestamp Consistency',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for future timestamps
      const futurePorts = await this.db.all(`
        SELECT id, port, created_at, updated_at, last_seen
        FROM ports 
        WHERE created_at > datetime('now') 
        OR updated_at > datetime('now')
        OR last_seen > datetime('now')
      `);

      if (futurePorts.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${futurePorts.length} ports with future timestamps`);
        this._logInconsistency('timestamp', 'future_ports', futurePorts);

        if (fix) {
          const result = await this.db.run(`
            UPDATE ports 
            SET created_at = CASE WHEN created_at > datetime('now') THEN datetime('now') ELSE created_at END,
                updated_at = CASE WHEN updated_at > datetime('now') THEN datetime('now') ELSE updated_at END,
                last_seen = CASE WHEN last_seen > datetime('now') THEN datetime('now') ELSE last_seen END
            WHERE created_at > datetime('now') 
            OR updated_at > datetime('now')
            OR last_seen > datetime('now')
          `);
          
          check.fixes.push(`Fixed ${result.changes} future timestamps`);
          this._logFix('timestamp', `Fixed ${result.changes} future timestamps`);
        }
      }

      // Check for inconsistent created_at > updated_at
      const inconsistentTimestamps = await this.db.all(`
        SELECT id, port, created_at, updated_at
        FROM ports 
        WHERE updated_at < created_at
      `);

      if (inconsistentTimestamps.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${inconsistentTimestamps.length} ports with updated_at < created_at`);
        this._logInconsistency('timestamp', 'inconsistent_timestamps', inconsistentTimestamps);

        if (fix) {
          const result = await this.db.run(`
            UPDATE ports 
            SET updated_at = created_at
            WHERE updated_at < created_at
          `);
          
          check.fixes.push(`Fixed ${result.changes} inconsistent timestamps`);
          this._logFix('timestamp', `Fixed ${result.changes} inconsistent timestamps`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Timestamp consistency check failed: ${error.message}`);
      logger.error('Timestamp consistency check failed', error);
    }

    return check;
  }

  /**
   * Check port status consistency
   * @private
   */
  async _checkPortStatusConsistency(fix = false) {
    const check = {
      name: 'Port Status Consistency',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for invalid status values
      const invalidStatuses = await this.db.all(`
        SELECT id, port, protocol, status
        FROM ports 
        WHERE status NOT IN ('open', 'closed', 'filtered', 'unknown', 'listening')
      `);

      if (invalidStatuses.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${invalidStatuses.length} ports with invalid status values`);
        this._logInconsistency('status', 'invalid_status', invalidStatuses);

        if (fix) {
          const result = await this.db.run(`
            UPDATE ports 
            SET status = 'unknown'
            WHERE status NOT IN ('open', 'closed', 'filtered', 'unknown', 'listening')
          `);
          
          check.fixes.push(`Fixed ${result.changes} invalid status values`);
          this._logFix('status', `Fixed ${result.changes} invalid status values`);
        }
      }

      // Check for very old port data (last_seen > 30 days ago)
      const stalePorts = await this.db.all(`
        SELECT id, port, protocol, status, last_seen
        FROM ports 
        WHERE datetime(last_seen, '+30 days') < datetime('now')
        AND status IN ('open', 'listening')
      `);

      if (stalePorts.length > 0) {
        check.issues.push(`Found ${stalePorts.length} stale ports (last seen >30 days ago) with open/listening status`);
        this._logInconsistency('status', 'stale_ports', stalePorts);

        if (fix) {
          const result = await this.db.run(`
            UPDATE ports 
            SET status = 'unknown'
            WHERE datetime(last_seen, '+30 days') < datetime('now')
            AND status IN ('open', 'listening')
          `);
          
          check.fixes.push(`Updated ${result.changes} stale ports to unknown status`);
          this._logFix('status', `Updated ${result.changes} stale ports to unknown status`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Port status consistency check failed: ${error.message}`);
      logger.error('Port status consistency check failed', error);
    }

    return check;
  }

  /**
   * Check alert correlation with actual port issues
   * @private
   */
  async _checkAlertCorrelation(fix = false) {
    const check = {
      name: 'Alert Correlation',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for alerts without corresponding ports
      const alertsWithoutPorts = await this.db.all(`
        SELECT pa.id, pa.port, pa.protocol, pa.server_id, pa.alert_type
        FROM port_alerts pa
        WHERE pa.port_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ports p 
          WHERE p.server_id = pa.server_id 
          AND p.port = pa.port 
          AND p.protocol = pa.protocol
        )
      `);

      if (alertsWithoutPorts.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${alertsWithoutPorts.length} alerts for non-existent ports`);
        this._logInconsistency('alert', 'alerts_without_ports', alertsWithoutPorts);

        if (fix) {
          // Mark these alerts as resolved since the port doesn't exist
          const result = await this.db.run(`
            UPDATE port_alerts 
            SET resolved = 1, resolved_at = CURRENT_TIMESTAMP
            WHERE port_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM ports p 
              WHERE p.server_id = port_alerts.server_id 
              AND p.port = port_alerts.port 
              AND p.protocol = port_alerts.protocol
            )
          `);
          
          check.fixes.push(`Resolved ${result.changes} alerts for non-existent ports`);
          this._logFix('alert', `Resolved ${result.changes} alerts for non-existent ports`);
        }
      }

      // Check for very old unacknowledged alerts (>30 days)
      const oldUnacknowledgedAlerts = await this.db.all(`
        SELECT id, port, protocol, alert_type, created_at
        FROM port_alerts 
        WHERE acknowledged = 0 
        AND resolved = 0
        AND datetime(created_at, '+30 days') < datetime('now')
      `);

      if (oldUnacknowledgedAlerts.length > 0) {
        check.issues.push(`Found ${oldUnacknowledgedAlerts.length} very old unacknowledged alerts (>30 days)`);
        this._logInconsistency('alert', 'old_unacknowledged', oldUnacknowledgedAlerts);

        if (fix) {
          // Auto-acknowledge very old alerts
          const result = await this.db.run(`
            UPDATE port_alerts 
            SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = 'system'
            WHERE acknowledged = 0 
            AND resolved = 0
            AND datetime(created_at, '+30 days') < datetime('now')
          `);
          
          check.fixes.push(`Auto-acknowledged ${result.changes} very old alerts`);
          this._logFix('alert', `Auto-acknowledged ${result.changes} very old alerts`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Alert correlation check failed: ${error.message}`);
      logger.error('Alert correlation check failed', error);
    }

    return check;
  }

  /**
   * Check container references across tables
   * @private
   */
  async _checkContainerReferences(fix = false) {
    const check = {
      name: 'Container References',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for invalid container ID format
      const invalidContainerIds = await this.db.all(`
        SELECT id, container_id, port, protocol
        FROM port_reservations 
        WHERE container_id IS NOT NULL
        AND LENGTH(container_id) NOT IN (12, 64)
        AND container_id NOT LIKE '%-%'
      `);

      if (invalidContainerIds.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${invalidContainerIds.length} reservations with invalid container ID format`);
        this._logInconsistency('container', 'invalid_format', invalidContainerIds);

        if (fix) {
          // Mark these reservations as expired since container ID is invalid
          const result = await this.db.run(`
            UPDATE port_reservations 
            SET status = 'expired', released_at = CURRENT_TIMESTAMP
            WHERE container_id IS NOT NULL
            AND LENGTH(container_id) NOT IN (12, 64)
            AND container_id NOT LIKE '%-%'
            AND status = 'active'
          `);
          
          check.fixes.push(`Marked ${result.changes} reservations with invalid container IDs as expired`);
          this._logFix('container', `Marked ${result.changes} reservations with invalid container IDs as expired`);
        }
      }

      // Check for duplicate active reservations for same container/port
      const duplicateReservations = await this.db.all(`
        SELECT container_id, port, protocol, COUNT(*) as count
        FROM port_reservations 
        WHERE status = 'active'
        GROUP BY container_id, port, protocol
        HAVING COUNT(*) > 1
      `);

      if (duplicateReservations.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${duplicateReservations.length} containers with duplicate active reservations`);
        this._logInconsistency('container', 'duplicate_reservations', duplicateReservations);

        if (fix) {
          // Keep only the newest reservation for each container/port/protocol combination
          for (const dup of duplicateReservations) {
            await this.db.run(`
              UPDATE port_reservations 
              SET status = 'expired', released_at = CURRENT_TIMESTAMP
              WHERE container_id = ? AND port = ? AND protocol = ? AND status = 'active'
              AND id NOT IN (
                SELECT id FROM port_reservations 
                WHERE container_id = ? AND port = ? AND protocol = ? AND status = 'active'
                ORDER BY reserved_at DESC 
                LIMIT 1
              )
            `, [dup.container_id, dup.port, dup.protocol, dup.container_id, dup.port, dup.protocol]);
          }
          
          check.fixes.push(`Resolved duplicate reservations for ${duplicateReservations.length} container/port combinations`);
          this._logFix('container', `Resolved duplicate reservations for ${duplicateReservations.length} container/port combinations`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Container references check failed: ${error.message}`);
      logger.error('Container references check failed', error);
    }

    return check;
  }

  /**
   * Check for duplicate data
   * @private
   */
  async _checkDuplicateData(fix = false) {
    const check = {
      name: 'Duplicate Data',
      passed: true,
      issues: [],
      fixes: []
    };

    try {
      // Check for duplicate port entries
      const duplicatePorts = await this.db.all(`
        SELECT server_id, port, protocol, COUNT(*) as count
        FROM ports 
        GROUP BY server_id, port, protocol
        HAVING COUNT(*) > 1
      `);

      if (duplicatePorts.length > 0) {
        check.passed = false;
        check.issues.push(`Found ${duplicatePorts.length} sets of duplicate ports`);
        this._logInconsistency('duplicate', 'ports', duplicatePorts);

        if (fix) {
          // Keep the most recently updated port record
          for (const dup of duplicatePorts) {
            await this.db.run(`
              DELETE FROM ports 
              WHERE server_id = ? AND port = ? AND protocol = ?
              AND id NOT IN (
                SELECT id FROM ports 
                WHERE server_id = ? AND port = ? AND protocol = ?
                ORDER BY updated_at DESC, scan_count DESC 
                LIMIT 1
              )
            `, [dup.server_id, dup.port, dup.protocol, dup.server_id, dup.port, dup.protocol]);
          }
          
          check.fixes.push(`Removed duplicate port records for ${duplicatePorts.length} port combinations`);
          this._logFix('duplicate', `Removed duplicate port records for ${duplicatePorts.length} port combinations`);
        }
      }

    } catch (error) {
      check.passed = false;
      check.issues.push(`Duplicate data check failed: ${error.message}`);
      logger.error('Duplicate data check failed', error);
    }

    return check;
  }

  /**
   * Log an inconsistency
   * @private
   */
  _logInconsistency(type, category, data) {
    const inconsistency = {
      type,
      category,
      count: Array.isArray(data) ? data.length : 1,
      details: data,
      timestamp: new Date().toISOString()
    };
    
    this.inconsistencyLog.push(inconsistency);
    logger.warn(`Data inconsistency detected: ${type}/${category}`, { count: inconsistency.count });
  }

  /**
   * Log a fix
   * @private
   */
  _logFix(type, description) {
    const fix = {
      type,
      description,
      timestamp: new Date().toISOString()
    };
    
    this.fixLog.push(fix);
    logger.info(`Data inconsistency fixed: ${type}`, { description });
  }

  /**
   * Get quick status check
   * @returns {Promise<Object>} - Quick status
   */
  async getQuickStatus() {
    try {
      const [
        totalPorts,
        activeReservations,
        expiredReservations,
        unacknowledgedAlerts,
        runningScans,
        oldPorts
      ] = await Promise.all([
        this.db.get('SELECT COUNT(*) as count FROM ports'),
        this.db.get('SELECT COUNT(*) as count FROM port_reservations WHERE status = "active"'),
        this.db.get('SELECT COUNT(*) as count FROM port_reservations WHERE status = "active" AND expires_at IS NOT NULL AND datetime(expires_at) < datetime("now")'),
        this.db.get('SELECT COUNT(*) as count FROM port_alerts WHERE acknowledged = 0 AND resolved = 0'),
        this.db.get('SELECT COUNT(*) as count FROM port_scans WHERE status = "running"'),
        this.db.get('SELECT COUNT(*) as count FROM ports WHERE datetime(last_seen, "+30 days") < datetime("now") AND status IN ("open", "listening")')
      ]);

      return {
        timestamp: new Date().toISOString(),
        summary: {
          totalPorts: totalPorts.count,
          activeReservations: activeReservations.count,
          expiredReservations: expiredReservations.count,
          unacknowledgedAlerts: unacknowledgedAlerts.count,
          runningScans: runningScans.count,
          stalePorts: oldPorts.count
        },
        healthStatus: expiredReservations.count === 0 && oldPorts.count < 10 ? 'healthy' : 'needs_attention'
      };
    } catch (error) {
      logger.error('Quick status check failed', error);
      throw error;
    }
  }
}

module.exports = DataConsistencyChecker;