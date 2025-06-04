/**
 * Transaction Manager
 * Provides advanced transaction management with nested transactions,
 * automatic rollback, and transaction coordination across services
 */
const logger = require('../utils/logger');
const { pool } = require('./connectionPool');
const { errorHandler, DatabaseError } = require('../utils/errorHandler');
const { EventEmitter } = require('events');

class TransactionManager extends EventEmitter {
  constructor() {
    super();
    this.activeTransactions = new Map();
    this.transactionHistory = [];
    this.metrics = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      rolledBackTransactions: 0,
      averageExecutionTime: 0
    };
  }
  
  /**
   * Execute operation within a managed transaction
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Operation result
   */
  async executeTransaction(operation, options = {}) {
    const {
      timeout = 30000,
      retries = 3,
      isolation = 'READ_COMMITTED',
      savepoints = true,
      context = {}
    } = options;
    
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();
    
    const transactionInfo = {
      id: transactionId,
      startTime,
      context,
      status: 'started',
      savepoints: [],
      connection: null,
      timeout: null
    };
    
    this.activeTransactions.set(transactionId, transactionInfo);
    this.metrics.totalTransactions++;
    
    // Set transaction timeout
    if (timeout > 0) {
      transactionInfo.timeout = setTimeout(() => {
        this.handleTransactionTimeout(transactionId);
      }, timeout);
    }
    
    try {
      logger.debug(`Starting transaction ${transactionId}`, { context });
      this.emit('transactionStarted', transactionInfo);
      
      const result = await errorHandler.executeWithRetry(
        async (attempt) => {
          const connection = await pool.acquire();
          transactionInfo.connection = connection;
          
          try {
            const transaction = await connection.beginTransaction();
            transactionInfo.transaction = transaction;
            transactionInfo.status = 'active';
            
            // Execute the operation
            const operationResult = await operation(transaction, transactionId);
            
            // Commit transaction
            await transaction.commit();
            transactionInfo.status = 'committed';
            
            logger.debug(`Transaction ${transactionId} committed successfully`);
            this.emit('transactionCommitted', transactionInfo);
            
            return operationResult;
          } catch (error) {
            // Rollback on error
            if (transactionInfo.transaction) {
              try {
                await transactionInfo.transaction.rollback();
                transactionInfo.status = 'rolled_back';
                this.metrics.rolledBackTransactions++;
                
                logger.debug(`Transaction ${transactionId} rolled back due to error`);
                this.emit('transactionRolledBack', transactionInfo, error);
              } catch (rollbackError) {
                logger.error(`Failed to rollback transaction ${transactionId}`, {
                  error: rollbackError.message
                });
              }
            }
            
            throw new DatabaseError(
              `Transaction failed: ${error.message}`,
              null,
              'TRANSACTION_FAILED'
            );
          } finally {
            if (connection) {
              await pool.release(connection);
            }
          }
        },
        {
          maxRetries: retries,
          context: { transactionId, ...context },
          retryCondition: (error) => this.shouldRetryTransaction(error)
        }
      );
      
      // Transaction completed successfully
      this.recordTransactionSuccess(transactionInfo);
      return result;
      
    } catch (error) {
      // Transaction failed
      this.recordTransactionFailure(transactionInfo, error);
      throw error;
      
    } finally {
      // Cleanup
      this.cleanupTransaction(transactionId);
    }
  }
  
  /**
   * Execute multiple operations in a coordinated transaction
   * @param {Array<Object>} operations - Array of operations to execute
   * @param {Object} options - Transaction options
   * @returns {Promise<Array>} Array of operation results
   */
  async executeCoordinatedTransaction(operations, options = {}) {
    const { failFast = true, partialResults = false } = options;
    
    return this.executeTransaction(async (transaction, transactionId) => {
      const results = [];
      const errors = [];
      
      logger.debug(`Executing ${operations.length} coordinated operations in transaction ${transactionId}`);
      
      for (let i = 0; i < operations.length; i++) {
        const { operation, context = {}, required = true } = operations[i];
        
        try {
          // Create savepoint for this operation
          const savepointName = `op_${i}_${Date.now()}`;
          await transaction.savepoint(savepointName);
          
          // Execute operation
          const result = await operation(transaction, { 
            transactionId, 
            operationIndex: i,
            ...context 
          });
          
          results.push({ index: i, success: true, result });
          
          // Release savepoint on success
          await transaction.releaseSavepoint(savepointName);
          
        } catch (error) {
          errors.push({ index: i, error });
          
          // Rollback to savepoint
          try {
            await transaction.rollbackToSavepoint(savepointName);
          } catch (rollbackError) {
            logger.error(`Failed to rollback to savepoint ${savepointName}`, {
              error: rollbackError.message
            });
          }
          
          if (required && failFast) {
            throw new DatabaseError(
              `Required operation ${i} failed: ${error.message}`,
              null,
              'COORDINATED_TRANSACTION_FAILED'
            );
          }
          
          results.push({ index: i, success: false, error: error.message });
        }
      }
      
      // Check if we have enough successful operations
      const successCount = results.filter(r => r.success).length;
      const requiredCount = operations.filter(op => op.required !== false).length;
      
      if (successCount < requiredCount) {
        throw new DatabaseError(
          `Insufficient successful operations: ${successCount}/${requiredCount}`,
          null,
          'INSUFFICIENT_SUCCESS_RATE'
        );
      }
      
      // Return results based on partialResults setting
      if (partialResults) {
        return { results, errors, successCount, totalCount: operations.length };
      } else {
        return results.map(r => r.result);
      }
    }, options);
  }
  
  /**
   * Create a distributed transaction across multiple services
   * @param {Array<Object>} services - Services to coordinate
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Operation result
   */
  async executeDistributedTransaction(services, operation, options = {}) {
    const { compensations = [], timeout = 60000 } = options;
    
    const distributedId = this.generateTransactionId('dist');
    const executedOperations = [];
    const compensationActions = [];
    
    try {
      logger.info(`Starting distributed transaction ${distributedId}`, {
        services: services.map(s => s.name)
      });
      
      // Execute operation across all services
      const result = await this.executeTransaction(async (transaction) => {
        const serviceResults = [];
        
        for (const service of services) {
          try {
            const serviceResult = await service.execute(transaction, {
              distributedId,
              context: service.context || {}
            });
            
            serviceResults.push({
              service: service.name,
              success: true,
              result: serviceResult
            });
            
            executedOperations.push(service);
            
            // Store compensation action if provided
            if (service.compensate) {
              compensationActions.push({
                service: service.name,
                compensate: service.compensate,
                context: { ...service.context, result: serviceResult }
              });
            }
            
          } catch (error) {
            logger.error(`Service ${service.name} failed in distributed transaction`, {
              distributedId,
              error: error.message
            });
            
            throw new DatabaseError(
              `Distributed transaction failed at service ${service.name}: ${error.message}`,
              null,
              'DISTRIBUTED_TRANSACTION_FAILED'
            );
          }
        }
        
        // Execute the main operation with all service results
        return operation(transaction, serviceResults, distributedId);
        
      }, { timeout, ...options });
      
      logger.info(`Distributed transaction ${distributedId} completed successfully`);
      return result;
      
    } catch (error) {
      logger.error(`Distributed transaction ${distributedId} failed, executing compensations`, {
        error: error.message,
        executedOperations: executedOperations.length
      });
      
      // Execute compensation actions in reverse order
      await this.executeCompensations(compensationActions.reverse(), distributedId);
      
      throw error;
    }
  }
  
  /**
   * Execute compensation actions for distributed transaction rollback
   * @private
   */
  async executeCompensations(compensationActions, distributedId) {
    const compensationResults = [];
    
    for (const action of compensationActions) {
      try {
        logger.debug(`Executing compensation for service ${action.service}`, {
          distributedId
        });
        
        await action.compensate(action.context);
        compensationResults.push({ service: action.service, success: true });
        
      } catch (compensationError) {
        logger.error(`Compensation failed for service ${action.service}`, {
          distributedId,
          error: compensationError.message
        });
        
        compensationResults.push({ 
          service: action.service, 
          success: false, 
          error: compensationError.message 
        });
      }
    }
    
    const failedCompensations = compensationResults.filter(r => !r.success);
    if (failedCompensations.length > 0) {
      logger.error(`${failedCompensations.length} compensations failed for distributed transaction ${distributedId}`, {
        failed: failedCompensations
      });
    }
    
    return compensationResults;
  }
  
  /**
   * Get transaction status
   * @param {string} transactionId - Transaction ID
   * @returns {Object|null} Transaction info
   */
  getTransactionStatus(transactionId) {
    return this.activeTransactions.get(transactionId) || null;
  }
  
  /**
   * Get all active transactions
   * @returns {Array<Object>} Active transactions
   */
  getActiveTransactions() {
    return Array.from(this.activeTransactions.values());
  }
  
  /**
   * Get transaction metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * Handle transaction timeout
   * @private
   */
  async handleTransactionTimeout(transactionId) {
    const transactionInfo = this.activeTransactions.get(transactionId);
    if (!transactionInfo) return;
    
    logger.warn(`Transaction ${transactionId} timed out`, {
      duration: Date.now() - transactionInfo.startTime,
      context: transactionInfo.context
    });
    
    // Attempt to rollback timed out transaction
    if (transactionInfo.transaction) {
      try {
        await transactionInfo.transaction.rollback();
        transactionInfo.status = 'timed_out_rolled_back';
      } catch (error) {
        logger.error(`Failed to rollback timed out transaction ${transactionId}`, {
          error: error.message
        });
        transactionInfo.status = 'timed_out_failed_rollback';
      }
    }
    
    this.emit('transactionTimeout', transactionInfo);
    this.cleanupTransaction(transactionId);
  }
  
  /**
   * Should retry transaction based on error
   * @private
   */
  shouldRetryTransaction(error) {
    // Retry on lock errors
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
      return true;
    }
    
    // Retry on connection errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Don't retry validation or business logic errors
    if (error.name === 'ValidationError' || error.name === 'BusinessLogicError') {
      return false;
    }
    
    return false;
  }
  
  /**
   * Record successful transaction
   * @private
   */
  recordTransactionSuccess(transactionInfo) {
    const executionTime = Date.now() - transactionInfo.startTime;
    
    this.metrics.successfulTransactions++;
    this.updateAverageExecutionTime(executionTime);
    
    this.transactionHistory.push({
      id: transactionInfo.id,
      status: 'success',
      executionTime,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 transactions in history
    if (this.transactionHistory.length > 100) {
      this.transactionHistory = this.transactionHistory.slice(-100);
    }
  }
  
  /**
   * Record failed transaction
   * @private
   */
  recordTransactionFailure(transactionInfo, error) {
    const executionTime = Date.now() - transactionInfo.startTime;
    
    this.metrics.failedTransactions++;
    this.updateAverageExecutionTime(executionTime);
    
    this.transactionHistory.push({
      id: transactionInfo.id,
      status: 'failed',
      error: error.message,
      executionTime,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Update average execution time
   * @private
   */
  updateAverageExecutionTime(executionTime) {
    const totalCompleted = this.metrics.successfulTransactions + this.metrics.failedTransactions;
    const currentAvg = this.metrics.averageExecutionTime;
    
    this.metrics.averageExecutionTime = 
      (currentAvg * (totalCompleted - 1) + executionTime) / totalCompleted;
  }
  
  /**
   * Cleanup transaction resources
   * @private
   */
  cleanupTransaction(transactionId) {
    const transactionInfo = this.activeTransactions.get(transactionId);
    
    if (transactionInfo) {
      // Clear timeout
      if (transactionInfo.timeout) {
        clearTimeout(transactionInfo.timeout);
      }
      
      // Remove from active transactions
      this.activeTransactions.delete(transactionId);
      
      this.emit('transactionCleaned', transactionInfo);
    }
  }
  
  /**
   * Generate unique transaction ID
   * @private
   */
  generateTransactionId(prefix = 'tx') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${prefix}_${timestamp}_${random}`;
  }
}

// Create singleton instance
const transactionManager = new TransactionManager();

module.exports = {
  TransactionManager,
  transactionManager
};