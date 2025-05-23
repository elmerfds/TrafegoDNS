/**
 * User Model
 * Defines the schema and methods for users
 * Compatible with both SQLite and JSON storage with dynamic fallback
 */
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const logger = require('../../../utils/logger');

// Database path
const DATA_DIR = path.join(process.env.CONFIG_DIR || '/config', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'revoked-tokens.json');

// Database retry configuration
const MAX_RETRIES = 5;
const RETRY_INTERVAL = 1000; // ms

/**
 * User model with dynamic SQLite/JSON storage
 */
class UserModel {
  constructor() {
    this.users = [];
    this.revokedTokens = [];
    this.initialized = false;
    this.database = null;
    this.userRepository = null;
    this.tokenRepository = null;
    this.retryCount = 0;
    this.usingJsonFallback = false;
    
    // Delay initialization to allow database to be ready
    // Use a longer delay to avoid race conditions with SQLite initialization
    setTimeout(() => this.init(), 2000);
  }
  
  /**
   * Load database module safely
   * @returns {Object|null} - Database module or null if unavailable
   */
  loadDatabase() {
    // Return cached instance if available
    if (this.database) return this.database;
    
    try {
      // Load the database module
      const database = require('../../../database');
      logger.debug('Successfully loaded database module from User model');
      
      // Validate database object structure
      if (!database || typeof database !== 'object') {
        logger.warn('Database module loaded but has invalid structure');
        return null;
      }
      
      // Store the database reference
      this.database = database;
      return database;
    } catch (error) {
      logger.error(`Failed to load database module: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check if database is ready for use
   * @returns {boolean} - Whether database is ready
   */
  isDatabaseReady() {
    // Load database if not already loaded
    const database = this.loadDatabase();
    if (!database) return false;
    
    // Check if database is initialized
    if (!database.isInitialized || !database.isInitialized()) {
      logger.debug('Database module found but not initialized');
      return false;
    }
    
    // Check for required repositories
    if (!database.repositories || 
        !database.repositories.user || 
        !database.repositories.revokedToken) {
      logger.debug('Database repositories not properly initialized');
      return false;
    }
    
    return true;
  }
  
  /**
   * Initialize JSON storage
   * @returns {boolean} - Success status
   */
  initJsonStorage() {
    try {
      // Create data directory if it doesn't exist
      if (!fs.existsSync(DATA_DIR)) {
        logger.debug(`Creating data directory: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      // Check if data has been migrated to SQLite by looking for .migrated files
      const usersMigrated = fs.existsSync(`${USERS_FILE}.migrated`);
      const tokensMigrated = fs.existsSync(`${TOKENS_FILE}.migrated`);
      
      // Check if users file exists
      if (!fs.existsSync(USERS_FILE)) {
        // If migrated, don't create new JSON file
        if (usersMigrated) {
          logger.debug('Users already migrated to SQLite, skipping JSON file creation');
          this.users = [];
        } else {
          logger.debug('Users file does not exist, creating with default admin user');
          
          // Create default admin user
          const defaultAdmin = {
            id: '1',
            username: 'admin',
            passwordHash: bcrypt.hashSync('admin123', 10),
            role: 'admin',
            createdAt: new Date().toISOString(),
            lastLogin: null
          };
          
          // Save to file
          fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
          logger.info('Created default admin user in JSON storage');
        }
      }
      
      // Load users from file only if it exists
      if (fs.existsSync(USERS_FILE)) {
        this.loadUsers();
      }
      
      // Check if tokens file exists
      if (!fs.existsSync(TOKENS_FILE)) {
        // If migrated, don't create new JSON file
        if (tokensMigrated) {
          logger.debug('Tokens already migrated to SQLite, skipping JSON file creation');
          this.revokedTokens = [];
        } else {
          logger.debug('Revoked tokens file does not exist, creating empty file');
          fs.writeFileSync(TOKENS_FILE, JSON.stringify([], null, 2));
        }
      }
      
      // Load revoked tokens from file only if it exists
      if (fs.existsSync(TOKENS_FILE)) {
        this.loadRevokedTokens();
      }
      
      // Mark as using JSON fallback
      this.usingJsonFallback = true;
      return true;
    } catch (error) {
      logger.error(`Failed to initialize JSON storage: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Initialize the users database
   * Creates the data directory and files if they don't exist
   */
  init() {
    try {
      logger.info('Initializing user database...');
      
      // Check if database is ready
      if (this.isDatabaseReady()) {
        // Get database module
        const database = this.loadDatabase();
        
        // Set repositories
        this.userRepository = database.repositories.user;
        this.tokenRepository = database.repositories.revokedToken;
        
        // Check if admin user exists, create if not
        this.userRepository.findByUsername('admin')
          .then(admin => {
            if (!admin) {
              // Create default admin user
              logger.info('Admin user not found, creating default admin user');
              this.userRepository.createUser({
                username: 'admin',
                password: 'admin123',
                role: 'admin'
              }).then(() => {
                logger.info('Created default admin user in SQLite database');
              }).catch(err => {
                logger.error(`Failed to create default admin user: ${err.message}`);
              });
            } else {
              logger.debug('Admin user already exists in database');
            }
          })
          .catch(err => {
            logger.error(`Failed to check for admin user: ${err.message}`);
          });
        
        // Mark as initialized and not using JSON fallback
        this.initialized = true;
        this.usingJsonFallback = false;
        logger.info('User database initialized successfully with SQLite');
        return true;
      } else {
        // Database not ready, check if we should retry
        if (this.retryCount < MAX_RETRIES) {
          this.retryCount++;
          logger.debug(`SQLite database not ready yet, will retry in ${RETRY_INTERVAL/1000} second(s) (attempt ${this.retryCount}/${MAX_RETRIES})`);
          
          // Schedule retry
          setTimeout(() => this.init(), RETRY_INTERVAL);
          
          // Don't create JSON files while waiting for SQLite
          // The database will create the default admin user when it initializes
          return false;
        } else {
          // Max retries reached
          logger.error(`SQLite database not available after ${MAX_RETRIES} attempts`);
          
          // Check if SQLite is actually not installed vs just slow to initialize
          const database = this.loadDatabase();
          if (!database) {
            // SQLite module not available at all - fall back to JSON
            logger.warn('SQLite module not available, falling back to JSON storage');
            logger.warn('This is not recommended for production use');
            
            this.initJsonStorage();
            this.initialized = true;
            return true;
          } else {
            // SQLite exists but isn't initialized - this is likely a startup race condition
            // Don't create JSON files, just fail initialization
            logger.error('SQLite module exists but failed to initialize - please check database configuration');
            this.initialized = false;
            return false;
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to initialize user database: ${error.message}`);
      
      // Only fall back to JSON if SQLite module is not available
      const database = this.loadDatabase();
      if (!database) {
        logger.warn('Falling back to JSON storage due to missing SQLite module');
        this.initJsonStorage();
        this.initialized = true;
        return false;
      } else {
        // SQLite exists but there was an error - don't create JSON files
        logger.error('SQLite initialization error - will retry');
        this.initialized = false;
        
        // Schedule a retry if we haven't exceeded max attempts
        if (this.retryCount < MAX_RETRIES) {
          setTimeout(() => this.init(), RETRY_INTERVAL);
        }
        return false;
      }
    }
  }
  
  /**
   * Reinitialize the database connection
   * Useful if database becomes available after startup
   */
  reinitialize() {
    this.retryCount = 0;
    this.initialized = false;
    return this.init();
  }
  
  /**
   * Get current status of the user database
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      initialized: this.initialized,
      usingJsonFallback: this.usingJsonFallback,
      databaseAvailable: this.isDatabaseReady(),
      retryCount: this.retryCount,
      userCount: this.usingJsonFallback ? this.users.length : 'unknown'
    };
  }
  
  /**
   * Wrapper to ensure database is ready or fallback to JSON
   * @param {Function} sqliteFunc - Function to run if SQLite is ready
   * @param {Function} jsonFunc - Function to run if SQLite is not ready
   * @returns {Promise<any>} - Result of the chosen function
   */
  async withDatabaseReady(sqliteFunc, jsonFunc) {
    // Check if database is ready now (might have become ready since initialization)
    if (this.isDatabaseReady()) {
      // If we were using JSON but now SQLite is ready, reinitialize
      if (this.usingJsonFallback) {
        logger.info('SQLite database is now available, switching from JSON fallback');
        await this.reinitialize();
      }
      
      // Use SQLite implementation
      return sqliteFunc();
    } else {
      // Use JSON fallback implementation
      if (!this.usingJsonFallback) {
        logger.warn('SQLite database not available, falling back to JSON storage');
        this.usingJsonFallback = true;
      }
      
      return jsonFunc();
    }
  }

  /**
   * Load users from file
   */
  loadUsers() {
    try {
      if (!fs.existsSync(USERS_FILE)) {
        this.users = [];
        return;
      }
      
      const fileData = fs.readFileSync(USERS_FILE, 'utf8');
      this.users = JSON.parse(fileData);
      logger.debug(`Loaded ${this.users.length} users from JSON storage`);
    } catch (error) {
      logger.error(`Failed to load users from JSON: ${error.message}`);
      this.users = [];
    }
  }

  /**
   * Load revoked tokens from file
   */
  loadRevokedTokens() {
    try {
      if (!fs.existsSync(TOKENS_FILE)) {
        this.revokedTokens = [];
        return;
      }
      
      const fileData = fs.readFileSync(TOKENS_FILE, 'utf8');
      this.revokedTokens = JSON.parse(fileData);
      
      // Clean up expired revoked tokens
      const now = Date.now();
      this.revokedTokens = this.revokedTokens.filter(token => {
        return token.expiresAt > now;
      });
      
      // Save cleaned up tokens
      this.saveRevokedTokens();
      
      logger.debug(`Loaded ${this.revokedTokens.length} active revoked tokens from JSON storage`);
    } catch (error) {
      logger.error(`Failed to load revoked tokens from JSON: ${error.message}`);
      this.revokedTokens = [];
    }
  }

  /**
   * Save users to file
   */
  saveUsers() {
    try {
      // Check if already migrated to SQLite
      if (fs.existsSync(`${USERS_FILE}.migrated`)) {
        logger.debug('Users already migrated to SQLite, skipping JSON save');
        return true;
      }
      
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2));
      logger.debug(`Saved ${this.users.length} users to JSON storage`);
      return true;
    } catch (error) {
      logger.error(`Failed to save users to JSON: ${error.message}`);
      return false;
    }
  }

  /**
   * Save revoked tokens to file
   */
  saveRevokedTokens() {
    try {
      // Check if already migrated to SQLite
      if (fs.existsSync(`${TOKENS_FILE}.migrated`)) {
        logger.debug('Tokens already migrated to SQLite, skipping JSON save');
        return true;
      }
      
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(this.revokedTokens, null, 2));
      logger.debug(`Saved ${this.revokedTokens.length} revoked tokens to JSON storage`);
      return true;
    } catch (error) {
      logger.error(`Failed to save revoked tokens to JSON: ${error.message}`);
      return false;
    }
  }

  /**
   * Find user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findById(id) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.findById(id),
      
      // JSON fallback implementation
      async () => this.users.find(user => user.id === id) || null
    );
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User object or null if not found
   */
  async findByUsername(username) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.findByUsername(username),
      
      // JSON fallback implementation
      async () => this.users.find(user => 
        user.username.toLowerCase() === username.toLowerCase()) || null
    );
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user object
   */
  async create(userData) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.createUser(userData),
      
      // JSON fallback implementation
      async () => {
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
    );
  }

  /**
   * Update a user
   * @param {string} id - User ID
   * @param {Object} userData - User data to update
   * @returns {Promise<Object>} - Updated user object
   */
  async update(id, userData) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.updateUser(id, userData),
      
      // JSON fallback implementation
      async () => {
        // Find user index
        const index = this.users.findIndex(u => u.id === id);
        if (index === -1) {
          throw new Error('User not found');
        }

        // Get current user
        const currentUser = this.users[index];

        // Check if updating username and if it already exists
        if (userData.username && userData.username !== currentUser.username) {
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
    );
  }

  /**
   * Delete a user
   * @param {string} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(id) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.delete(id),
      
      // JSON fallback implementation
      async () => {
        const initialLength = this.users.length;
        this.users = this.users.filter(u => u.id !== id);

        if (this.users.length === initialLength) {
          throw new Error('User not found');
        }

        // Save to file
        this.saveUsers();
        return true;
      }
    );
  }

  /**
   * Add token to revoked list
   * @param {string} token - Token to revoke
   * @param {number} expiresAt - Timestamp when token expires
   * @returns {Promise<boolean>} - Success status
   */
  async revokeToken(token, expiresAt) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => {
        await this.tokenRepository.revokeToken(token, expiresAt);
        return true;
      },
      
      // JSON fallback implementation
      async () => {
        this.revokedTokens.push({
          token,
          expiresAt,
          revokedAt: Date.now()
        });
        
        // Save to file
        this.saveRevokedTokens();
        return true;
      }
    );
  }

  /**
   * Check if token is revoked
   * @param {string} token - Token to check
   * @returns {Promise<boolean>} - Whether token is revoked
   */
  async isTokenRevoked(token) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.tokenRepository.isTokenRevoked(token),
      
      // JSON fallback implementation
      async () => {
        // Clean up expired tokens first
        const now = Date.now();
        this.revokedTokens = this.revokedTokens.filter(t => t.expiresAt > now);
        
        // Check if token is in the list
        return this.revokedTokens.some(t => t.token === token);
      }
    );
  }

  /**
   * Verify user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object|null>} - User object without password or null if invalid
   */
  async verifyCredentials(username, password) {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.verifyCredentials(username, password),
      
      // JSON fallback implementation
      async () => {
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
    );
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of users (without passwords)
   */
  async getAllUsers() {
    return this.withDatabaseReady(
      // SQLite implementation
      async () => this.userRepository.getAllUsers(),
      
      // JSON fallback implementation
      async () => {
        return this.users.map(user => {
          const { passwordHash, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
      }
    );
  }
}

// Export singleton instance
module.exports = new UserModel();