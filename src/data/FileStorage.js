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
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      // If the directory already exists, that's fine
      if (error.code !== 'EEXIST') {
        throw error;
      }
      return true;
    }
  }
  
  /**
   * Read a JSON file
   * @param {string} filePath - Path to the JSON file
   * @returns {Object} - Parsed JSON object
   */
  async readJsonFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
      }
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
    // Ensure parent directory exists
    await this.ensureDir(path.dirname(filePath));
    
    const jsonData = JSON.stringify(data, null, 2);
    
    if (useTemporary) {
      // Write to temporary file first for atomicity
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, jsonData, 'utf8');
      
      // Rename to target path (atomic on most file systems)
      await fs.rename(tempPath, filePath);
    } else {
      // Direct write
      await fs.writeFile(filePath, jsonData, 'utf8');
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
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already doesn't exist, which is fine
        return true;
      }
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
      throw error;
    }
  }
  
  /**
   * Copy a file
   * @param {string} sourcePath - Source path
   * @param {string} destPath - Destination path
   */
  async copyFile(sourcePath, destPath) {
    // Ensure destination directory exists
    await this.ensureDir(path.dirname(destPath));
    
    // Copy file
    await fs.copyFile(sourcePath, destPath);
  }
}

module.exports = FileStorage;