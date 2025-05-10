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
  logger.debug('SQLite database module not available, using JSON storage for users');
  database = null;
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
      // Use SQLite if available and initialized
      if (database && database.isInitialized()) {
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
        logger.info('User database initialized successfully (SQLite)');
        return;
      }

      // Fallback to JSON storage
      logger.debug('Using JSON storage for user management');

      // Create data directory if it doesn't exist
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`Created data directory: ${DATA_DIR}`);
      }

      // Create users file if it doesn't exist
      if (!fs.existsSync(USERS_FILE)) {
        // Create default admin user for first-time setup
        const defaultAdmin = {
          id: '1',
          username: 'admin',
          // Default password: admin123
          passwordHash: '$2a$10$mR3TyEQwA.bCpkTz8YGsIuRgIWPXxZH7KtNE9TCMxDxU52aw9hq.O',
          role: 'admin',
          createdAt: new Date().toISOString(),
          lastLogin: null
        };

        fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
        logger.info('Created users database with default admin user');
      }

      // Create revoked tokens file if it doesn't exist
      if (!fs.existsSync(TOKENS_FILE)) {
        fs.writeFileSync(TOKENS_FILE, JSON.stringify([], null, 2));
        logger.info('Created revoked tokens database');
      }

      // Load users from file
      this.loadUsers();

      // Load revoked tokens from file
      this.loadRevokedTokens();

      this.initialized = true;
      logger.info('User database initialized successfully (JSON)');
    } catch (error) {
      logger.error(`Failed to initialize user database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load users from file
   */
  loadUsers() {
    try {
      const fileData = fs.readFileSync(USERS_FILE, 'utf8');
      this.users = JSON.parse(fileData);
      logger.debug(`Loaded ${this.users.length} users from database`);
    } catch (error) {
      logger.error(`Failed to load users: ${error.message}`);
      this.users = [];
    }
  }

  /**
   * Load revoked tokens from file
   */
  loadRevokedTokens() {
    try {
      const fileData = fs.readFileSync(TOKENS_FILE, 'utf8');
      this.revokedTokens = JSON.parse(fileData);
      
      // Clean up expired revoked tokens
      const now = Date.now();
      this.revokedTokens = this.revokedTokens.filter(token => {
        return token.expiresAt > now;
      });
      
      // Save cleaned up tokens
      this.saveRevokedTokens();
      
      logger.debug(`Loaded ${this.revokedTokens.length} active revoked tokens`);
    } catch (error) {
      logger.error(`Failed to load revoked tokens: ${error.message}`);
      this.revokedTokens = [];
    }
  }

  /**
   * Save users to file
   */
  saveUsers() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2));
      logger.debug(`Saved ${this.users.length} users to database`);
    } catch (error) {
      logger.error(`Failed to save users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save revoked tokens to file
   */
  saveRevokedTokens() {
    try {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(this.revokedTokens, null, 2));
      logger.debug(`Saved ${this.revokedTokens.length} revoked tokens to database`);
    } catch (error) {
      logger.error(`Failed to save revoked tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findById(id) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.findById(id);
    }

    // Fallback to JSON
    return this.users.find(user => user.id === id) || null;
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findByUsername(username) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.findByUsername(username);
    }

    // Fallback to JSON
    return this.users.find(user => user.username.toLowerCase() === username.toLowerCase()) || null;
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user object
   */
  async create(userData) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.createUser(userData);
    }

    // Fallback to JSON storage

    // Check if username already exists
    const existingUser = await this.findByUsername(userData.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Generate ID
    const id = (Math.max(...this.users.map(u => parseInt(u.id)), 0) + 1).toString();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(userData.password, salt);

    // Create user object
    const newUser = {
      id,
      username: userData.username,
      passwordHash,
      role: userData.role || 'operator', // Default role
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    // Add to users array
    this.users.push(newUser);

    // Save to file
    this.saveUsers();

    // Return user without password
    const { passwordHash: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Promise<Object>} - Updated user object
   */
  async update(id, userData) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.updateUser(id, userData);
    }

    // Fallback to JSON storage
    const index = this.users.findIndex(u => u.id === id);

    if (index === -1) {
      throw new Error('User not found');
    }

    // Get current user
    const currentUser = this.users[index];

    // Check if updating username and if it already exists
    if (userData.username &&
        userData.username !== currentUser.username) {
      const existingUser = await this.findByUsername(userData.username);
      if (existingUser) {
        throw new Error('Username already exists');
      }
    }

    // Hash password if provided
    let passwordHash = currentUser.passwordHash;
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(userData.password, salt);
    }

    // Update user
    const updatedUser = {
      ...currentUser,
      ...userData,
      passwordHash,
      updatedAt: new Date().toISOString()
    };

    // Save to array
    this.users[index] = updatedUser;

    // Save to file
    this.saveUsers();

    // Return user without password
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.delete(id);
    }

    // Fallback to JSON storage
    const initialLength = this.users.length;
    this.users = this.users.filter(u => u.id !== id);

    if (this.users.length === initialLength) {
      throw new Error('User not found');
    }

    // Save to file
    this.saveUsers();
    return true;
  }

  /**
   * Add token to revoked list
   * @param {string} token - Token to revoke
   * @param {number} expiresAt - Timestamp when token expires
   * @returns {Promise<boolean>} - Success status
   */
  async revokeToken(token, expiresAt) {
    // Use SQLite if available
    if (this.tokenRepository) {
      await this.tokenRepository.revokeToken(token, expiresAt);
      return true;
    }

    // Fallback to JSON storage
    // Store just a hash of the token to save space
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    this.revokedTokens.push({
      token: tokenHash,
      revokedAt: Date.now(),
      expiresAt
    });

    this.saveRevokedTokens();
    return true;
  }

  /**
   * Check if token is revoked
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} - Whether token is revoked
   */
  async isTokenRevoked(token) {
    // Use SQLite if available
    if (this.tokenRepository) {
      return this.tokenRepository.isTokenRevoked(token);
    }

    // Fallback to JSON storage
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.revokedTokens.some(t => t.token === tokenHash);
  }

  /**
   * Verify user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User object without password or null if invalid
   */
  async verifyCredentials(username, password) {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.verifyCredentials(username, password);
    }

    // Fallback to JSON storage
    // Find user by username
    const user = await this.findByUsername(username);

    if (!user) {
      return null;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return null;
    }

    // Return user without password
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of users (without passwords)
   */
  async getAllUsers() {
    // Use SQLite if available
    if (this.userRepository) {
      return this.userRepository.getAllUsers();
    }

    // Fallback to JSON storage
    return this.users.map(user => {
      const { passwordHash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }
}

// Export singleton instance
module.exports = new UserModel();