/**
 * FileStorage.js
 * File-based storage implementation for TráfegoDNS
 * Provides methods for reading and writing JSON files
 */
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class FileStorage {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }
  
  /**
   * Ensure a directory exists
   * @param {string} dirPath - Directory path to ensure
   */
  async ensureDir(dirPath) {
    try {
      if (!fsSync.existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true });
        logger.debug(`Created directory: ${dirPath}`);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to create directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Read a JSON file
   * @param {string} filePath - Path to the JSON file
   * @returns {Object} - Parsed JSON object
   */
  async readJsonFile(filePath) {
    try {
      // First verify the file exists
      if (!fsSync.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const data = await fs.readFile(filePath, 'utf8');
      try {
        return JSON.parse(data);
      } catch (parseError) {
        logger.error(`Invalid JSON in file ${filePath}: ${parseError.message}`);
        throw new Error(`Invalid JSON in file ${filePath}: ${parseError.message}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.error(`File not found: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      } else if (error instanceof SyntaxError) {
        logger.error(`Invalid JSON in file ${filePath}: ${error.message}`);
        throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
      }
      logger.error(`Error reading file ${filePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Write a JSON file
   * @param {string} filePath - Path to write the JSON file
   * @param {Object} data - Data to write
   * @param {boolean} useTemporary - Whether to use a temporary file for atomic writes
   */
  async writeJsonFile(filePath, data, useTemporary = true) {
    try {
      // Ensure parent directory exists
      const dirPath = path.dirname(filePath);
      await this.ensureDir(dirPath);
      
      const jsonData = JSON.stringify(data, null, 2);
      
      if (useTemporary) {
        // Write to temporary file first for atomicity
        const tempPath = `${filePath}.tmp`;
        await fs.writeFile(tempPath, jsonData, 'utf8');
        
        // Rename to target path (atomic on most file systems)
        await fs.rename(tempPath, filePath);
        logger.debug(`Wrote file: ${filePath} (via temporary file)`);
      } else {
        // Direct write
        await fs.writeFile(filePath, jsonData, 'utf8');
        logger.debug(`Wrote file: ${filePath} (direct write)`);
      }
    } catch (error) {
      logger.error(`Error writing file ${filePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a file exists
   * @param {string} filePath - Path to check
   * @returns {boolean} - True if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Delete a file
   * @param {string} filePath - Path to delete
   */
  async deleteFile(filePath) {
    try {
      if (!fsSync.existsSync(filePath)) {
        return true; // File already doesn't exist, which is fine
      }
      
      await fs.unlink(filePath);
      logger.debug(`Deleted file: ${filePath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already doesn't exist, which is fine
        return true;
      }
      logger.error(`Error deleting file ${filePath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get a file lock
   * @param {string} filePath - Path to lock
   * @returns {Object} - Lock object with release method
   */
  getLock(filePath) {
    const lockPath = `${filePath}.lock`;
    
    // Try to create lock file
    try {
      // Use sync methods to avoid race conditions
      fsSync.writeFileSync(lockPath, Date.now().toString(), { flag: 'wx' });
      
      // Return lock object with release method
      return {
        release: () => {
          try {
            fsSync.unlinkSync(lockPath);
            return true;
          } catch (error) {
            logger.error(`Error releasing lock ${lockPath}: ${error.message}`);
            return false;
          }
        }
      };
    } catch (error) {
      // If the lock file already exists, check if it's stale
      if (error.code === 'EEXIST') {
        try {
          // Read lock timestamp
          const lockTime = parseInt(fsSync.readFileSync(lockPath, 'utf8'), 10);
          const currentTime = Date.now();
          
          // If lock is older than 5 minutes, consider it stale
          if (currentTime - lockTime > 5 * 60 * 1000) {
            logger.warn(`Found stale lock file: ${lockPath}, overriding`);
            fsSync.unlinkSync(lockPath);
            
            // Try to create lock again
            return this.getLock(filePath);
          }
          
          throw new Error(`File is locked: ${filePath}`);
        } catch (innerError) {
          throw new Error(`Error checking lock file: ${innerError.message}`);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * List files in a directory
   * @param {string} dirPath - Directory to list
   * @param {string} extension - Optional file extension filter
   * @returns {Array<string>} - Array of file paths
   */
  async listFiles(dirPath, extension = null) {
    try {
      if (!fsSync.existsSync(dirPath)) {
        return [];
      }
      
      const files = await fs.readdir(dirPath);
      
      if (extension) {
        return files.filter(file => file.endsWith(extension))
          .map(file => path.join(dirPath, file));
      } else {
        return files.map(file => path.join(dirPath, file));
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      logger.error(`Error listing files in ${dirPath}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Copy a file
   * @param {string} sourcePath - Source path
   * @param {string} destPath - Destination path
   */
  async copyFile(sourcePath, destPath) {
    try {
      // Ensure source exists
      if (!fsSync.existsSync(sourcePath)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      // Ensure destination directory exists
      await this.ensureDir(path.dirname(destPath));
      
      // Copy file
      await fs.copyFile(sourcePath, destPath);
      logger.debug(`Copied ${sourcePath} to ${destPath}`);
    } catch (error) {
      logger.error(`Error copying file from ${sourcePath} to ${destPath}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = FileStorage;