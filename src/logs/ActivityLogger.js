/**
 * ActivityLogger.js
 * Activity logging system for TráfegoDNS
 * Provides persistent activity logging with rotation
 */
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Add this line for sync operations
const logger = require('../utils/logger');
const LogRotation = require('./LogRotation');
const { debounce } = require('../utils/helpers');

class ActivityLogger {
  constructor(config, dataStore) {
    this.config = config;
    this.dataStore = dataStore;
    
    // Base directory for logs
    this.baseDir = path.join('/config', 'data', 'logs');
    
    // Current log file
    this.currentLogFile = path.join(this.baseDir, 'activity-log.current.json');
    
    // In-memory log buffer
    this.logBuffer = [];
    
    // Log configuration
    this.logConfig = {
      maxSize: 5 * 1024 * 1024, // 5MB default
      maxFiles: 10, // Default number of files to keep
      retentionDays: 30, // Default days to keep logs
      flushInterval: 5000 // 5 seconds default
    };
    
    // Log rotation manager
    this.rotation = new LogRotation(this.baseDir, this.logConfig);
    
    // Debounced flush function to avoid too frequent writes
    this.debouncedFlush = debounce(this.flush.bind(this), this.logConfig.flushInterval);
    
    // Track initialization
    this.initialized = false;
  }
  
