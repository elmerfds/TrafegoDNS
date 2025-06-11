/**
 * Database Service
 * Orchestrates all database operations including connection pooling,
 * data integrity, and migrations
 */
const logger = require('../utils/logger');
const { pool } = require('./connectionPool');
const { dataIntegrityService } = require('./dataIntegrityService');
const { migrationRunner } = require('./migrationRunner');
const ImprovedPortRepository = require('./repository/improvedPortRepository');

class DatabaseService {
  constructor() {
    this.initialized = false;
    this.repositories = new Map();
    this.startupTime = null;
  }
  
  /**
   * Initialize the complete database service
   * @param {Object} options - Initialization options
   * @returns {Promise<boolean>} Success status
   */
  async initialize(options = {}) {
    const {
      enableIntegrityChecks = true,
      enableScheduledChecks = false,
      runMigrations = true,
      autoFix = false
    } = options;
    
    this.startupTime = Date.now();
    
    try {
      logger.info('Initializing enhanced database service');
      
      // 1. Initialize connection pool
      const poolSuccess = await pool.initialize();
      if (!poolSuccess) {
        throw new Error('Failed to initialize connection pool');
      }
      logger.info('✓ Connection pool initialized');
      
      // 2. Run migrations if requested
      if (runMigrations) {
        logger.info('Running database migrations...');
        const migrationResult = await migrationRunner.run();
        
        if (migrationResult.success) {
          logger.info(`✓ Migrations completed (${migrationResult.migrationsRun.length} applied)`);
        } else {
          logger.warn(`⚠️ Some migrations failed (${migrationResult.errors.length} errors)`);
        }
      }
      
      // 3. Initialize improved repositories
      await this.initializeRepositories();
      logger.info('✓ Enhanced repositories initialized');
      
      // 4. Setup data integrity service
      if (enableIntegrityChecks) {
        await this.setupDataIntegrity({ enableScheduledChecks, autoFix });
        logger.info('✓ Data integrity service configured');
      }
      
      // 5. Run initial integrity check
      if (enableIntegrityChecks) {
        logger.info('Running initial data integrity check...');
        const report = await dataIntegrityService.runFullCheck({ 
          fix: autoFix, 
          includeDetails: false 
        });
        
        if (report.totalIssues === 0) {
          logger.info('✓ No data integrity issues found');
        } else {
          logger.warn(`⚠️ Found ${report.totalIssues} data integrity issues`);
          if (autoFix && report.summary.totalFixes > 0) {
            logger.info(`✓ Auto-fixed ${report.summary.totalFixes} issues`);
          }
        }
      }
      
      this.initialized = true;
      const initTime = Date.now() - this.startupTime;
      logger.info(`✅ Enhanced database service initialized in ${initTime}ms`);
      
      return true;
    } catch (error) {
      logger.error(`❌ Failed to initialize database service: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize enhanced repositories
   * @private
   */
  async initializeRepositories() {
    // Initialize improved port repository
    const portRepo = new ImprovedPortRepository();
    this.repositories.set('port', portRepo);
    
    // Register repository with integrity service
    dataIntegrityService.registerRepository('port', portRepo);
    
    logger.debug('Enhanced repositories registered');
  }
  
  /**
   * Setup data integrity service
   * @private
   */
  async setupDataIntegrity(options = {}) {
    const { enableScheduledChecks = false, autoFix = false } = options;
    
    // Configure integrity service
    dataIntegrityService.options.enableAutoFix = autoFix;
    dataIntegrityService.options.enableScheduledChecks = enableScheduledChecks;
    
    // Start scheduled checks if enabled
    if (enableScheduledChecks) {
      dataIntegrityService.startScheduledChecks();
      logger.info('📅 Scheduled integrity checks enabled');
    }
  }
  
  /**
   * Get repository instance
   * @param {string} name - Repository name
   * @returns {Object} Repository instance
   */
  getRepository(name) {
    if (!this.initialized) {
      throw new Error('Database service not initialized');
    }
    
    const repository = this.repositories.get(name);
    if (!repository) {
      throw new Error(`Repository '${name}' not found`);
    }
    
    return repository;
  }
  
  /**
   * Get connection pool statistics
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    return pool.getStats();
  }
  
  /**
   * Get migration status
   * @returns {Promise<Object>} Migration status
   */
  async getMigrationStatus() {
    return migrationRunner.getStatus();
  }
  
  /**
   * Run data integrity check
   * @param {Object} options - Check options
   * @returns {Promise<Object>} Integrity report
   */
  async runIntegrityCheck(options = {}) {
    return dataIntegrityService.runFullCheck(options);
  }
  
  /**
   * Get last integrity report
   * @returns {Object|null} Last report
   */
  getLastIntegrityReport() {
    return dataIntegrityService.getLastReport();
  }
  
  /**
   * Execute database operation with automatic connection management
   * @param {Function} operation - Database operation
   * @returns {Promise<any>} Operation result
   */
  async withConnection(operation) {
    if (!this.initialized) {
      throw new Error('Database service not initialized');
    }
    
    const connection = await pool.acquire();
    try {
      return await operation(connection);
    } finally {
      await pool.release(connection);
    }
  }
  
  /**
   * Execute database operation within a transaction
   * @param {Function} operation - Database operation
   * @returns {Promise<any>} Operation result
   */
  async withTransaction(operation) {
    return this.withConnection(async (connection) => {
      return connection.transaction(async (tx) => {
        return operation(tx);
      });
    });
  }
  
  /**
   * Get service health status
   * @returns {Object} Health status
   */
  getHealth() {
    const poolStats = this.getPoolStats();
    const lastReport = this.getLastIntegrityReport();
    
    return {
      initialized: this.initialized,
      startupTime: this.startupTime,
      uptime: this.startupTime ? Date.now() - this.startupTime : 0,
      connectionPool: {
        total: poolStats.total,
        active: poolStats.active,
        waiting: poolStats.waiting,
        avgWaitTime: poolStats.avgWaitTime
      },
      dataIntegrity: {
        lastCheckTime: lastReport?.timestamp,
        totalIssues: lastReport?.totalIssues || 0,
        scheduledChecksEnabled: dataIntegrityService.options.enableScheduledChecks
      },
      repositories: Array.from(this.repositories.keys())
    };
  }
  
  /**
   * Graceful shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down database service...');
    
    try {
      // Stop scheduled integrity checks
      dataIntegrityService.stopScheduledChecks();
      
      // Shutdown connection pool
      await pool.shutdown();
      
      this.initialized = false;
      logger.info('✅ Database service shutdown complete');
    } catch (error) {
      logger.error(`Error during database service shutdown: ${error.message}`);
      throw error;
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

module.exports = {
  DatabaseService,
  databaseService
};