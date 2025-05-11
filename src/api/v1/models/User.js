/**
 * User Model
 * Defines the schema and methods for users
 * Compatible with both SQLite and JSON storage
 */
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const logger = require('../../../utils/logger');

// Database path
const DATA_DIR = path.join(process.env.CONFIG_DIR || '/config', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'revoked-tokens.json');

// Try to load database module
let database;
try {
  database = require('../../../database');
} catch (error) {
  logger.error('SQLite database module not available, cannot continue');
  throw new Error('SQLite database required but not available');
}

// User model
class UserModel {
  constructor() {
    this.users = [];
    this.revokedTokens = [];
    this.initialized = false;
    this.init();
  }

  /**
   * Initialize the users database
   * Creates the data directory and files if they don't exist
   */
  init() {
    try {
      // Require SQLite database
      if (!database || !database.isInitialized()) {
        logger.error('SQLite database is required for user management');
        logger.error('Please check database configuration and permissions');
        this.initialized = false;
        throw new Error('SQLite database required but not available');
      }
      
      logger.debug('Using SQLite database for user management');
      this.userRepository = database.repositories.user;
      this.tokenRepository = database.repositories.revokedToken;

      // Check if admin user exists, create if not
      this.userRepository.findByUsername('admin')
        .then(admin => {
          if (!admin) {
            // Create default admin user
            this.userRepository.createUser({
              username: 'admin',
              password: 'admin123',
              role: 'admin'
            }).then(() => {
              logger.info('Created default admin user in SQLite database');
            }).catch(err => {
              logger.error(`Failed to create default admin user: ${err.message}`);
            });
          }
        })
        .catch(err => {
          logger.error(`Failed to check for admin user: ${err.message}`);
        });

      this.initialized = true;
      logger.info('User database initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize user database: ${error.message}`);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Load users from file
   */
  loadUsers() {
    throw new Error('JSON storage no longer supported. Please use SQLite.');
  }

  /**
   * Load revoked tokens from file
   */
  loadRevokedTokens() {
    throw new Error('JSON storage no longer supported. Please use SQLite.');
  }

  /**
   * Save users to file
   */
  saveUsers() {
    throw new Error('JSON storage no longer supported. Please use SQLite.');
  }

  /**
   * Save revoked tokens to file
   */
  saveRevokedTokens() {
    throw new Error('JSON storage no longer supported. Please use SQLite.');
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findById(id) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.findById(id);
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findByUsername(username) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.findByUsername(username);
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user object
   */
  async create(userData) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.createUser(userData);
  }

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Promise<Object>} - Updated user object
   */
  async update(id, userData) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.updateUser(id, userData);
  }

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.delete(id);
  }

  /**
   * Add token to revoked list
   * @param {string} token - Token to revoke
   * @param {number} expiresAt - Timestamp when token expires
   * @returns {Promise<boolean>} - Success status
   */
  async revokeToken(token, expiresAt) {
    if (!this.tokenRepository) {
      throw new Error('SQLite database required but not available');
    }
    await this.tokenRepository.revokeToken(token, expiresAt);
    return true;
  }

  /**
   * Check if token is revoked
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} - Whether token is revoked
   */
  async isTokenRevoked(token) {
    if (!this.tokenRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.tokenRepository.isTokenRevoked(token);
  }

  /**
   * Verify user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User object without password or null if invalid
   */
  async verifyCredentials(username, password) {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.verifyCredentials(username, password);
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of users (without passwords)
   */
  async getAllUsers() {
    if (!this.userRepository) {
      throw new Error('SQLite database required but not available');
    }
    return this.userRepository.getAllUsers();
  }
}

// Export singleton instance
module.exports = new UserModel();