/**
 * src/auth/service.js
 * Authentication service for TráfegoDNS
 */
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const AuthDatabase = require('./database');
const OpenIDConnectClient = require('./oidc-client');

class AuthService {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.database = new AuthDatabase(config);
    this.oidcClient = new OpenIDConnectClient(config);
    
    // JWT configuration
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'trafegodns-secret-key';
    this.jwtExpiresIn = config.jwtExpiresIn || '24h';
    
    // Salt rounds for password hashing
    this.saltRounds = 10;
    
    // Auth enablement flags
    this.authEnabled = process.env.AUTH_ENABLED !== 'false';
    this.localAuthEnabled = process.env.LOCAL_AUTH_ENABLED !== 'false';
    this.oidcOnly = process.env.OIDC_ONLY === 'true';
    
    // Default admin credentials
    this.defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    this.defaultAdminPassword = this.config.defaultAdminPassword || process.env.DEFAULT_ADMIN_PASSWORD;
    this.defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
    
    // User role constants
    this.ROLES = {
      SUPER_ADMIN: 'super_admin',
      ADMIN: 'admin',
      USER: 'user'
    };
    
    // Role hierarchy (for permission checks)
    this.ROLE_HIERARCHY = {
      super_admin: 3,
      admin: 2,
      user: 1
    };
    
