/**
 * User Repository
 * Handles database operations for users
 */
const BaseRepository = require('./baseRepository');
const bcrypt = require('bcryptjs');
const logger = require('../../utils/logger');

class UserRepository extends BaseRepository {
  constructor(db) {
    super(db);
    this.tableName = 'users';
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
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            created_at TEXT NOT NULL,
            updated_at TEXT,
            last_login TEXT
          )
        `);

        // Create indexes for performance
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON ${this.tableName}(username)`);
        await this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON ${this.tableName}(role)`);

        logger.info(`Created ${this.tableName} table and indexes`);
        
        // Create default admin user for fresh installs
        await this.ensureDefaultAdmin();
      } else {
        // Check if any users exist
        const userCount = await this.count();
        if (userCount === 0) {
          await this.ensureDefaultAdmin();
        }
      }
    } catch (error) {
      logger.error(`Failed to initialize ${this.tableName} table: ${error.message}`);
      // Don't throw the error, just log it - allow application to continue
    }
  }

  /**
   * Ensure default admin user exists
   */
  async ensureDefaultAdmin() {
    try {
      const adminExists = await this.findByUsername('admin');
      if (!adminExists) {
        logger.info('Creating default admin user in database');
        await this.create({
          username: 'admin',
          passwordHash: bcrypt.hashSync('admin123', 10),
          role: 'admin'
        });
      }
    } catch (error) {
      logger.error(`Failed to ensure default admin user: ${error.message}`);
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
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object>} - Found user or null
   */
  async findByUsername(username) {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE LOWER(username) = LOWER(?)
    `;
    return this.db.get(sql, [username]);
  }

  /**
   * Verify user credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} - User without password or null
   */
  async verifyCredentials(username, password) {
    const user = await this.findByUsername(username);
    
    if (!user) {
      return null;
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return null;
    }
    
    // Return user without password
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user without password
   */
  async createUser(userData) {
    // Check if username already exists
    const existingUser = await this.findByUsername(userData.username);
    
    if (existingUser) {
      throw new Error('Username already exists');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(userData.password, salt);
    
    // Create user object
    const user = {
      username: userData.username,
      password_hash: passwordHash,
      role: userData.role || 'operator',
      created_at: new Date().toISOString()
    };
    
    // Create user
    const result = await this.create(user);
    
    // Return without password
    const { password_hash, ...userWithoutPassword } = result;
    return userWithoutPassword;
  }

  /**
   * Update a user
   * @param {number} id - User ID
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Updated user without password
   */
  async updateUser(id, userData) {
    // Get current user
    const currentUser = await this.findById(id);
    
    if (!currentUser) {
      throw new Error('User not found');
    }
    
    // Check if updating username and if it already exists
    if (userData.username && 
        userData.username !== currentUser.username) {
      const existingUser = await this.findByUsername(userData.username);
      if (existingUser && existingUser.id !== parseInt(id)) {
        throw new Error('Username already exists');
      }
    }
    
    // Prepare update data
    const updateData = {
      ...userData,
      updated_at: new Date().toISOString()
    };
    
    // Hash password if provided
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(userData.password, salt);
      delete updateData.password;
    }
    
    // Update user
    await this.update(id, updateData);
    
    // Get updated user
    const updatedUser = await this.findById(id);
    
    // Return without password
    const { password_hash, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Update last login time
   * @param {number} id - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async updateLastLogin(id) {
    const sql = `
      UPDATE ${this.tableName}
      SET last_login = ?
      WHERE id = ?
    `;
    
    const now = new Date().toISOString();
    const result = await this.db.run(sql, [now, id]);
    return result.changes > 0;
  }

  /**
   * Get all users without passwords
   * @returns {Promise<Array>} - Users without passwords
   */
  async getAllUsers() {
    const users = await this.findAll();
    
    return users.map(user => {
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  /**
   * Migrate from JSON user data
   * @param {Array} jsonUsers - JSON user data
   * @returns {Promise<number>} - Number of migrated users
   */
  async migrateFromJson(jsonUsers) {
    if (!jsonUsers || !Array.isArray(jsonUsers) || jsonUsers.length === 0) {
      logger.warn('No JSON data to migrate for users');
      return 0;
    }
    
    let migratedCount = 0;
    
    // CRITICAL FIX: Check if we're already in a transaction first
    const isInTransaction = this.db.inTransaction;
    
    try {
      // Only start a transaction if we're not already in one
      if (!isInTransaction) {
        try {
          // First ensure no active transaction by attempting a rollback
          try {
            logger.debug('Attempting preliminary rollback to clear any active transactions');
            await this.db.rollback();
          } catch (rollbackError) {
            // Ignore "no transaction is active" errors
            if (!rollbackError.message.includes('no transaction is active')) {
              logger.warn(`Unexpected rollback error: ${rollbackError.message}`);
            }
          }
          
          // Now start a fresh transaction
          logger.debug('Starting new transaction for user migration');
          await this.db.beginTransaction();
        } catch (txError) {
          // If we can't start a transaction (like "already in transaction"), proceed anyway
          logger.warn(`Could not start user migration transaction: ${txError.message}. Proceeding without transaction.`);
        }
      } else {
        logger.debug('Using existing transaction for user migration');
      }
      
      // Process each user individually
      for (const jsonUser of jsonUsers) {
        try {
          // Skip if already exists
          const existingUser = await this.findByUsername(jsonUser.username);
          if (existingUser) continue;
          
          // Create user
          const user = {
            username: jsonUser.username,
            password_hash: jsonUser.passwordHash, // Already hashed in JSON
            role: jsonUser.role || 'operator',
            created_at: jsonUser.createdAt || new Date().toISOString(),
            updated_at: jsonUser.updatedAt || null,
            last_login: jsonUser.lastLogin || null
          };
          
          // Execute with direct SQL to avoid nested transactions
          const fields = Object.keys(user);
          const placeholders = fields.map(() => '?').join(', ');
          const values = fields.map(field => user[field]);
          
          const sql = `
            INSERT INTO ${this.tableName} (${fields.join(', ')})
            VALUES (${placeholders})
          `;
          
          await this.db.run(sql, values);
          migratedCount++;
        } catch (userError) {
          // Log but continue with other users
          logger.warn(`Error migrating user ${jsonUser.username}: ${userError.message}`);
        }
      }
      
      // Only commit if we started the transaction
      if (!isInTransaction && this.db.inTransaction) {
        try {
          await this.db.commit();
          logger.debug('Committed transaction for user migration');
        } catch (commitError) {
          logger.error(`Failed to commit user migration: ${commitError.message}`);
          // Attempt rollback
          try {
            await this.db.rollback();
          } catch (rollbackError) {
            logger.error(`Additionally failed to rollback: ${rollbackError.message}`);
          }
        }
      }
      
      logger.info(`Migrated ${migratedCount} users from JSON`);
      return migratedCount;
    } catch (error) {
      // Rollback only if we started the transaction
      if (!isInTransaction && this.db.inTransaction) {
        try {
          await this.db.rollback();
          logger.debug('Rolled back transaction due to user migration error');
        } catch (rollbackError) {
          logger.error(`Failed to rollback: ${rollbackError.message}`);
        }
      }
      
      logger.error(`Failed to migrate users: ${error.message}`);
      throw error;
    }
  }
}

module.exports = UserRepository;