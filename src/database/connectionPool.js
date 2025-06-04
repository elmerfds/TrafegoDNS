/**
 * Database Connection Pool Manager
 * Implements connection pooling and proper resource management for SQLite
 */
const logger = require('../utils/logger');
const sqliteCore = require('./sqlite-core');
const EventEmitter = require('events');

class ConnectionPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxConnections: options.maxConnections || 5,
      acquireTimeout: options.acquireTimeout || 30000, // 30 seconds
      idleTimeout: options.idleTimeout || 60000, // 1 minute
      maintenanceInterval: options.maintenanceInterval || 300000, // 5 minutes
      ...options
    };
    
    this.connections = [];
    this.activeConnections = new Map();
    this.waitingQueue = [];
    this.stats = {
      created: 0,
      acquired: 0,
      released: 0,
      destroyed: 0,
      errors: 0,
      waitTime: []
    };
    
    this.isShuttingDown = false;
    this.maintenanceTimer = null;
    
    // Start maintenance
    this.startMaintenance();
  }
  
  /**
   * Initialize the connection pool
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      logger.info('Initializing database connection pool');
      
      // Create initial connection to verify database
      const success = await sqliteCore.initialize();
      if (!success) {
        throw new Error('Failed to initialize primary database connection');
      }
      
      // For SQLite, we'll use a single connection with proper locking
      // SQLite doesn't support true concurrent writes anyway
      this.connections.push({
        id: 1,
        db: sqliteCore,
        inUse: false,
        lastUsed: Date.now(),
        created: Date.now()
      });
      
      this.stats.created++;
      
      logger.info(`Connection pool initialized with ${this.connections.length} connections`);
      return true;
    } catch (error) {
      logger.error(`Failed to initialize connection pool: ${error.message}`);
      this.stats.errors++;
      return false;
    }
  }
  
  /**
   * Acquire a connection from the pool
   * @returns {Promise<Object>} Connection wrapper
   */
  async acquire() {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }
    
    const startTime = Date.now();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection acquire timeout')), this.options.acquireTimeout);
    });
    
    const acquirePromise = this._doAcquire();
    
    try {
      const connection = await Promise.race([acquirePromise, timeoutPromise]);
      const waitTime = Date.now() - startTime;
      this.stats.waitTime.push(waitTime);
      this.stats.acquired++;
      
      if (waitTime > 1000) {
        logger.warn(`Connection acquire took ${waitTime}ms`);
      }
      
      return connection;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }
  
  /**
   * Internal acquire logic
   * @private
   */
  async _doAcquire() {
    // Try to find an available connection
    for (const conn of this.connections) {
      if (!conn.inUse && !this.activeConnections.has(conn.id)) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        
        const connectionWrapper = this._createConnectionWrapper(conn);
        this.activeConnections.set(conn.id, connectionWrapper);
        
        return connectionWrapper;
      }
    }
    
    // If no connections available, wait in queue
    return new Promise((resolve, reject) => {
      this.waitingQueue.push({ resolve, reject, timestamp: Date.now() });
      
      // Check again in case a connection was just released
      setImmediate(() => this._processWaitingQueue());
    });
  }
  
  /**
   * Release a connection back to the pool
   * @param {Object} connectionWrapper - Connection wrapper to release
   */
  async release(connectionWrapper) {
    if (!connectionWrapper || !connectionWrapper._poolConnectionId) {
      logger.warn('Attempted to release invalid connection');
      return;
    }
    
    const conn = this.connections.find(c => c.id === connectionWrapper._poolConnectionId);
    if (!conn) {
      logger.warn(`Connection ${connectionWrapper._poolConnectionId} not found in pool`);
      return;
    }
    
    // Rollback any pending transaction
    if (connectionWrapper._transaction && connectionWrapper._transaction.active) {
      try {
        await connectionWrapper._transaction.rollback();
      } catch (error) {
        logger.error(`Error rolling back transaction on release: ${error.message}`);
      }
    }
    
    conn.inUse = false;
    conn.lastUsed = Date.now();
    this.activeConnections.delete(conn.id);
    this.stats.released++;
    
    // Process waiting queue
    this._processWaitingQueue();
  }
  
  /**
   * Process waiting queue
   * @private
   */
  _processWaitingQueue() {
    if (this.waitingQueue.length === 0) return;
    
    // Find available connection
    const availableConn = this.connections.find(conn => !conn.inUse);
    if (!availableConn) return;
    
    // Get next waiter
    const waiter = this.waitingQueue.shift();
    if (!waiter) return;
    
    // Acquire connection for waiter
    availableConn.inUse = true;
    availableConn.lastUsed = Date.now();
    
    const connectionWrapper = this._createConnectionWrapper(availableConn);
    this.activeConnections.set(availableConn.id, connectionWrapper);
    
    waiter.resolve(connectionWrapper);
  }
  
  /**
   * Create a connection wrapper with transaction support
   * @private
   */
  _createConnectionWrapper(conn) {
    const wrapper = {
      _poolConnectionId: conn.id,
      _db: conn.db,
      _transaction: null,
      
      // Transaction methods
      beginTransaction: async () => {
        if (wrapper._transaction && wrapper._transaction.active) {
          throw new Error('Transaction already in progress');
        }
        
        wrapper._transaction = new Transaction(wrapper._db);
        await wrapper._transaction.begin();
        return wrapper._transaction;
      },
      
      transaction: async (callback) => {
        const tx = await wrapper.beginTransaction();
        try {
          const result = await callback(tx);
          await tx.commit();
          return result;
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      },
      
      // Delegate database methods
      run: (...args) => wrapper._db.run(...args),
      get: (...args) => wrapper._db.get(...args),
      all: (...args) => wrapper._db.all(...args),
      exec: (...args) => wrapper._db.exec(...args),
      prepare: (...args) => wrapper._db.prepare(...args)
    };
    
    return wrapper;
  }
  
  /**
   * Start maintenance timer
   * @private
   */
  startMaintenance() {
    this.maintenanceTimer = setInterval(() => {
      this._performMaintenance();
    }, this.options.maintenanceInterval);
  }
  
  /**
   * Perform maintenance tasks
   * @private
   */
  _performMaintenance() {
    try {
      // Log pool statistics
      const activeCount = this.activeConnections.size;
      const waitingCount = this.waitingQueue.length;
      const avgWaitTime = this.stats.waitTime.length > 0 
        ? Math.round(this.stats.waitTime.reduce((a, b) => a + b, 0) / this.stats.waitTime.length)
        : 0;
      
      logger.debug(`Connection pool stats: ${activeCount} active, ${waitingCount} waiting, ${avgWaitTime}ms avg wait`);
      
      // Clear old wait time stats (keep last 100)
      if (this.stats.waitTime.length > 100) {
        this.stats.waitTime = this.stats.waitTime.slice(-100);
      }
      
      // Check for long-running connections
      const now = Date.now();
      for (const [id, wrapper] of this.activeConnections) {
        const conn = this.connections.find(c => c.id === id);
        if (conn && now - conn.lastUsed > 300000) { // 5 minutes
          logger.warn(`Connection ${id} has been active for over 5 minutes`);
        }
      }
      
      // Emit stats event
      this.emit('stats', {
        active: activeCount,
        waiting: waitingCount,
        avgWaitTime,
        total: this.connections.length,
        ...this.stats
      });
    } catch (error) {
      logger.error(`Error during connection pool maintenance: ${error.message}`);
    }
  }
  
  /**
   * Shutdown the connection pool
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('Shutting down connection pool');
    this.isShuttingDown = true;
    
    // Stop maintenance
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    
    // Wait for active connections to be released (with timeout)
    const shutdownTimeout = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.activeConnections.size > 0 && Date.now() - startTime < shutdownTimeout) {
      logger.info(`Waiting for ${this.activeConnections.size} active connections to complete`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeConnections.size > 0) {
      logger.warn(`Forcing shutdown with ${this.activeConnections.size} active connections`);
    }
    
    // Reject all waiting requests
    for (const waiter of this.waitingQueue) {
      waiter.reject(new Error('Connection pool is shutting down'));
    }
    this.waitingQueue = [];
    
    // Close all connections
    for (const conn of this.connections) {
      try {
        if (conn.db && conn.db.close) {
          conn.db.close();
        }
        this.stats.destroyed++;
      } catch (error) {
        logger.error(`Error closing connection ${conn.id}: ${error.message}`);
      }
    }
    
    this.connections = [];
    this.activeConnections.clear();
    
    logger.info('Connection pool shutdown complete');
  }
  
  /**
   * Get pool statistics
   * @returns {Object} Pool statistics
   */
  getStats() {
    return {
      total: this.connections.length,
      active: this.activeConnections.size,
      waiting: this.waitingQueue.length,
      ...this.stats,
      avgWaitTime: this.stats.waitTime.length > 0 
        ? Math.round(this.stats.waitTime.reduce((a, b) => a + b, 0) / this.stats.waitTime.length)
        : 0
    };
  }
}

