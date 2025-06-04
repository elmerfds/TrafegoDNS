/**
 * Data Integrity Service
 * Provides comprehensive data consistency and integrity checks
 */
const logger = require('../utils/logger');
const { pool } = require('./connectionPool');
const cron = require('node-cron');

class DataIntegrityService {
  constructor(options = {}) {
    this.options = {
      enableAutoFix: options.enableAutoFix || false,
      checkInterval: options.checkInterval || '0 0 * * *', // Daily at midnight
      enableScheduledChecks: options.enableScheduledChecks || false,
      ...options
    };
    
    this.repositories = new Map();
    this.checkSchedule = null;
    this.lastCheckReport = null;
  }
  
  /**
   * Register a repository for integrity checks
   * @param {string} name - Repository name
   * @param {Object} repository - Repository instance
   */
  registerRepository(name, repository) {
    if (!repository || typeof repository.runConsistencyChecks !== 'function') {
      throw new Error(`Repository ${name} must implement runConsistencyChecks method`);
    }
    
    this.repositories.set(name, repository);
    logger.info(`Registered repository ${name} for integrity checks`);
  }
  
  /**
   * Start scheduled integrity checks
   */
  startScheduledChecks() {
    if (!this.options.enableScheduledChecks) {
      logger.info('Scheduled integrity checks are disabled');
      return;
    }
    
    if (this.checkSchedule) {
      logger.warn('Scheduled checks already running');
      return;
    }
    
    this.checkSchedule = cron.schedule(this.options.checkInterval, async () => {
      logger.info('Running scheduled data integrity check');
      try {
        const report = await this.runFullCheck({
          fix: this.options.enableAutoFix
        });
        this.lastCheckReport = report;
        
        if (report.totalIssues > 0) {
          logger.warn(`Data integrity check found ${report.totalIssues} issues`);
        } else {
          logger.info('Data integrity check completed with no issues');
        }
      } catch (error) {
        logger.error(`Error during scheduled integrity check: ${error.message}`);
      }
    });
    
    logger.info(`Started scheduled integrity checks with cron pattern: ${this.options.checkInterval}`);
  }
  
  /**
   * Stop scheduled integrity checks
   */
  stopScheduledChecks() {
    if (this.checkSchedule) {
      this.checkSchedule.stop();
      this.checkSchedule = null;
      logger.info('Stopped scheduled integrity checks');
    }
  }
  
  /**
   * Run full integrity check across all repositories
   * @param {Object} options - Check options
   * @returns {Promise<Object>} - Comprehensive report
   */
  async runFullCheck(options = {}) {
    const { fix = false, includeDetails = true } = options;
    
    const report = {
      timestamp: new Date().toISOString(),
      repositories: {},
      summary: {
        totalChecks: 0,
        totalIssues: 0,
        totalFixes: 0,
        errors: []
      }
    };
    
    // Run checks for each repository
    for (const [name, repository] of this.repositories) {
      try {
        logger.info(`Running integrity check for ${name}`);
        const repoReport = await repository.runConsistencyChecks({ 
          fixInconsistencies: fix 
        });
        
        report.repositories[name] = repoReport;
        report.summary.totalChecks += repoReport.checks?.length || 0;
        report.summary.totalIssues += repoReport.issues?.length || 0;
        report.summary.totalFixes += repoReport.fixes?.length || 0;
        
      } catch (error) {
        logger.error(`Error checking ${name}: ${error.message}`);
        report.summary.errors.push({
          repository: name,
          error: error.message
        });
      }
    }
    
    // Run cross-repository checks
    try {
      const crossChecks = await this.runCrossRepositoryChecks(fix);
      report.crossRepositoryChecks = crossChecks;
      report.summary.totalChecks += crossChecks.checks?.length || 0;
      report.summary.totalIssues += crossChecks.issues?.length || 0;
      report.summary.totalFixes += crossChecks.fixes?.length || 0;
    } catch (error) {
      logger.error(`Error in cross-repository checks: ${error.message}`);
      report.summary.errors.push({
        repository: 'cross-repository',
        error: error.message
      });
    }
    
    // Store total issues for easy access
    report.totalIssues = report.summary.totalIssues;
    
    // Generate recommendations
    if (includeDetails) {
      report.recommendations = this.generateRecommendations(report);
    }
    
    return report;
  }
  
