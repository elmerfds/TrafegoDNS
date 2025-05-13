/**
 * Revoked Token Repository
 * Handles database operations for revoked JWT tokens
 */
const BaseRepository = require('./baseRepository');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class RevokedTokenRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'revoked_tokens';
    this.initialize();
  }

  /**
   * Initialize the repository, creating tables if needed
   */
  async initialize() {
    try {
      // Check if table exists
      const tableExists = await this.tableExists();

      if (!tableExists) {
        logger.info(`Creating ${this.tableName} table`);

        await this.db.run(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            revoked_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
          )
        `);

        // Create indexes for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_hash ON ${this.tableName}(token_hash)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_tokens_expires ON ${this.tableName}(expires_at)`);

        logger.info(`Created ${this.tableName} table and indexes`);
      }
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} table: ${error.message}`);
      // Don't throw the error, just log it - allow application to continue
    }
  }

  /**
   * Check if the table exists
   * @returns {Promise<boolean>} Whether the table exists
   */
  async tableExists() {
    try {
      const result = await this.db.get(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `, [this.tableName]);

      return !!result;
    } catch (error) {
      logger.error(`Failed to check if table exists: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a token is revoked
   * @param {string} token - JWT token
   * @returns {Promise<boolean>} - Whether the token is revoked
   */
  async isTokenRevoked(token) {
    const tokenHash = this._hashToken(token);
    
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE token_hash = ?
    `;
    
    const result = await this.db.get(sql, [tokenHash]);
    return !!result;
  }

  /**
   * Revoke a token
   * @param {string} token - JWT token
   * @param {number} expiresAt - Expiration timestamp
   * @returns {Promise<Object>} - Revoked token record
   */
  async revokeToken(token, expiresAt) {
    // Check if we're in a transaction already
    const isInTransaction = this.db.inTransaction;
    
    try {
      // Start a transaction only if not in one already
      if (!isInTransaction) {
        try {
          // Try to clear any potential pre-existing transaction
          try {
            logger.debug('Attempting to clear any pre-existing transactions');
            await this.db.rollback();
          } catch (rollbackError) {
            // Ignore "no transaction" errors
            if (!rollbackError.message.includes('no transaction is active')) {
              logger.debug(`Non-critical rollback error: ${rollbackError.message}`);
            }
          }
          
          logger.debug('Starting transaction for token revocation');
          await this.db.beginTransaction();
        } catch (txError) {
          logger.warn(`Could not start transaction for token revocation: ${txError.message}`);
          // Continue without transaction
        }
      }
      
      // Proceed with token revocation
      const tokenHash = this._hashToken(token);
      const now = new Date().toISOString();
      const expiresAtIso = new Date(expiresAt).toISOString();
      
      // Clean expired tokens first
      await this._cleanExpiredTokens();
      
      // Check if already revoked
      const existing = await this.db.get(
        `SELECT * FROM ${this.tableName} WHERE token_hash = ?`,
        [tokenHash]
      );
      
      if (existing) {
        // If we started a transaction, commit it
        if (!isInTransaction && this.db.inTransaction) {
          await this.db.commit();
        }
        return existing;
      }
      
      // Revoke token using direct SQL to avoid issues with nested operations
      const result = await this.db.run(`
        INSERT INTO ${this.tableName} (token_hash, revoked_at, expires_at)
        VALUES (?, ?, ?)
      `, [tokenHash, now, expiresAtIso]);
      
      // Commit if we started a transaction
      if (!isInTransaction && this.db.inTransaction) {
        await this.db.commit();
      }
      
      return {
        id: result.lastID,
        token_hash: tokenHash,
        revoked_at: now,
        expires_at: expiresAtIso
      };
    } catch (error) {
      // Rollback if we started a transaction
      if (!isInTransaction && this.db.inTransaction) {
        try {
          await this.db.rollback();
        } catch (rollbackError) {
          logger.error(`Failed to rollback: ${rollbackError.message}`);
        }
      }
      logger.error(`Failed to revoke token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean expired tokens
   * @returns {Promise<number>} - Number of deleted tokens
   */
  async _cleanExpiredTokens() {
    const now = new Date().toISOString();
    
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE expires_at < ?
    `;
    
    const result = await this.db.run(sql, [now]);
    
    if (result.changes > 0) {
      logger.debug(`Cleaned up ${result.changes} expired revoked tokens`);
    }
    
    return result.changes;
  }

  /**
   * Hash a token
   * @param {string} token - JWT token
   * @returns {string} - Token hash
   * @private
   */
  _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

module.exports = RevokedTokenRepository;