/**
 * Transaction wrapper class
 */
class Transaction {
  constructor(db) {
    this.db = db;
    this.active = false;
    this.savepoints = [];
  }
  
  /**
   * Begin transaction
   */
  async begin() {
    if (this.active) {
      throw new Error('Transaction already active');
    }
    
    this.db.beginTransaction();
    this.active = true;
  }
  
  /**
   * Create a savepoint
   * @param {string} name - Savepoint name
   */
  async savepoint(name) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    this.db.exec(`SAVEPOINT ${safeName}`);
    this.savepoints.push(safeName);
  }
  
  /**
   * Release a savepoint
   * @param {string} name - Savepoint name
   */
  async releaseSavepoint(name) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const index = this.savepoints.indexOf(safeName);
    
    if (index === -1) {
      throw new Error(`Savepoint ${name} not found`);
    }
    
    this.db.exec(`RELEASE SAVEPOINT ${safeName}`);
    this.savepoints.splice(index, 1);
  }
  
  /**
   * Rollback to a savepoint
   * @param {string} name - Savepoint name
   */
  async rollbackToSavepoint(name) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const index = this.savepoints.indexOf(safeName);
    
    if (index === -1) {
      throw new Error(`Savepoint ${name} not found`);
    }
    
    this.db.exec(`ROLLBACK TO SAVEPOINT ${safeName}`);
    // Remove all savepoints after this one
    this.savepoints = this.savepoints.slice(0, index + 1);
  }
  
  /**
   * Commit transaction
   */
  async commit() {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    
    this.db.commit();
    this.active = false;
    this.savepoints = [];
  }
  
  /**
   * Rollback transaction
   */
  async rollback() {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    
    this.db.rollback();
    this.active = false;
    this.savepoints = [];
  }
  
  /**
   * Execute within transaction context
   */
  run(...args) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    return this.db.run(...args);
  }
  
  get(...args) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    return this.db.get(...args);
  }
  
  all(...args) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    return this.db.all(...args);
  }
  
  exec(...args) {
    if (!this.active) {
      throw new Error('No active transaction');
    }
    return this.db.exec(...args);
  }
}

// Create singleton instance
const pool = new ConnectionPool();

module.exports = {
  ConnectionPool,
  Transaction,
  pool
};