  /**
   * Run cross-repository consistency checks
   * @param {boolean} fix - Whether to fix issues
   * @returns {Promise<Object>} - Check report
   */
  async runCrossRepositoryChecks(fix = false) {
    const report = {
      checks: [],
      issues: [],
      fixes: []
    };
    
    // Get a connection for cross-repository checks
    const connection = await pool.acquire();
    
    try {
      // Check 1: Orphaned foreign keys
      await this.checkOrphanedForeignKeys(connection, report, fix);
      
      // Check 2: Data type mismatches
      await this.checkDataTypeMismatches(connection, report, fix);
      
      // Check 3: Missing indexes
      await this.checkMissingIndexes(connection, report, fix);
      
      // Check 4: Unused indexes
      await this.checkUnusedIndexes(connection, report, fix);
      
      // Check 5: Table statistics
      await this.updateTableStatistics(connection, report);
      
      return report;
    } finally {
      await pool.release(connection);
    }
  }
  
  /**
   * Check for orphaned foreign keys
   * @private
   */
  async checkOrphanedForeignKeys(connection, report, fix) {
    const check = {
      name: 'Orphaned Foreign Keys',
      passed: true,
      details: []
    };
    
    // Define foreign key relationships to check
    const relationships = [
      {
        child: 'dns_tracked_records',
        childColumn: 'record_id',
        parent: 'dns_records',
        parentColumn: 'record_id'
      },
      {
        child: 'port_alerts',
        childColumn: 'port_id',
        parent: 'ports',
        parentColumn: 'id'
      },
      {
        child: 'port_scans',
        childColumn: 'server_id',
        parent: 'servers',
        parentColumn: 'id'
      }
    ];
    
    for (const rel of relationships) {
      try {
        // Check if tables exist
        const tablesExist = await connection.all(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name IN (?, ?)
        `, [rel.child, rel.parent]);
        
        if (tablesExist.length === 2) {
          // Find orphaned records
          const orphans = await connection.all(`
            SELECT COUNT(*) as count
            FROM ${rel.child} c
            LEFT JOIN ${rel.parent} p ON c.${rel.childColumn} = p.${rel.parentColumn}
            WHERE p.${rel.parentColumn} IS NULL
              AND c.${rel.childColumn} IS NOT NULL
          `);
          
          if (orphans[0].count > 0) {
            check.passed = false;
            const issue = `Found ${orphans[0].count} orphaned records in ${rel.child}`;
            report.issues.push(issue);
            check.details.push(issue);
            
            if (fix) {
              const result = await connection.run(`
                DELETE FROM ${rel.child}
                WHERE ${rel.childColumn} IN (
                  SELECT c.${rel.childColumn}
                  FROM ${rel.child} c
                  LEFT JOIN ${rel.parent} p ON c.${rel.childColumn} = p.${rel.parentColumn}
                  WHERE p.${rel.parentColumn} IS NULL
                    AND c.${rel.childColumn} IS NOT NULL
                )
              `);
              
              const fixMsg = `Deleted ${result.changes} orphaned records from ${rel.child}`;
              report.fixes.push(fixMsg);
              check.details.push(fixMsg);
            }
          }
        }
      } catch (error) {
        // Tables might not exist, which is fine
        logger.debug(`Skipping FK check for ${rel.child}: ${error.message}`);
      }
    }
    
    report.checks.push(check);
  }
  
  /**
   * Check for data type mismatches
   * @private
   */
  async checkDataTypeMismatches(connection, report, fix) {
    const check = {
      name: 'Data Type Consistency',
      passed: true,
      details: []
    };
    
    // Check for common data type issues
    const typeChecks = [
      {
        table: 'dns_records',
        column: 'ttl',
        expectedType: 'INTEGER',
        fixValue: 1
      },
      {
        table: 'dns_records',
        column: 'proxied',
        expectedType: 'INTEGER',
        fixValue: 0
      },
      {
        table: 'ports',
        column: 'port',
        expectedType: 'INTEGER',
        fixValue: null
      }
    ];
    
    for (const tc of typeChecks) {
      try {
        // Check if table exists
        const tableExists = await connection.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name = ?
        `, [tc.table]);
        
        if (tableExists) {
          // Find records with non-numeric values
          const badRecords = await connection.all(`
            SELECT COUNT(*) as count
            FROM ${tc.table}
            WHERE typeof(${tc.column}) != '${tc.expectedType.toLowerCase()}'
              AND ${tc.column} IS NOT NULL
          `);
          
          if (badRecords[0].count > 0) {
            check.passed = false;
            const issue = `Found ${badRecords[0].count} records with invalid ${tc.column} type in ${tc.table}`;
            report.issues.push(issue);
            check.details.push(issue);
            
            if (fix && tc.fixValue !== null) {
              const result = await connection.run(`
                UPDATE ${tc.table}
                SET ${tc.column} = ?
                WHERE typeof(${tc.column}) != ?
                  AND ${tc.column} IS NOT NULL
              `, [tc.fixValue, tc.expectedType.toLowerCase()]);
              
              const fixMsg = `Fixed ${result.changes} records with invalid ${tc.column} in ${tc.table}`;
              report.fixes.push(fixMsg);
              check.details.push(fixMsg);
            }
          }
        }
      } catch (error) {
        logger.debug(`Error checking type for ${tc.table}.${tc.column}: ${error.message}`);
      }
    }
    
    report.checks.push(check);
  }
  
