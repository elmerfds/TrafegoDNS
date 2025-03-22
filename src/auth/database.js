/**
 * src/auth/database.js
 * Database manager for authentication
 */
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class AuthDatabase {
  constructor(config) {
    this.config = config;
    this.dbPath = path.join('/config', 'data', 'auth.db');
    this.db = null;
  }
  
  /**
   * Initialize the database connection and create tables
   */
  async initialize() {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      logger.info(`Initializing auth database at ${this.dbPath}`);
      
      // Open database connection
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      
      // Create tables if they don't exist
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          email TEXT,
          name TEXT,
          role TEXT DEFAULT 'user',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          last_login TEXT
        );
        
        CREATE TABLE IF NOT EXISTS oidc_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          id_token TEXT,
          expires_at INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          data TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      
      logger.debug('Auth database initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize auth database: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get user by username
   * @param {string} username - Username to look up
   * @returns {Object|null} User object or null if not found
   */
  async getUserByUsername(username) {
    try {
      return await this.db.get('SELECT * FROM users WHERE username = ?', username);
    } catch (error) {
      logger.error(`Error fetching user by username: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get user by ID
   * @param {string} id - User ID to look up
   * @returns {Object|null} User object or null if not found
   */
  async getUserById(id) {
    try {
      return await this.db.get('SELECT * FROM users WHERE id = ?', id);
    } catch (error) {
      logger.error(`Error fetching user by ID: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get user by email
   * @param {string} email - Email to look up
   * @returns {Object|null} User object or null if not found
   */
  async getUserByEmail(email) {
    try {
      return await this.db.get('SELECT * FROM users WHERE email = ?', email);
    } catch (error) {
      logger.error(`Error fetching user by email: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get total user count
   * @returns {number} Number of users in database
   */
  async getUserCount() {
    try {
      const result = await this.db.get('SELECT COUNT(*) as count FROM users');
      return result ? result.count : 0;
    } catch (error) {
      logger.error(`Error counting users: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get all users
   * @returns {Array} Array of all users
   */
  async getAllUsers() {
    try {
      return await this.db.all('SELECT * FROM users ORDER BY created_at');
    } catch (error) {
      logger.error(`Error fetching all users: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a new user
   * @param {Object} userData - User data to insert
   * @returns {Object} Created user object
   */
  async createUser(userData) {
    try {
      const { id, username, password_hash, email, name, role } = userData;
      
      const result = await this.db.run(
        'INSERT INTO users (id, username, password_hash, email, name, role) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, password_hash, email, name, role || 'user']
      );
      
      return this.getUserById(id);
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a user's role
   * @param {string} userId - User ID to update
   * @param {string} newRole - New role to assign
   * @returns {Object} Updated user
   */
  async updateUserRole(userId, newRole) {
    try {
      await this.db.run(
        'UPDATE users SET role = ? WHERE id = ?',
        [newRole, userId]
      );
      
      return this.getUserById(userId);
    } catch (error) {
      logger.error(`Error updating user role: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a user's last login time
   * @param {string} userId - User ID to update
   * @returns {boolean} Success status
   */
  async updateLastLogin(userId) {
    try {
      await this.db.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        userId
      );
      return true;
    } catch (error) {
      logger.error(`Error updating last login: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Store OIDC token for a user
   * @param {string} userId - User ID
   * @param {string} provider - OIDC provider name
   * @param {Object} tokenData - Token data from OIDC provider
   * @returns {Object} Stored token data
   */
  async storeOidcToken(userId, provider, tokenData) {
    try {
      const { access_token, refresh_token, id_token, expires_in } = tokenData;
      
      // Calculate expiration timestamp
      const expiresAt = Math.floor(Date.now() / 1000) + expires_in;
      
      const result = await this.db.run(
        `INSERT INTO oidc_tokens 
        (user_id, provider, access_token, refresh_token, id_token, expires_at) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, provider, access_token, refresh_token, id_token, expiresAt]
      );
      
      return {
        id: result.lastID,
        user_id: userId,
        provider,
        expires_at: expiresAt
      };
    } catch (error) {
      logger.error(`Error storing OIDC token: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get the latest OIDC token for a user
   * @param {string} userId - User ID
   * @param {string} provider - OIDC provider name
   * @returns {Object|null} Token data or null if not found
   */
  async getOidcToken(userId, provider) {
    try {
      return await this.db.get(
        `SELECT * FROM oidc_tokens 
        WHERE user_id = ? AND provider = ? 
        ORDER BY created_at DESC LIMIT 1`,
        [userId, provider]
      );
    } catch (error) {
      logger.error(`Error fetching OIDC token: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a new session
   * @param {Object} sessionData - Session data to insert
   * @returns {string} Session ID
   */
  async createSession(sessionData) {
    try {
      const { id, user_id, expires_at, data } = sessionData;
      
      await this.db.run(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, data) 
        VALUES (?, ?, ?, ?, ?)`,
        [id, user_id, Math.floor(Date.now() / 1000), expires_at, JSON.stringify(data || {})]
      );
      
      return id;
    } catch (error) {
      logger.error(`Error creating session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get session by ID
   * @param {string} sessionId - Session ID to look up
   * @returns {Object|null} Session object or null if not found
   */
  async getSession(sessionId) {
    try {
      const session = await this.db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
      
      if (session) {
        try {
          session.data = JSON.parse(session.data);
        } catch (e) {
          session.data = {};
        }
      }
      
      return session;
    } catch (error) {
      logger.error(`Error fetching session: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete expired sessions
   * @returns {number} Number of deleted sessions
   */
  async cleanupSessions() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = await this.db.run('DELETE FROM sessions WHERE expires_at < ?', now);
      return result.changes;
    } catch (error) {
      logger.error(`Error cleaning up sessions: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Close the database connection
   */
  async close() {
    if (this.db) {
      try {
        await this.db.close();
        this.db = null;
        logger.debug('Auth database connection closed');
      } catch (error) {
        logger.error(`Error closing database connection: ${error.message}`);
      }
    }
  }
}

module.exports = AuthDatabase;