    logger.debug(`Auth service initialized with authEnabled=${this.authEnabled}, localAuthEnabled=${this.localAuthEnabled}, oidcOnly=${this.oidcOnly}`);
  }
  
  /**
   * Initialize the authentication service
   */
  async initialize() {
    try {
      // Initialize database
      await this.database.initialize();
      
      // Initialize OIDC client
      if (this.config.oidcEnabled) {
        await this.oidcClient.initialize();
      }
      
      // Try to create default super admin user if no users exist
      const userCount = await this.database.getUserCount();
      
      // Only check for user creation needs if no users exist
      if (userCount === 0) {
        logger.info('No users found in database, checking for admin credentials');
        
        if (this.defaultAdminPassword) {
          logger.info(`Creating default super admin user '${this.defaultAdminUsername}'`);
          await this.createUser({
            username: this.defaultAdminUsername,
            password: this.defaultAdminPassword,
            email: this.defaultAdminEmail,
            name: 'Super Administrator',
            role: this.ROLES.SUPER_ADMIN
          });
          logger.info(`Created super admin user '${this.defaultAdminUsername}'`);
        } else {
          logger.warn('No default admin password configured, waiting for first login to create super admin');
        }
      } else {
        logger.debug(`Found ${userCount} existing users in database`);
      }
      
      // Set up scheduled session cleanup
      setInterval(() => this.cleanupSessions(), 15 * 60 * 1000); // Every 15 minutes
      
      logger.info('Authentication service initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize authentication service: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if authentication is enabled
   */
  isAuthEnabled() {
    return this.authEnabled;
  }
  
  /**
   * Check if local authentication is enabled
   */
  isLocalAuthEnabled() {
    return this.localAuthEnabled && !this.oidcOnly;
  }
  
  /**
   * Clean up expired sessions
   */
  async cleanupSessions() {
    try {
      const cleaned = await this.database.cleanupSessions();
      if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired sessions`);
      }
    } catch (error) {
      logger.error(`Error cleaning up sessions: ${error.message}`);
    }
  }
  
  /**
   * Authenticate a user with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object|null} User data and token if authenticated, null otherwise
   */
  async authenticate(username, password) {
    // Check if auth is disabled entirely
    if (!this.authEnabled) {
      logger.debug('Authentication is disabled, creating dummy super admin session');
      return {
        token: this.generateToken({
          id: 'system',
          username: 'system',
          role: this.ROLES.SUPER_ADMIN
        }),
        user: {
          id: 'system',
          username: 'system',
          role: this.ROLES.SUPER_ADMIN
        }
      };
    }
    
    // Check if local auth is disabled
    if (!this.isLocalAuthEnabled()) {
      logger.warn('Local authentication is disabled');
      return null;
    }
    
    try {
      // First check if we need to handle first-login super admin creation
      const userCount = await this.database.getUserCount();
      
      // If this is the very first login attempt and no users exist, create super admin
      if (userCount === 0) {
        logger.info(`First login attempt detected with username '${username}', creating super admin account`);
        
        // Create a super admin user with these credentials
        const superAdmin = await this.createUser({
          username: username,
          password: password,
          email: `${username}@example.com`, // Placeholder email
          name: 'Super Administrator',
          role: this.ROLES.SUPER_ADMIN
        });
        
        // Generate JWT token
        const token = this.generateToken(superAdmin);
        
        logger.success(`First login: Created super admin user '${username}'`);
        
        return {
          token,
          user: this.sanitizeUser(superAdmin),
          firstLogin: true
        };
      }
      
      // Normal authentication flow
      const user = await this.database.getUserByUsername(username);
      if (!user) {
        logger.debug(`Authentication failed: User ${username} not found`);
        return null;
      }
      
      // Check password
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        logger.debug(`Authentication failed: Invalid password for ${username}`);
        return null;
      }
      
      // Update last login time
      await this.database.updateLastLogin(user.id);
      
      // Generate JWT token
      const token = this.generateToken(user);
      
      logger.info(`User ${username} authenticated successfully`);
      
      return {
        token,
        user: this.sanitizeUser(user),
        firstLogin: false
      };
    } catch (error) {
      logger.error(`Error during authentication: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Object} Created user
   */
  async createUser(userData) {
    try {
      const { username, password, email, name, role } = userData;
      
      // Determine user count for first-user special case
      const userCount = await this.database.getUserCount();
      
      // If this is the first user, always make them a super admin regardless of requested role
      const finalRole = userCount === 0 ? this.ROLES.SUPER_ADMIN : (role || this.ROLES.USER);
      
      // Check if username already exists
      const existingUser = await this.database.getUserByUsername(username);
      if (existingUser) {
        throw new Error(`Username ${username} already exists`);
      }
      
      // Check if email already exists
      if (email) {
        const existingEmail = await this.database.getUserByEmail(email);
        if (existingEmail) {
          throw new Error(`Email ${email} already exists`);
        }
      }
      
      // Hash password
      const password_hash = await bcrypt.hash(password, this.saltRounds);
      
      // Create user
      const user = await this.database.createUser({
        id: uuidv4(),
        username,
        password_hash,
        email,
        name,
        role: finalRole
      });
      
      if (finalRole === this.ROLES.SUPER_ADMIN) {
        logger.info(`Created new super admin user: ${username}`);
      } else if (finalRole === this.ROLES.ADMIN) {
        logger.info(`Created new admin user: ${username}`);
      } else {
        logger.info(`Created new user: ${username}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update a user's role
   * @param {string} userId - User ID to update
   * @param {string} newRole - New role to assign
   * @param {string} updatedBy - ID of user making the change
   * @returns {Object} Updated user
   */
  async updateUserRole(userId, newRole, updatedBy) {
    try {
      // Verify that the requested role is valid
      if (!Object.values(this.ROLES).includes(newRole)) {
        throw new Error(`Invalid role: ${newRole}`);
      }
      
      // Get the user to update
      const userToUpdate = await this.database.getUserById(userId);
      if (!userToUpdate) {
        throw new Error(`User not found with ID: ${userId}`);
      }
      
      // Get the user who is making the change
      const updatingUser = await this.database.getUserById(updatedBy);
      if (!updatingUser) {
        throw new Error(`Updating user not found with ID: ${updatedBy}`);
      }
      
      // Check if updater has sufficient privileges
      if (!this.canManageRole(updatingUser, userToUpdate, newRole)) {
        throw new Error(`Insufficient permissions: User ${updatingUser.username} cannot change role of ${userToUpdate.username} to ${newRole}`);
      }
      
      // Update the role
      const updatedUser = await this.database.updateUserRole(userId, newRole);
      
      logger.info(`User ${updatingUser.username} updated role of ${userToUpdate.username} to ${newRole}`);
      
      return this.sanitizeUser(updatedUser);
    } catch (error) {
      logger.error(`Error updating user role: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a user can manage another user's role
   * @param {Object} manager - User trying to manage roles
   * @param {Object} target - User being managed
   * @param {string} newRole - New role to assign
   * @returns {boolean} Whether the manager can change the target's role
   */
  canManageRole(manager, target, newRole) {
    // Can't manage your own role
    if (manager.id === target.id) {
      return false;
    }
    
    const managerLevel = this.ROLE_HIERARCHY[manager.role] || 0;
    const targetLevel = this.ROLE_HIERARCHY[target.role] || 0;
    const newRoleLevel = this.ROLE_HIERARCHY[newRole] || 0;
    
    // Super admin can manage any role
    if (manager.role === this.ROLES.SUPER_ADMIN) {
      return true;
    }
    
    // Only super_admin can manage admin or super_admin roles
    if (targetLevel >= this.ROLE_HIERARCHY.admin || newRoleLevel >= this.ROLE_HIERARCHY.admin) {
      return false;
    }
    
    // Regular admins can only manage user roles
    return managerLevel >= this.ROLE_HIERARCHY.admin;
  }
  
  /**
   * Delete a user
   * @param {string} userId - User ID to delete
   * @param {string} deletedBy - ID of user performing the deletion
   * @returns {boolean} Success status
   */
  async deleteUser(userId, deletedBy) {
    try {
      // Get user to delete
      const userToDelete = await this.database.getUserById(userId);
      if (!userToDelete) {
        throw new Error(`User not found with ID: ${userId}`);
      }
      
      // Get user performing deletion
      const deletingUser = await this.database.getUserById(deletedBy);
      if (!deletingUser) {
        throw new Error(`Deleting user not found with ID: ${deletedBy}`);
      }
      
      // Check if deleter has sufficient privileges
      if (deletingUser.id === userId) {
        throw new Error("Users cannot delete themselves");
      }
      
      const deleterLevel = this.ROLE_HIERARCHY[deletingUser.role] || 0;
      const targetLevel = this.ROLE_HIERARCHY[userToDelete.role] || 0;
      
      // Super admin can delete anyone
      if (deletingUser.role === this.ROLES.SUPER_ADMIN) {
        // Allow deletion
      } 
      // Admin can only delete users
      else if (deletingUser.role === this.ROLES.ADMIN && targetLevel < this.ROLE_HIERARCHY.admin) {
        // Allow deletion of regular users
      }
      else {
        throw new Error(`Insufficient permissions: User ${deletingUser.username} cannot delete ${userToDelete.username}`);
      }
      
      // Delete the user
      await this.database.deleteUser(userId);
      
      logger.info(`User ${deletingUser.username} deleted user ${userToDelete.username}`);
      
      return true;
    } catch (error) {
      logger.error(`Error deleting user: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Start OIDC authentication flow
   * @returns {string} Authorization URL
   */
  startOidcFlow() {
    if (!this.oidcClient.isEnabled()) {
      throw new Error('OIDC authentication is not enabled');
    }
    
    return this.oidcClient.getAuthorizationUrl();
  }
  
  /**
   * Handle OIDC callback
   * @param {string} code - Authorization code
   * @param {string} state - State parameter
   * @returns {Object} User data and token
   */
  async handleOidcCallback(code, state) {
    try {
      if (!this.oidcClient.isEnabled()) {
        throw new Error('OIDC authentication is not enabled');
      }
      
      // Exchange code for token
      const tokenData = await this.oidcClient.exchangeCodeForToken(code, state);
      
      // Get user info
      const userInfo = await this.oidcClient.getUserInfo(tokenData.access_token);
      
      // Check if this is the first login ever
      const userCount = await this.database.getUserCount();
      const isFirstLogin = userCount === 0;
      
      // Check if user exists by email
      let user = await this.database.getUserByEmail(userInfo.email);
      
      if (!user) {
        // For the first login via OIDC, create a super admin
        // Otherwise create a regular user
        const role = isFirstLogin ? this.ROLES.SUPER_ADMIN : this.ROLES.USER;
        
        // Create new user from OIDC data
        user = await this.createUserFromOidc(userInfo, role);
        
        if (isFirstLogin) {
          logger.success(`First login via OIDC: Created super admin user '${user.username}'`);
        }
      }
      
      // Store token
      await this.database.storeOidcToken(
        user.id, 
        tokenData.provider, 
        tokenData
      );
      
      // Update last login
      await this.database.updateLastLogin(user.id);
      
      // Generate JWT token
      const token = this.generateToken(user);
      
      logger.info(`User ${user.username} authenticated via OIDC`);
      
      return {
        token,
        user: this.sanitizeUser(user),
        firstLogin: isFirstLogin
      };
    } catch (error) {
      logger.error(`Error handling OIDC callback: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a user from OIDC data
   * @param {Object} userInfo - User info from OIDC provider
   * @param {string} role - Role to assign, defaults to 'user'
   * @returns {Object} Created user
   */
  async createUserFromOidc(userInfo, role = this.ROLES.USER) {
    try {
      // Generate a username from email if not provided
      let username = userInfo.preferred_username || userInfo.username;
      
      if (!username) {
        username = userInfo.email.split('@')[0];
      }
      
      // Check if username exists
      let baseUsername = username;
      let suffix = 1;
      let existingUser = await this.database.getUserByUsername(username);
      
      // Append a number if username exists
      while (existingUser) {
        username = `${baseUsername}${suffix}`;
        suffix++;
        existingUser = await this.database.getUserByUsername(username);
      }
      
      // Generate a random password (user will authenticate via OIDC)
      const password = uuidv4();
      const password_hash = await bcrypt.hash(password, this.saltRounds);
      
      // Create user
      const user = await this.database.createUser({
        id: uuidv4(),
        username,
        password_hash,
        email: userInfo.email,
        name: userInfo.name,
        role: role
      });
      
      // Log appropriate message based on role
      if (role === this.ROLES.SUPER_ADMIN) {
        logger.info(`Created new super admin from OIDC: ${username}`);
      } else if (role === this.ROLES.ADMIN) {
        logger.info(`Created new admin from OIDC: ${username}`);
      } else {
        logger.info(`Created new user from OIDC: ${username}`);
      }
      
      return user;
    } catch (error) {
      logger.error(`Error creating user from OIDC: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Validate a JWT token
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded token payload or null if invalid
   */
  verifyToken(token) {
    // If auth is disabled, return a system super admin user
    if (!this.authEnabled) {
      return {
        id: 'system',
        username: 'system',
        role: this.ROLES.SUPER_ADMIN
      };
    }
    
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return decoded;
    } catch (error) {
      logger.debug(`Token validation failed: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Generate a JWT token for a user
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    // Ensure user has the correct format
    const userForToken = {
      id: user.id || 'system',
      username: user.username || 'system',
      role: user.role || this.ROLES.USER,
      iat: Math.floor(Date.now() / 1000)
    };
    
    // Log what we're putting in the token
    logger.debug(`Generating token for user: ${userForToken.username}, role: ${userForToken.role}`);
    
    return jwt.sign(userForToken, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }
  
  /**
   * Sanitize user object to remove sensitive data
   * @param {Object} user - User object from database
   * @returns {Object} Sanitized user object
   */
  sanitizeUser(user) {
    if (!user) return null;
    const { id, username, email, name, role, created_at, last_login } = user;
    return { id, username, email, name, role, created_at, last_login };
  }
  
  /**
   * Get all users
   * @returns {Array} List of users
   */
  async getAllUsers() {
    try {
      const users = await this.database.getAllUsers();
      return users.map(user => this.sanitizeUser(user));
    } catch (error) {
      logger.error(`Error getting all users: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Check if a user has at least the specified role
   * @param {Object} user - User object
   * @param {string} requiredRole - Role to check for
   * @returns {boolean} True if user has required role or higher
   */
  hasRole(user, requiredRole) {
    // If auth is globally disabled, always return true
    if (!this.authEnabled) {
      return true;
    }
    
    if (!user || !user.role) return false;
    
    console.log(`Checking if user ${user.username} has role ${requiredRole}`);
    
    // Normalize roles for comparison
    const userRole = user.role.toLowerCase();
    const required = requiredRole.toLowerCase();
    
    // Role hierarchy: super_admin > admin > user
    if (required === 'user') {
      return ['user', 'admin', 'super_admin'].includes(userRole);
    } else if (required === 'admin') {
      return ['admin', 'super_admin'].includes(userRole);
    } else if (required === 'super_admin') {
      return userRole === 'super_admin';
    }
    
    return false;
  }
  
  /**
   * Check if user is an admin (admin or super_admin)
   * @param {Object} user - User object
   * @returns {boolean} True if user is admin
   */
  isAdmin(user) {
    // Debug log to see what's being checked
    console.log('Checking admin status for user:', user);
    
    if (!user) return false;
    
    // Check log to see the value of user.role
    console.log('User role:', user.role);
    
    // Handle string case issues and multiple admin types
    const role = user.role ? user.role.toLowerCase() : '';
    return role === 'admin' || role === 'super_admin';
  }
  
  /**
   * Check if user is a super admin
   * @param {Object} user - User object
   * @returns {boolean} True if user is super_admin
   */
  isSuperAdmin(user) {
    return user && user.role === this.ROLES.SUPER_ADMIN;
  }
  
  /**
   * Check if OIDC authentication is enabled
   * @returns {boolean} Whether OIDC is enabled
   */
  isOidcEnabled() {
    return this.oidcClient.isEnabled();
  }
  
  /**
   * Get authentication status
   * @returns {Object} Auth status details
   */
  getAuthStatus() {
    return {
      enabled: this.authEnabled,
      local: this.isLocalAuthEnabled(),
      oidc: this.isOidcEnabled(),
      oidcOnly: this.oidcOnly
    };
  }
  
  /**
   * Close database connection
   */
  async close() {
    await this.database.close();
  }
}

module.exports = AuthService;