  /**
   * Check for missing indexes
   * @private
   */
  async checkMissingIndexes(connection, report, fix) {
    const check = {
      name: 'Missing Indexes',
      passed: true,
      details: []
    };
    
    // Define recommended indexes
    const recommendedIndexes = [
      {
        table: 'dns_records',
        column: 'provider',
        indexName: 'idx_dns_provider'
      },
      {
        table: 'dns_records',
        column: 'name',
        indexName: 'idx_dns_name'
      },
      {
        table: 'dns_records',
        column: 'type',
        indexName: 'idx_dns_type'
      },
      {
        table: 'dns_records',
        column: 'is_orphaned',
        indexName: 'idx_dns_orphaned'
      },
      {
        table: 'ports',
        column: 'port',
        indexName: 'idx_port_number'
      },
      {
        table: 'ports',
        column: 'server_id',
        indexName: 'idx_port_server'
      },
      {
        table: 'port_alerts',
        column: 'status',
        indexName: 'idx_alert_status'
      },
      {
        table: 'port_reservations',
        column: 'port',
        indexName: 'idx_reservation_port'
      },
      {
        table: 'port_reservations',
        column: 'expires_at',
        indexName: 'idx_reservation_expires'
      }
    ];
    
    for (const idx of recommendedIndexes) {
      try {
        // Check if table exists
        const tableExists = await connection.get(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name = ?
        `, [idx.table]);
        
        if (tableExists) {
          // Check if index exists
          const indexExists = await connection.get(`
            SELECT name FROM sqlite_master 
            WHERE type='index' AND name = ?
          `, [idx.indexName]);
          
          if (!indexExists) {
            check.passed = false;
            const issue = `Missing index ${idx.indexName} on ${idx.table}.${idx.column}`;
            report.issues.push(issue);
            check.details.push(issue);
            
            if (fix) {
              try {
                await connection.exec(`
                  CREATE INDEX IF NOT EXISTS ${idx.indexName} 
                  ON ${idx.table}(${idx.column})
                `);
                
                const fixMsg = `Created index ${idx.indexName}`;
                report.fixes.push(fixMsg);
                check.details.push(fixMsg);
              } catch (error) {
                logger.error(`Failed to create index ${idx.indexName}: ${error.message}`);
              }
            }
          }
        }
      } catch (error) {
        logger.debug(`Error checking index ${idx.indexName}: ${error.message}`);
      }
    }
    
    report.checks.push(check);
  }
  
  /**
   * Check for unused indexes
   * @private
   */
  async checkUnusedIndexes(connection, report, fix) {
    const check = {
      name: 'Unused Indexes',
      passed: true,
      details: []
    };
    
    try {
      // Get all indexes
      const indexes = await connection.all(`
        SELECT name, tbl_name 
        FROM sqlite_master 
        WHERE type = 'index' 
          AND name NOT LIKE 'sqlite_%'
          AND sql IS NOT NULL
      `);
      
      // For SQLite, we can't easily determine unused indexes
      // Just report the total number of indexes
      check.details.push(`Found ${indexes.length} user-defined indexes`);
      
      if (indexes.length > 50) {
        check.passed = false;
        report.issues.push(`High number of indexes (${indexes.length}) may impact write performance`);
      }
    } catch (error) {
      logger.debug(`Error checking unused indexes: ${error.message}`);
    }
    
    report.checks.push(check);
  }
  
  /**
   * Update table statistics
   * @private
   */
  async updateTableStatistics(connection, report) {
    const check = {
      name: 'Table Statistics',
      passed: true,
      details: []
    };
    
    try {
      // Run ANALYZE to update SQLite statistics
      await connection.exec('ANALYZE');
      check.details.push('Updated SQLite table statistics');
      
      // Get table sizes
      const tables = await connection.all(`
        SELECT 
          name,
          (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=m.name) as index_count
        FROM sqlite_master m
        WHERE type='table' 
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE 'schema_%'
      `);
      
      for (const table of tables) {
        const count = await connection.get(`SELECT COUNT(*) as count FROM ${table.name}`);
        check.details.push(`${table.name}: ${count.count} rows, ${table.index_count} indexes`);
      }
    } catch (error) {
      logger.debug(`Error updating statistics: ${error.message}`);
    }
    
    report.checks.push(check);
  }
  
  /**
   * Generate recommendations based on check results
   * @private
   */
  generateRecommendations(report) {
    const recommendations = [];
    
    // High issue count
    if (report.summary.totalIssues > 10) {
      recommendations.push({
        severity: 'high',
        message: 'High number of data integrity issues detected. Consider enabling auto-fix.',
        action: 'Enable enableAutoFix option in DataIntegrityService'
      });
    }
    
    // Errors during checks
    if (report.summary.errors.length > 0) {
      recommendations.push({
        severity: 'medium',
        message: 'Some integrity checks failed to complete. Review error logs.',
        action: 'Check application logs for detailed error information'
      });
    }
    
    // Missing indexes
    const missingIndexes = [];
    for (const [name, repoReport] of Object.entries(report.repositories)) {
      if (repoReport.issues) {
        repoReport.issues.forEach(issue => {
          if (issue.includes('Missing index')) {
            missingIndexes.push(issue);
          }
        });
      }
    }
    
    if (missingIndexes.length > 0) {
      recommendations.push({
        severity: 'medium',
        message: `${missingIndexes.length} missing indexes detected. This may impact query performance.`,
        action: 'Run integrity check with fix=true to create missing indexes'
      });
    }
    
    // Schedule regular checks
    if (!this.options.enableScheduledChecks) {
      recommendations.push({
        severity: 'low',
        message: 'Scheduled integrity checks are disabled.',
        action: 'Enable enableScheduledChecks option for automatic monitoring'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Get the last check report
   * @returns {Object|null} - Last check report
   */
  getLastReport() {
    return this.lastCheckReport;
  }
}

// Create singleton instance
const dataIntegrityService = new DataIntegrityService();

module.exports = {
  DataIntegrityService,
  dataIntegrityService
};