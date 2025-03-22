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
  }
  
  /**
   * Initialize the authentication service
   */
  async initialize() {
    try {
      // Initialize database
      await this.database.initialize();
      
      // Initialize OIDC client
      await this.oidcClient.initialize();
      
      // Create default admin user if none exists
      const adminUser = await this.database.getUserByUsername('admin');
      
      if (!adminUser) {
        const defaultPassword = this.config.defaultAdminPassword || process.env.DEFAULT_ADMIN_PASSWORD;
        
        if (defaultPassword) {
          logger.info('Creating default admin user');
          await this.createUser({
            username: 'admin',
            password: defaultPassword,
            email: 'admin@example.com',
            name: 'Administrator',
            role: 'admin'
          });
        } else {
          logger.warn('No default admin password configured, skipping admin creation');
        }
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
    try {
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
        user: this.sanitizeUser(user)
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
        role
      });
      
      logger.info(`Created new user: ${username}`);
      
      return this.sanitizeUser(user);
    } catch (error) {
      logger.error(`Error creating user: ${error.message}`);
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
      
      // Check if user exists by email
      let user = await this.database.getUserByEmail(userInfo.email);
      
      if (!user) {
        // Create new user from OIDC data
        user = await this.createUserFromOidc(userInfo);
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
        user: this.sanitizeUser(user)
      };
    } catch (error) {
      logger.error(`Error handling OIDC callback: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a user from OIDC data
   * @param {Object} userInfo - User info from OIDC provider
   * @returns {Object} Created user
   */
  async createUserFromOidc(userInfo) {
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
        role: 'user' // Default role for OIDC users
      });
      
      logger.info(`Created new user from OIDC: ${username}`);
      
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
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }
  
  /**
   * Sanitize user object to remove sensitive data
   * @param {Object} user - User object from database
   * @returns {Object} Sanitized user object
   */
  sanitizeUser(user) {
    const { id, username, email, name, role, created_at, last_login } = user;
    return { id, username, email, name, role, created_at, last_login };
  }
  
  /**
   * Check if OIDC authentication is enabled
   * @returns {boolean} Whether OIDC is enabled
   */
  isOidcEnabled() {
    return this.oidcClient.isEnabled();
  }
  
  /**
   * Close database connection
   */
  async close() {
    await this.database.close();
  }
}

module.exports = AuthService;