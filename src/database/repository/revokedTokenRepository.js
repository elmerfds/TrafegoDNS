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
      return existing;
    }
    
    // Revoke token
    return this.create({
      token_hash: tokenHash,
      revoked_at: now,
      expires_at: expiresAtIso
    });
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