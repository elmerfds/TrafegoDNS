/**
 * src/auth/service.js
 * Simplified Authentication Service for TráfegoDNS
 */
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class AuthService {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    this.defaultPassword = this.config.defaultAdminPassword || process.env.DEFAULT_ADMIN_PASSWORD || 'trafegodns';
    
    // JWT configuration
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || 'trafegodns-secret-key';
    this.jwtExpiresIn = config.jwtExpiresIn || '24h';
    
    // Hardcoded admin user
    this.adminUser = {
      id: 'admin',
      username: this.defaultUsername,
      password: this.defaultPassword,
      role: 'admin'
    };
    
    // User role constants
    this.ROLES = {
      SUPER_ADMIN: 'super_admin',
      ADMIN: 'admin',
      USER: 'user'
    };
    
    logger.info(`Auth service initialized with single admin user: ${this.adminUser.username}`);
  }
  
  /**
   * Initialize the authentication service
   */
  async initialize() {
    logger.info('Simplified authentication service initialized successfully');
    return true;
  }
  
  /**
   * Authenticate a user with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object|null} User data and token if authenticated, null otherwise
   */
  async authenticate(username, password) {
    // Check if credentials match admin user
    if (username === this.adminUser.username && password === this.adminUser.password) {
      // Generate JWT token
      const token = this.generateToken(this.adminUser);
      
      logger.info(`User ${username} authenticated successfully`);
      
      return {
        token,
        user: {
          id: this.adminUser.id,
          username: this.adminUser.username,
          role: this.adminUser.role
        }
      };
    }
    
    logger.debug(`Authentication failed for ${username}`);
    return null;
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
    // Ensure user has the correct format
    const userForToken = {
      id: user.id || 'admin',
      username: user.username || 'admin',
      role: 'admin',
      iat: Math.floor(Date.now() / 1000)
    };
    
    return jwt.sign(userForToken, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }
  
  /**
   * Check if a user has the specified role
   * @param {Object} user - User object
   * @param {string} requiredRole - Role to check for
   * @returns {boolean} Always returns true since all users are admins
   */
  hasRole(user, requiredRole) {
    return true;  // Everyone is admin, so always return true
  }
  
  /**
   * Check if user is an admin
   * @param {Object} user - User object
   * @returns {boolean} Always true - all users are admins
   */
  isAdmin(user) {
    return true;
  }
  
  /**
   * Check if user is a super admin
   * @param {Object} user - User object
   * @returns {boolean} Always true - all users are admins with full privileges
   */
  isSuperAdmin(user) {
    return true;
  }
  
  /**
   * Get authentication status
   * @returns {Object} Auth status details
   */
  getAuthStatus() {
    return {
      enabled: true,
      local: true,
      oidc: false,
      oidcOnly: false
    };
  }
  
  /**
   * Close database connection
   */
  async close() {
    // No database to close in simplified version
    logger.debug('Auth service closed');
  }
}

module.exports = AuthService;