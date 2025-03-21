/**
 * TransactionManager.js
 * Manages file-based transactions for TráfegoDNS
 * Provides atomic operations with rollback capability
 */
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class TransactionManager {
  constructor(fileStorage) {
    this.fileStorage = fileStorage;
    this.transactionCounter = 0;
  }
  
  /**
   * Start a new transaction
   * @returns {Transaction} - Transaction object
   */
  startTransaction() {
    const transaction = new Transaction(this.fileStorage, this.transactionCounter++);
    return transaction;
  }
}

/**
 * Transaction class
 * Represents a single transaction with commit/rollback support
 */
class Transaction {
  constructor(fileStorage, id) {
    this.fileStorage = fileStorage;
    this.id = id;
    this.operations = [];
    this.locks = [];
    this.committed = false;
    this.rolledBack = false;
    
    logger.debug(`Started transaction #${this.id}`);
  }
  
  /**
   * Write a JSON file as part of the transaction
   * @param {string} filePath - Path to write
   * @param {Object} data - Data to write
   * @returns {Promise} - Promise resolving when write completes
   */
  async writeJsonFile(filePath, data) {
    // Create backup before modifying
    await this.backupFile(filePath);
    
    // Add operation to transaction
    this.operations.push({
      type: 'write',
      filePath,
      data,
      backup: `${filePath}.bak.${this.id}`
    });
    
    // Write file directly (actual transaction is logged for rollback)
    try {
      await this.fileStorage.writeJsonFile(filePath, data, true);
      return true;
    } catch (error) {
      // If write fails, roll back immediately
      logger.error(`Transaction #${this.id} write failed: ${error.message}`);
      await this.rollback();
      throw error;
    }
  }
  
  /**
   * Delete a file as part of the transaction
   * @param {string} filePath - Path to delete
   * @returns {Promise} - Promise resolving when delete completes
   */
  async deleteFile(filePath) {
    // Create backup before deleting
    await this.backupFile(filePath);
    
    // Add operation to transaction
    this.operations.push({
      type: 'delete',
      filePath,
      backup: `${filePath}.bak.${this.id}`
    });
    
    // Delete file directly (actual transaction is logged for rollback)
    try {
      await this.fileStorage.deleteFile(filePath);
      return true;
    } catch (error) {
      // If delete fails, roll back immediately
      logger.error(`Transaction #${this.id} delete failed: ${error.message}`);
      await this.rollback();
      throw error;
    }
  }
  
  /**
   * Create a backup of a file
   * @param {string} filePath - Path to backup
   * @returns {Promise} - Promise resolving when backup completes
   */
  async backupFile(filePath) {
    const backupPath = `${filePath}.bak.${this.id}`;
    
    try {
      // Check if file exists
      const exists = await this.fileStorage.fileExists(filePath);
      
      if (exists) {
        // Copy to backup
        await this.fileStorage.copyFile(filePath, backupPath);
        logger.trace(`Transaction #${this.id} backed up ${filePath}`);
      } else {
        // Create an empty marker file to indicate original didn't exist
        await this.fileStorage.writeJsonFile(`${backupPath}.nonexistent`, { _nonexistent: true }, false);
        logger.trace(`Transaction #${this.id} marked ${filePath} as nonexistent`);
      }
      
      return backupPath;
    } catch (error) {
      logger.error(`Transaction #${this.id} backup failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Commit the transaction
   * @returns {Promise} - Promise resolving when commit completes
   */
  async commit() {
    if (this.committed || this.rolledBack) {
      throw new Error(`Transaction #${this.id} already ${this.committed ? 'committed' : 'rolled back'}`);
    }
    
    // Clean up backup files
    for (const operation of this.operations) {
      try {
        // Delete the backup file
        await this.fileStorage.deleteFile(operation.backup);
        
        // Also delete nonexistent marker if it exists
        await this.fileStorage.deleteFile(`${operation.backup}.nonexistent`);
      } catch (error) {
        logger.warn(`Transaction #${this.id} cleanup warning: ${error.message}`);
        // Continue cleanup despite errors
      }
    }
    
    // Release all locks
    this.releaseLocks();
    
    this.committed = true;
    logger.debug(`Transaction #${this.id} committed successfully`);
    
    return true;
  }
  
  /**
   * Roll back the transaction
   * @returns {Promise} - Promise resolving when rollback completes
   */
  async rollback() {
    if (this.committed || this.rolledBack) {
      throw new Error(`Transaction #${this.id} already ${this.committed ? 'committed' : 'rolled back'}`);
    }
    
    // Restore files from backup
    for (const operation of this.operations) {
      try {
        const nonexistentMarker = `${operation.backup}.nonexistent`;
        const nonexistentExists = await this.fileStorage.fileExists(nonexistentMarker);
        
        if (nonexistentExists) {
          // Original file didn't exist, so delete the current one
          await this.fileStorage.deleteFile(operation.filePath);
          await this.fileStorage.deleteFile(nonexistentMarker);
        } else {
          // Restore from backup
          const backupExists = await this.fileStorage.fileExists(operation.backup);
          
          if (backupExists) {
            // Copy backup back to original
            await this.fileStorage.copyFile(operation.backup, operation.filePath);
            await this.fileStorage.deleteFile(operation.backup);
          }
        }
      } catch (error) {
        logger.error(`Transaction #${this.id} rollback error: ${error.message}`);
        // Continue rollback despite errors
      }
    }
    
    // Release all locks
    this.releaseLocks();
    
    this.rolledBack = true;
    logger.debug(`Transaction #${this.id} rolled back`);
    
    return true;
  }
  
  /**
   * Acquire a lock on a file
   * @param {string} filePath - Path to lock
   * @returns {Promise} - Promise resolving when lock is acquired
   */
  async acquireLock(filePath) {
    try {
      const lock = this.fileStorage.getLock(filePath);
      this.locks.push({ filePath, lock });
      return lock;
    } catch (error) {
      throw new Error(`Failed to acquire lock on ${filePath}: ${error.message}`);
    }
  }
  
  /**
   * Release all locks held by this transaction
   */
  releaseLocks() {
    for (const { filePath, lock } of this.locks) {
      try {
        lock.release();
      } catch (error) {
        logger.warn(`Failed to release lock on ${filePath}: ${error.message}`);
      }
    }
    
    this.locks = [];
  }
  
  /**
   * Destructor to ensure locks are released
   */
  destroy() {
    this.releaseLocks();
  }