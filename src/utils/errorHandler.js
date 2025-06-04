/**
 * Enhanced Error Handler
 * Comprehensive error handling, recovery, and reporting system
 */
const logger = require('./logger');
const { EventEmitter } = require('events');

/**
 * Custom error types for better error categorization
 */
class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
    this.isOperational = true;
  }
}

class DatabaseError extends Error {
  constructor(message, query = null, code = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.query = query;
    this.code = code;
    this.isOperational = true;
  }
}

class BusinessLogicError extends Error {
  constructor(message, context = null, code = 'BUSINESS_LOGIC_ERROR') {
    super(message);
    this.name = 'BusinessLogicError';
    this.context = context;
    this.code = code;
    this.isOperational = true;
  }
}

class ExternalServiceError extends Error {
  constructor(message, service = null, code = 'EXTERNAL_SERVICE_ERROR') {
    super(message);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.code = code;
    this.isOperational = true;
  }
}

class SystemError extends Error {
  constructor(message, code = 'SYSTEM_ERROR') {
    super(message);
    this.name = 'SystemError';
    this.code = code;
    this.isOperational = false; // System errors are usually not recoverable
  }
}

/**
 * Error classification and recovery strategies
 */
class ErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      enableMetrics: options.enableMetrics !== false,
      enableRecovery: options.enableRecovery !== false,
      ...options
    };
    
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCode: {},
      recoveriesAttempted: 0,
      recoveriesSuccessful: 0,
      lastErrorTime: null
    };
    
    this.recoveryStrategies = new Map();
    this.setupDefaultRecoveryStrategies();
  }
  
  /**
   * Handle error with automatic recovery and logging
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Recovery result
   */
  async handleError(error, context = {}) {
    const errorInfo = this.analyzeError(error, context);
    
    // Update metrics
    if (this.options.enableMetrics) {
      this.updateMetrics(errorInfo);
    }
    
    // Log error with context
    this.logError(errorInfo);
    
    // Emit error event for external handlers
    this.emit('error', errorInfo);
    
    // Attempt recovery if enabled and error is recoverable
    let recoveryResult = null;
    if (this.options.enableRecovery && errorInfo.isRecoverable) {
      recoveryResult = await this.attemptRecovery(errorInfo);
    }
    
    return {
      error: errorInfo,
      recovery: recoveryResult,
      handled: true
    };
  }
  
  /**
   * Execute operation with automatic retry and error handling
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = this.options.maxRetries,
      retryDelay = this.options.retryDelay,
      context = {},
      retryCondition = this.shouldRetry.bind(this)
    } = options;
    
    let lastError = null;
    let attempt = 0;
    
    while (attempt <= maxRetries) {
      try {
        const result = await operation(attempt, lastError);
        
        // Success - log if this was a retry
        if (attempt > 0) {
          logger.info(`Operation succeeded after ${attempt} retries`, { context });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        attempt++;
        
        // Check if we should retry
        if (attempt <= maxRetries && retryCondition(error, attempt)) {
          logger.warn(`Operation failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${retryDelay}ms`, {
            error: error.message,
            context
          });
          
          await this.delay(retryDelay * Math.pow(1.5, attempt - 1)); // Exponential backoff
          continue;
        }
        
        // Max retries reached or non-retryable error
        const errorInfo = this.analyzeError(error, { ...context, attempts: attempt });
        await this.handleError(error, errorInfo);
        throw error;
      }
    }
  }
  
  /**
   * Analyze error and provide detailed information
   * @private
   */
  analyzeError(error, context = {}) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context,
      isOperational: error.isOperational || false,
      isRecoverable: this.isRecoverableError(error),
      severity: this.getErrorSeverity(error),
      category: this.categorizeError(error),
      suggestedAction: this.getSuggestedAction(error)
    };
    
    // Add specific error details
    if (error instanceof ValidationError) {
      errorInfo.field = error.field;
    } else if (error instanceof DatabaseError) {
      errorInfo.query = error.query;
    } else if (error instanceof ExternalServiceError) {
      errorInfo.service = error.service;
    }
    
    return errorInfo;
  }
  
  /**
   * Determine if error is recoverable
   * @private
   */
  isRecoverableError(error) {
    // Non-recoverable errors
    if (error instanceof SystemError) return false;
    if (error instanceof ValidationError) return false;
    if (error.code === 'ENOENT') return false;
    if (error.code === 'EACCES') return false;
    
    // Recoverable errors
    if (error.code === 'SQLITE_BUSY') return true;
    if (error.code === 'SQLITE_LOCKED') return true;
    if (error.code === 'ECONNRESET') return true;
    if (error.code === 'ECONNREFUSED') return true;
    if (error.code === 'ETIMEDOUT') return true;
    if (error instanceof ExternalServiceError) return true;
    
    // Default to recoverable for operational errors
    return error.isOperational || false;
  }
  
  /**
   * Get error severity level
   * @private
   */
  getErrorSeverity(error) {
    if (error instanceof SystemError) return 'critical';
    if (error instanceof DatabaseError) return 'high';
    if (error instanceof ExternalServiceError) return 'medium';
    if (error instanceof BusinessLogicError) return 'medium';
    if (error instanceof ValidationError) return 'low';
    
    // Based on error codes
    if (error.code === 'ENOENT' || error.code === 'EACCES') return 'critical';
    if (error.code?.startsWith('SQLITE_')) return 'high';
    
    return 'medium';
  }
  
  /**
   * Categorize error type
   * @private
   */
  categorizeError(error) {
    if (error instanceof ValidationError) return 'validation';
    if (error instanceof DatabaseError) return 'database';
    if (error instanceof BusinessLogicError) return 'business_logic';
    if (error instanceof ExternalServiceError) return 'external_service';
    if (error instanceof SystemError) return 'system';
    
    // Based on error patterns
    if (error.code?.startsWith('SQLITE_')) return 'database';
    if (error.code?.startsWith('ECON')) return 'network';
    if (error.code === 'ENOENT' || error.code === 'EACCES') return 'filesystem';
    
    return 'unknown';
  }
  
  /**
   * Get suggested action for error
   * @private
   */
  getSuggestedAction(error) {
    if (error instanceof ValidationError) {
      return 'Validate and correct input data';
    }
    
    if (error instanceof DatabaseError) {
      if (error.code === 'SQLITE_BUSY') {
        return 'Retry operation after delay';
      }
      if (error.code === 'SQLITE_LOCKED') {
        return 'Release database locks and retry';
      }
      return 'Check database connectivity and integrity';
    }
    
    if (error instanceof ExternalServiceError) {
      return 'Check external service status and retry';
    }
    
    if (error.code === 'ECONNREFUSED') {
      return 'Check service availability and network connectivity';
    }
    
    if (error.code === 'ETIMEDOUT') {
      return 'Increase timeout or check network latency';
    }
    
    return 'Review error details and context';
  }
  
  /**
   * Determine if operation should be retried
   * @private
   */
  shouldRetry(error, attempt) {
    // Don't retry validation errors
    if (error instanceof ValidationError) return false;
    
    // Don't retry system errors
    if (error instanceof SystemError) return false;
    
    // Retry database lock errors
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') return true;
    
    // Retry network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    
    // Retry external service errors
    if (error instanceof ExternalServiceError) return true;
    
    return false;
  }
  
  /**
   * Attempt error recovery
   * @private
   */
  async attemptRecovery(errorInfo) {
    this.metrics.recoveriesAttempted++;
    
    const strategy = this.recoveryStrategies.get(errorInfo.category) || 
                     this.recoveryStrategies.get(errorInfo.code) ||
                     this.recoveryStrategies.get('default');
    
    if (!strategy) {
      logger.debug('No recovery strategy found for error', errorInfo);
      return { attempted: false, success: false };
    }
    
    try {
      logger.info(`Attempting recovery for ${errorInfo.category} error`, {
        code: errorInfo.code,
        strategy: strategy.name
      });
      
      const result = await strategy.recover(errorInfo);
      
      if (result.success) {
        this.metrics.recoveriesSuccessful++;
        logger.info('Error recovery successful', { strategy: strategy.name });
      } else {
        logger.warn('Error recovery failed', { 
          strategy: strategy.name, 
          reason: result.reason 
        });
      }
      
      return { attempted: true, success: result.success, result };
    } catch (recoveryError) {
      logger.error('Recovery strategy failed', {
        strategy: strategy.name,
        error: recoveryError.message
      });
      
      return { attempted: true, success: false, error: recoveryError.message };
    }
  }
  
  /**
   * Setup default recovery strategies
   * @private
   */
  setupDefaultRecoveryStrategies() {
    // Database lock recovery
    this.addRecoveryStrategy('SQLITE_BUSY', {
      name: 'database_busy_recovery',
      recover: async (errorInfo) => {
        await this.delay(100 + Math.random() * 200); // Random delay
        return { success: true, action: 'waited_for_lock_release' };
      }
    });
    
    // Database connection recovery
    this.addRecoveryStrategy('database', {
      name: 'database_connection_recovery',
      recover: async (errorInfo) => {
        // Could attempt to reconnect database here
        return { success: false, reason: 'manual_intervention_required' };
      }
    });
    
    // Network error recovery
    this.addRecoveryStrategy('network', {
      name: 'network_error_recovery',
      recover: async (errorInfo) => {
        await this.delay(1000); // Wait for network recovery
        return { success: true, action: 'waited_for_network' };
      }
    });
    
    // Default recovery
    this.addRecoveryStrategy('default', {
      name: 'default_recovery',
      recover: async (errorInfo) => {
        return { success: false, reason: 'no_specific_strategy' };
      }
    });
  }
  
  /**
   * Add custom recovery strategy
   */
  addRecoveryStrategy(key, strategy) {
    this.recoveryStrategies.set(key, strategy);
  }
  
  /**
   * Update error metrics
   * @private
   */
  updateMetrics(errorInfo) {
    this.metrics.totalErrors++;
    this.metrics.lastErrorTime = errorInfo.timestamp;
    
    if (!this.metrics.errorsByType[errorInfo.name]) {
      this.metrics.errorsByType[errorInfo.name] = 0;
    }
    this.metrics.errorsByType[errorInfo.name]++;
    
    if (!this.metrics.errorsByCode[errorInfo.code]) {
      this.metrics.errorsByCode[errorInfo.code] = 0;
    }
    this.metrics.errorsByCode[errorInfo.code]++;
  }
  
  /**
   * Log error with appropriate level
   * @private
   */
  logError(errorInfo) {
    const logData = {
      code: errorInfo.code,
      category: errorInfo.category,
      severity: errorInfo.severity,
      context: errorInfo.context
    };
    
    switch (errorInfo.severity) {
      case 'critical':
        logger.error(errorInfo.message, logData);
        break;
      case 'high':
        logger.error(errorInfo.message, logData);
        break;
      case 'medium':
        logger.warn(errorInfo.message, logData);
        break;
      case 'low':
        logger.info(errorInfo.message, logData);
        break;
      default:
        logger.warn(errorInfo.message, logData);
    }
  }
  
  /**
   * Utility delay function
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get error metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * Reset error metrics
   */
  resetMetrics() {
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByCode: {},
      recoveriesAttempted: 0,
      recoveriesSuccessful: 0,
      lastErrorTime: null
    };
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

module.exports = {
  ErrorHandler,
  ValidationError,
  DatabaseError,
  BusinessLogicError,
  ExternalServiceError,
  SystemError,
  errorHandler
};