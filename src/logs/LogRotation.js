/**
 * LogRotation.js
 * Handles rotation of activity log files
 */
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const zlib = require('zlib');
const util = require('util');
const logger = require('../utils/logger');

// Promisify gzip
const gzipAsync = util.promisify(zlib.gzip);
const gunzipAsync = util.promisify(zlib.gunzip);

class LogRotation {
  constructor(logDir, config = {}) {
    this.logDir = logDir;
    this.config = {
      maxSize: 5 * 1024 * 1024, // 5MB default
      maxFiles: 10, // Default number of files to keep
      retentionDays: 30, // Default days to keep logs
      compressAfterDays: 1, // Compress logs older than this many days
      ...config
    };
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  setConfig(config) {
    this.config = {
      ...this.config,
      ...config
    };
  }
  
  /**
   * Rotate the current log file
   * @param {string} currentLogFile - Path to current log file
   * @param {Array} logBuffer - Current log buffer
   */
  async rotateLog(currentLogFile, logBuffer = []) {
    try {
      // Generate new filename with date
      const now = new Date();
      const rotatedFileName = `activity-log.${this.formatDate(now)}.json`;
      const rotatedFilePath = path.join(this.logDir, rotatedFileName);
      
      // Check if file already exists
      let uniquePath = rotatedFilePath;
      let counter = 1;
      
      while (await this.fileExists(uniquePath)) {
        // If file already exists, add a counter
        uniquePath = path.join(
          this.logDir, 
          `activity-log.${this.formatDate(now)}_${counter}.json`
        );
        counter++;
      }
      
      // If buffer is provided, write directly
      if (logBuffer && logBuffer.length > 0) {
        await fs.writeFile(
          uniquePath,
          JSON.stringify(logBuffer, null, 2),
          'utf8'
        );
      } else {
        // Otherwise, move the current file
        await fs.rename(currentLogFile, uniquePath);
        
        // Create a new empty current log file
        await fs.writeFile(currentLogFile, '[]', 'utf8');
      }
      
      // Compress old log files
      await this.compressOldLogs();
      
      // Clean up old log files
      await this.cleanupOldLogs();
      
      return uniquePath;
    } catch (error) {
      logger.error(`Error rotating log file: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Compress log files older than the threshold
   */
  async compressOldLogs() {
    try {
      // Get all uncompressed log files
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(
        file => file.startsWith('activity-log.') && 
               file.endsWith('.json') && 
               file !== 'activity-log.current.json'
      );
      
      // Threshold date for compression
      const compressThreshold = new Date();
      compressThreshold.setDate(
        compressThreshold.getDate() - this.config.compressAfterDays
      );
      
      for (const file of logFiles) {
        try {
          // Extract date from filename
          const dateMatch = file.match(/activity-log\.(\d{4}-\d{2}-\d{2})/);
          
          if (dateMatch) {
            const fileDate = new Date(dateMatch[1]);
            
            // Compare with threshold
            if (fileDate < compressThreshold) {
              const filePath = path.join(this.logDir, file);
              const gzFilePath = `${filePath}.gz`;
              
              // Check if already compressed
              if (await this.fileExists(gzFilePath)) {
                continue;
              }
              
              // Compress file
              await this.compressFile(filePath, gzFilePath);
            }
          }
        } catch (innerError) {
          logger.error(`Error processing log file ${file}: ${innerError.message}`);
          // Continue with next file
        }
      }
    } catch (error) {
      logger.error(`Error compressing old logs: ${error.message}`);
    }
  }
  
  /**
   * Compress a file using gzip
   * @param {string} filePath - Path to file to compress
   * @param {string} gzFilePath - Path to compressed output
   */
  async compressFile(filePath, gzFilePath) {
    try {
      // Read file
      const fileContent = await fs.readFile(filePath);
      
      // Compress content
      const compressed = await gzipAsync(fileContent);
      
      // Write compressed file
      await fs.writeFile(gzFilePath, compressed);
      
      // Delete original file
      await fs.unlink(filePath);
      
      logger.debug(`Compressed log file: ${path.basename(filePath)}`);
    } catch (error) {
      logger.error(`Error compressing file ${filePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Decompress a gzipped file
   * @param {string} gzFilePath - Path to compressed file
   * @returns {string} - Decompressed content
   */
  async decompressFile(gzFilePath) {
    try {
      // Read compressed file
      const fileContent = await fs.readFile(gzFilePath);
      
      // Decompress content
      const decompressed = await gunzipAsync(fileContent);
      
      return decompressed.toString('utf8');
    } catch (error) {
      logger.error(`Error decompressing file ${gzFilePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    try {
      // Get all log files
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(
        file => (file.startsWith('activity-log.') && 
               (file.endsWith('.json') || file.endsWith('.json.gz'))) && 
               file !== 'activity-log.current.json'
      );
      
      // Get file stats with dates
      const fileStats = [];
      
      for (const file of logFiles) {
        try {
          const filePath = path.join(this.logDir, file);
          const stats = await fs.stat(filePath);
          
          fileStats.push({
            file,
            path: filePath,
            date: stats.mtime
          });
        } catch (error) {
          logger.error(`Error getting stats for file ${file}: ${error.message}`);
          // Continue with next file
        }
      }
      
      // Sort by date (newest first)
      fileStats.sort((a, b) => b.date - a.date);
      
      // Apply retention rules
      
      // 1. Keep files based on maxFiles
      if (this.config.maxFiles > 0 && fileStats.length > this.config.maxFiles) {
        const filesToDelete = fileStats.slice(this.config.maxFiles);
        
        for (const fileInfo of filesToDelete) {
          try {
            await fs.unlink(fileInfo.path);
            logger.debug(`Deleted old log file: ${fileInfo.file}`);
          } catch (error) {
            logger.error(`Error deleting old log file ${fileInfo.file}: ${error.message}`);
          }
        }
        
        // Update fileStats after deletion
        fileStats.splice(this.config.maxFiles);
      }
      
      // 2. Delete files older than retentionDays
      if (this.config.retentionDays > 0) {
        const retentionThreshold = new Date();
        retentionThreshold.setDate(
          retentionThreshold.getDate() - this.config.retentionDays
        );
        
        for (const fileInfo of fileStats) {
          if (fileInfo.date < retentionThreshold) {
            try {
              await fs.unlink(fileInfo.path);
              logger.debug(`Deleted expired log file: ${fileInfo.file}`);
            } catch (error) {
              logger.error(`Error deleting expired log file ${fileInfo.file}: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error cleaning up old logs: ${error.message}`);
    }
  }
  
  /**
   * Get logs from rotated files
   * @param {Object} filter - Filter criteria
   * @param {number} maxFiles - Maximum number of files to read
   */
  async getLogsFromRotatedFiles(filter = {}, maxFiles = 5) {
    try {
      // Get all log files
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(
        file => (file.startsWith('activity-log.') && 
               (file.endsWith('.json') || file.endsWith('.json.gz'))) && 
               file !== 'activity-log.current.json'
      );
      
      // Get file stats with dates
      const fileStats = [];
      
      for (const file of logFiles) {
        try {
          const filePath = path.join(this.logDir, file);
          const stats = await fs.stat(filePath);
          
          fileStats.push({
            file,
            path: filePath,
            date: stats.mtime,
            isCompressed: file.endsWith('.gz')
          });
        } catch (error) {
          logger.error(`Error getting stats for file ${file}: ${error.message}`);
          // Continue with next file
        }
      }
      
      // Sort by date (newest first)
      fileStats.sort((a, b) => b.date - a.date);
      
      // Limit to maxFiles
      const filesToRead = fileStats.slice(0, maxFiles);
      
      // Read and collect logs
      const allLogs = [];
      
      for (const fileInfo of filesToRead) {
        try {
          let fileContent;
          
          if (fileInfo.isCompressed) {
            // Decompress gzipped file
            fileContent = await this.decompressFile(fileInfo.path);
          } else {
            // Read uncompressed file
            fileContent = await fs.readFile(fileInfo.path, 'utf8');
          }
          
          // Parse JSON
          const logs = JSON.parse(fileContent);
          
          if (Array.isArray(logs)) {
            // Apply basic filters before merging to reduce memory usage
            let filteredLogs = logs;
            
            if (filter.type) {
              filteredLogs = filteredLogs.filter(log => log.type === filter.type);
            }
            
            if (filter.action) {
              filteredLogs = filteredLogs.filter(log => log.action === filter.action);
            }
            
            if (filter.startDate) {
              const startDate = new Date(filter.startDate);
              filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= startDate);
            }
            
            if (filter.endDate) {
              const endDate = new Date(filter.endDate);
              filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= endDate);
            }
            
            // Add to all logs
            allLogs.push(...filteredLogs);
          }
        } catch (error) {
          logger.error(`Error reading log file ${fileInfo.file}: ${error.message}`);
          // Continue with next file
        }
      }
      
      return allLogs;
    } catch (error) {
      logger.error(`Error getting logs from rotated files: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Format date as YYYY-MM-DD
   * @param {Date} date - Date to format
   * @returns {string} - Formatted date
   */
  formatDate(date) {
    return date.toISOString().slice(0, 10);
  }
  
  /**
   * Check if file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} - Whether file exists
   */
  async fileExists(filePath) {
    try {
      return fsSync.existsSync(filePath);
    } catch (error) {
      return false;
    }
  }
}

module.exports = LogRotation;