  /**
   * Initialize the logger
   */
  async init() {
    try {
      logger.debug('Initializing ActivityLogger...');
      
      // Ensure log directory exists
      await fs.mkdir(this.baseDir, { recursive: true });
      
      // Load any custom log config from app config
      await this.loadLogConfig();
      
      // Set up log rotation timer
      this.rotation.setConfig(this.logConfig);
      
      // Load current log file into memory if it exists
      await this.loadCurrentLog();
      
      // Flush logs and check rotation after initialization
      await this.flush();
      
      // Set up periodic flushing
      this.flushInterval = setInterval(() => {
        this.flush().catch(err => {
          logger.error(`Error flushing activity logs: ${err.message}`);
        });
      }, this.logConfig.flushInterval);
      
      this.initialized = true;
      logger.success('ActivityLogger initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize ActivityLogger: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Load log configuration from app config
   */
  async loadLogConfig() {
    try {
      // If we have a dataStore, try to load config
      if (this.dataStore) {
        const appConfig = await this.dataStore.getAppConfig();
        
        if (appConfig.logging) {
          // Update log configuration
          this.logConfig = {
            ...this.logConfig,
            ...appConfig.logging
          };
          
          logger.debug('Loaded custom log configuration');
        }
      }
    } catch (error) {
      logger.error(`Error loading log configuration: ${error.message}`);
      // Continue with default config
    }
  }
  
  /**
   * Load current log file into memory if it exists
   */
  async loadCurrentLog() {
    try {
      // Check if the file exists
      if (fsSync.existsSync(this.currentLogFile)) {
        // Read and parse the file
        const data = await fs.readFile(this.currentLogFile, 'utf8');
        const logs = JSON.parse(data);
        
        if (Array.isArray(logs)) {
          this.logBuffer = logs;
          logger.debug(`Loaded ${logs.length} existing log entries`);
        } else {
          logger.warn('Current log file exists but is not a valid array, starting empty');
          this.logBuffer = [];
        }
      } else {
        // File doesn't exist, start with empty buffer
        logger.debug('No existing activity log file, starting empty');
        this.logBuffer = [];
      }
    } catch (error) {
      logger.error(`Error loading current log file: ${error.message}`);
      // Start with empty buffer on error
      this.logBuffer = [];
    }
  }
  
  /**
   * Log an activity
   * @param {Object} activity - Activity to log
   */
  async log(activity) {
    await this.ensureInitialized();
    
    // Create a log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...activity
    };
    
    // Add to buffer
    this.logBuffer.push(logEntry);
    
    // Mark console log based on type
    switch (activity.type) {
      case 'create':
        logger.info(`✨ ${activity.message}`);
        break;
      case 'update':
        logger.info(`📝 ${activity.message}`);
        break;
      case 'delete':
        logger.info(`🗑️ ${activity.message}`);
        break;
      case 'error':
        logger.error(`❌ ${activity.message}`);
        break;
      case 'warning':
        logger.warn(`⚠️ ${activity.message}`);
        break;
      case 'info':
      default:
        logger.info(`ℹ️ ${activity.message}`);
        break;
    }
    
    // Trigger debounced flush
    this.debouncedFlush();
    
    return logEntry;
  }
  
  /**
   * Log a DNS record creation
   * @param {Object} record - The created record
   */
  logRecordCreated(record) {
    return this.log({
      type: 'create',
      action: 'dns_record_created',
      message: `Created ${record.type} record for ${record.name}`,
      record: {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied
      }
    });
  }
  
  /**
   * Log a DNS record update
   * @param {Object} oldRecord - The old record
   * @param {Object} newRecord - The updated record
   */
  logRecordUpdated(oldRecord, newRecord) {
    return this.log({
      type: 'update',
      action: 'dns_record_updated',
      message: `Updated ${newRecord.type} record for ${newRecord.name}`,
      record: {
        type: newRecord.type,
        name: newRecord.name,
        content: newRecord.content,
        ttl: newRecord.ttl,
        proxied: newRecord.proxied
      },
      changes: getRecordChanges(oldRecord, newRecord)
    });
  }
  
  /**
   * Log a DNS record deletion
   * @param {Object} record - The deleted record
   */
  logRecordDeleted(record) {
    return this.log({
      type: 'delete',
      action: 'dns_record_deleted',
      message: `Deleted ${record.type} record for ${record.name}`,
      record: {
        type: record.type,
        name: record.name,
        content: record.content
      }
    });
  }
  
  /**
   * Log DNS cache refresh
   * @param {number} recordCount - Number of records in cache
   */
  logCacheRefreshed(recordCount) {
    return this.log({
      type: 'info',
      action: 'dns_cache_refreshed',
      message: `Refreshed DNS cache with ${recordCount} records`,
      details: { recordCount }
    });
  }
  
  /**
   * Log orphaned record cleanup
   * @param {Array} records - Records that were cleaned up
   */
  logOrphanedCleanup(records) {
    return this.log({
      type: 'cleanup',
      action: 'orphaned_records_cleanup',
      message: `Cleaned up ${records.length} orphaned DNS records`,
      details: {
        recordCount: records.length,
        records: records.map(r => ({ type: r.type, name: r.name }))
      }
    });
  }
  
  /**
   * Log error events
   * @param {string} source - Error source
   * @param {string} message - Error message
   * @param {Object} details - Additional error details
   */
  logError(source, message, details = {}) {
    return this.log({
      type: 'error',
      action: 'error',
      message: message,
      source: source,
      details: details
    });
  }
  
  /**
   * Log configuration changes
   * @param {string} setting - Setting that was changed
   * @param {any} oldValue - Old setting value
   * @param {any} newValue - New setting value
   */
  logConfigChanged(setting, oldValue, newValue) {
    return this.log({
      type: 'info',
      action: 'config_changed',
      message: `Configuration changed: ${setting}`,
      details: {
        setting,
        oldValue,
        newValue
      }
    });
  }
  
  /**
   * Flush logs to disk
   */
  async flush() {
    if (this.logBuffer.length === 0) {
      return; // Nothing to flush
    }
    
    try {
      // Write buffer to current log file
      await fs.writeFile(
        this.currentLogFile,
        JSON.stringify(this.logBuffer, null, 2),
        'utf8'
      );
      
      // Check if rotation is needed
      await this.checkRotation();
    } catch (error) {
      logger.error(`Error flushing activity logs: ${error.message}`);
      // Don't clear buffer on error so we can retry
    }
  }
  
  /**
   * Check if log rotation is needed
   */
  async checkRotation() {
    try {
      const stats = await fs.stat(this.currentLogFile);
      
      // Check if file exceeds max size
      if (stats.size >= this.logConfig.maxSize) {
        await this.rotateLog();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Error checking log rotation: ${error.message}`);
      }
    }
  }
  
  /**
   * Rotate the log file
   */
  async rotateLog() {
    try {
      // Let rotation manager handle the rotation
      await this.rotation.rotateLog(this.currentLogFile, this.logBuffer);
      
      // Clear buffer after successful rotation
      this.logBuffer = [];
      
      logger.debug('Rotated activity log file');
    } catch (error) {
      logger.error(`Error rotating activity log: ${error.message}`);
    }
  }
  
  /**
   * Get activity logs with filtering
   * @param {Object} filter - Filter options
   * @param {number} limit - Maximum number of logs to return
   * @param {number} offset - Offset for pagination
   */
  async getLogs(filter = {}, limit = 100, offset = 0) {
    await this.ensureInitialized();
    
    // First make sure everything is flushed
    await this.flush();
    
    // Get logs from current buffer
    let logs = [...this.logBuffer];
    
    // If we need more logs than in buffer, load from rotated files
    if (offset + limit > logs.length) {
      const additionalLogs = await this.rotation.getLogsFromRotatedFiles(filter);
      logs = [...logs, ...additionalLogs];
    }
    
    // Apply filtering
    if (filter.type) {
      logs = logs.filter(log => log.type === filter.type);
    }
    
    if (filter.action) {
      logs = logs.filter(log => log.action === filter.action);
    }
    
    if (filter.search) {
      const searchTerm = filter.search.toLowerCase();
      logs = logs.filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchTerm))
      );
    }
    
    // Apply date range filtering
    if (filter.startDate) {
      const startDate = new Date(filter.startDate);
      logs = logs.filter(log => new Date(log.timestamp) >= startDate);
    }
    
    if (filter.endDate) {
      const endDate = new Date(filter.endDate);
      logs = logs.filter(log => new Date(log.timestamp) <= endDate);
    }
    
    // Sort by timestamp descending (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const paginatedLogs = logs.slice(offset, offset + limit);
    
    return {
      logs: paginatedLogs,
      total: logs.length,
      hasMore: offset + limit < logs.length
    };
  }
  
  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    try {
      await this.rotation.cleanupOldLogs();
    } catch (error) {
      logger.error(`Error cleaning up old logs: ${error.message}`);
    }
  }
  
  /**
   * Ensure the logger is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }
  
  /**
   * Clean up resources on shutdown
   */
  async shutdown() {
    // Clear flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    await this.flush();
    
    logger.debug('ActivityLogger shut down');
  }
}

/**
 * Get changes between old and new record
 * @param {Object} oldRecord - Old record
 * @param {Object} newRecord - New record
 * @returns {Object} - Object with changed fields
 */
function getRecordChanges(oldRecord, newRecord) {
  const changes = {};
  
  // Compare content
  if (oldRecord.content !== newRecord.content) {
    changes.content = {
      from: oldRecord.content,
      to: newRecord.content
    };
  }
  
  // Compare TTL
  if (oldRecord.ttl !== newRecord.ttl) {
    changes.ttl = {
      from: oldRecord.ttl,
      to: newRecord.ttl
    };
  }
  
  // Compare proxied status
  if (oldRecord.proxied !== newRecord.proxied) {
    changes.proxied = {
      from: oldRecord.proxied,
      to: newRecord.proxied
    };
  }
  
  // Compare any other fields based on record type
  if (oldRecord.type === 'MX' && newRecord.type === 'MX') {
    if (oldRecord.priority !== newRecord.priority) {
      changes.priority = {
        from: oldRecord.priority,
        to: newRecord.priority
      };
    }
  }
  
  if (oldRecord.type === 'SRV' && newRecord.type === 'SRV') {
    if (oldRecord.priority !== newRecord.priority) {
      changes.priority = {
        from: oldRecord.priority,
        to: newRecord.priority
      };
    }
    
    if (oldRecord.weight !== newRecord.weight) {
      changes.weight = {
        from: oldRecord.weight,
        to: newRecord.weight
      };
    }
    
    if (oldRecord.port !== newRecord.port) {
      changes.port = {
        from: oldRecord.port,
        to: newRecord.port
      };
    }
  }
  
  return changes;
}

module.exports = ActivityLogger;