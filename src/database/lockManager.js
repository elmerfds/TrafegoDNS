/**
 * Database lock manager
 * Provides file-based advisory locking to coordinate database operations
 * between multiple processes.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class LockManager {
  constructor() {
    this.dataDir = path.join(process.env.CONFIG_DIR || '/config', 'data');
    this.migrationLockFile = path.join(this.dataDir, '.migration.lock');
    this.lockFileDescriptor = null;
    this.lockOwner = false;
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        logger.error(`Failed to create data directory: ${error.message}`);
      }
    }
  }

  /**
   * Acquire an exclusive lock for database initialization
   * Uses OS-level file locking for reliability across processes
   * @param {number} timeout - Maximum time to wait for lock in milliseconds
   * @returns {Promise<boolean>} Whether lock was acquired
   */
  async acquireLock(timeout = 10000) {
    if (this.lockOwner) {
      logger.debug('Already own the lock, no need to acquire again');
      return true;
    }

    const startTime = Date.now();
    let attemptCount = 0;
    
    // First, clear any stale lock files
    try {
      if (fs.existsSync(this.migrationLockFile)) {
        const stats = fs.statSync(this.migrationLockFile);
        const lockAge = Date.now() - stats.mtimeMs;
        
        // If lock is older than 2 minutes, consider it stale
        if (lockAge > 120000) {
          logger.warn('Removing stale migration lock file');
          fs.unlinkSync(this.migrationLockFile);
        }
      }
    } catch (error) {
      logger.warn(`Error checking stale lock: ${error.message}`);
    }
    
    // Create lock file if it doesn't exist
    if (!fs.existsSync(this.migrationLockFile)) {
      try {
        // Create an empty file
        fs.writeFileSync(this.migrationLockFile, process.pid.toString(), { flag: 'wx' });
        
        // If we successfully created the file, we have the lock
        this.lockOwner = true;
        logger.debug(`Database lock acquired by process ${process.pid} (created new lock file)`);
        return true;
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger.error(`Failed to create lock file: ${error.message}`);
          // Try to continue with lock acquisition even if file creation failed
        }
        // If EEXIST, file was created by another process, continue to lock attempt
      }
    }
    
    // Try to open and lock the file
    while (true) {
      attemptCount++;
      
      try {
        // Open file for read/write 
        this.lockFileDescriptor = fs.openSync(this.migrationLockFile, 'r+');
        
        // Try to get exclusive lock
        try {
          // For Windows and WSL compatibility, use existence check
          const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
          
          // If the file is empty or contains our PID, we can claim it
          if (!lockContent || lockContent === process.pid.toString()) {
            // Write our PID to the file
            fs.writeFileSync(this.migrationLockFile, process.pid.toString());
            this.lockOwner = true;
            logger.debug(`Database lock acquired by process ${process.pid}`);
            return true;
          }
          
          // If it contains another PID, check if that process still exists
          const otherPid = parseInt(lockContent, 10);
          if (isNaN(otherPid)) {
            // Invalid PID, overwrite with ours
            fs.writeFileSync(this.migrationLockFile, process.pid.toString());
            this.lockOwner = true;
            logger.debug(`Database lock acquired by process ${process.pid} (invalid previous owner)`);
            return true;
          }
          
          // Log at debug level for most attempts, info level every 5 attempts
          if (attemptCount % 20 === 0) {
            logger.info(`Lock owned by process ${otherPid}, waited ${Math.round((Date.now() - startTime)/1000)}s so far...`);
          } else {
            logger.debug(`Lock owned by process ${otherPid}, waiting... (attempt ${attemptCount})`);
          }
        } catch (lockError) {
          // Log at debug level to reduce noise
          logger.debug(`Error during lock attempt: ${lockError.message}`);
        }
        
        // Close file and try again later
        if (this.lockFileDescriptor !== null) {
          fs.closeSync(this.lockFileDescriptor);
          this.lockFileDescriptor = null;
        }
      } catch (error) {
        // Log at debug level to reduce noise
        logger.debug(`Failed to open lock file: ${error.message}`);
      }
      
      // Check if we've timed out
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeout) {
        logger.error(`Failed to acquire lock after ${Math.round(elapsedTime/1000)}s timeout (${attemptCount} attempts)`);
        
        // Last resort: force acquire if lock exists but is very old (10+ minutes)
        try {
          if (fs.existsSync(this.migrationLockFile)) {
            const stats = fs.statSync(this.migrationLockFile);
            const lockAge = Date.now() - stats.mtimeMs;
            
            if (lockAge > 600000) { // 10 minutes
              logger.warn(`Lock file is over 10 minutes old, forcibly acquiring`);
              fs.writeFileSync(this.migrationLockFile, process.pid.toString());
              this.lockOwner = true;
              return true;
            }
          }
        } catch (finalError) {
          logger.error(`Failed during last-resort lock acquisition: ${finalError.message}`);
        }
        
        return false;
      }
      
      // Gradually increase wait time between attempts
      const waitTime = Math.min(1000, 100 + Math.floor(attemptCount / 10) * 100);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Release the lock if we own it
   * @returns {boolean} Whether release was successful
   */
  releaseLock() {
    if (!this.lockOwner) {
      logger.debug('Not the lock owner, nothing to release');
      return true;
    }
    
    try {
      // Read current lock content to ensure we still own it
      if (fs.existsSync(this.migrationLockFile)) {
        const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
        if (lockContent !== process.pid.toString()) {
          logger.warn(`Lock was stolen by process ${lockContent}, not releasing`);
          this.lockOwner = false;
          return false;
        }
        
        // Delete the lock file
        fs.unlinkSync(this.migrationLockFile);
      }
      
      // Close file descriptor if open
      if (this.lockFileDescriptor !== null) {
        fs.closeSync(this.lockFileDescriptor);
        this.lockFileDescriptor = null;
      }
      
      this.lockOwner = false;
      logger.debug(`Database lock released by process ${process.pid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to release lock: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a lock is currently held by any process
   * @returns {boolean} Whether lock exists
   */
  isLocked() {
    try {
      if (!fs.existsSync(this.migrationLockFile)) {
        return false;
      }
      
      const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
      return !!lockContent;
    } catch (error) {
      logger.error(`Error checking lock status: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if we are the current lock owner
   * @returns {boolean} Whether we own the lock
   */
  isLockOwner() {
    if (!this.lockOwner) {
      return false;
    }
    
    try {
      if (!fs.existsSync(this.migrationLockFile)) {
        this.lockOwner = false;
        return false;
      }
      
      const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
      const isOwner = lockContent === process.pid.toString();
      
      if (!isOwner) {
        this.lockOwner = false;
      }
      
      return isOwner;
    } catch (error) {
      logger.error(`Error checking lock ownership: ${error.message}`);
      this.lockOwner = false;
      return false;
    }
  }
}

module.exports = new LockManager();