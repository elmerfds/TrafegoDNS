/**
 * src/api/routes/auth.js
 * API routes for authentication
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for authentication endpoints
 * @param {Object} authService - Authentication service instance
 * @param {Object} config - Configuration manager instance
 * @returns {Object} Express router
 */
function createAuthRouter(authService, config) {
  const router = express.Router();
  
  /**
   * POST /api/auth/login - Authenticate user with username and password
   */
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      logger.debug(`Login attempt for user: ${username}`);
      
      if (!username || !password) {
        logger.debug('Login failed: Missing username or password');
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Username and password are required'
        });
      }
      
      const result = await authService.authenticate(username, password);
      
      if (!result) {
        logger.debug(`Login failed: Invalid credentials for ${username}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid credentials'
        });
      }
      
      logger.info(`User ${username} authenticated successfully`);
      res.json(result);
    } catch (error) {
      logger.error(`Error during login: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/auth/register - Register a new user (admin only)
   * This endpoint requires admin authentication (handled by middleware)
   */
  router.post('/register', async (req, res) => {
    try {
      // Check if the current user is an admin
      if (!req.user || !authService.isAdmin(req.user)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can register new users'
        });
      }
      
      const { username, password, email, name, role } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Username and password are required'
        });
      }
      
      // Check if requesting user is super_admin or trying to create restricted roles
      const isSuperAdmin = authService.isSuperAdmin(req.user);
      const isRequestingAdminRole = role === 'admin' || role === 'super_admin';
      
      // Only super_admin can create admin or super_admin users
      if (isRequestingAdminRole && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only super administrators can create admin users'
        });
      }
      
      // Create user (the authService will handle role assignment)
      const user = await authService.createUser({
        username,
        password,
        email,
        name,
        role: role || 'user'
      });
      
      res.status(201).json({
        success: true,
        user
      });
    } catch (error) {
      logger.error(`Error registering user: ${error.message}`);
      
      // Check for existing user errors
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/auth/oidc/login - Start OIDC authentication flow
   */
  router.get('/oidc/login', (req, res) => {
    try {
      if (!authService.isOidcEnabled()) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'OIDC authentication is not enabled'
        });
      }
      
      const authUrl = authService.startOidcFlow();
      res.redirect(authUrl);
    } catch (error) {
      logger.error(`Error starting OIDC flow: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/auth/oidc/callback - Handle OIDC callback
   */
  router.get('/oidc/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Authorization code is required'
        });
      }
      
      const result = await authService.handleOidcCallback(code, state);
      
      // Redirect to frontend with token
      const frontendUrl = config.frontendUrl || '/';
      const redirectUrl = `${frontendUrl}?token=${encodeURIComponent(result.token)}`;
      
      if (result.firstLogin) {
        // If this is the first login, add a flag to the redirect URL
        res.redirect(`${redirectUrl}&firstLogin=true`);
      } else {
        res.redirect(redirectUrl);
      }
    } catch (error) {
      logger.error(`Error during OIDC callback: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/auth/profile - Get current user profile
   * This endpoint now has proper manual token validation since many frontends 
   * will expect this path to work.
   */
  router.get('/profile', async (req, res) => {
    try {
      logger.debug(`Profile endpoint called via /api/auth/profile`);
      
      // Manual token verification to ensure this endpoint works reliably
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.debug('Profile endpoint - No auth header or invalid format');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication token is required'
        });
      }
      
      const token = authHeader.split(' ')[1];
      logger.debug(`Profile endpoint - Token length: ${token.length}`);
      
      // Verify token
      const decoded = authService.verifyToken(token);
      if (!decoded) {
        logger.debug('Profile endpoint - Token verification failed');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }
      
      // Log success
      logger.debug(`Profile endpoint - Successfully verified token for ${decoded.username} (${decoded.role})`);
      
      // Return user profile
      res.json({
        user: {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role
        }
      });
    } catch (error) {
      logger.error(`Error in profile endpoint: ${error.message}`);
      logger.error(error.stack);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/auth/users - Get all users (admin only)
   */
  router.get('/users', async (req, res) => {
    try {
      if (!req.user || !authService.isAdmin(req.user)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can view all users'
        });
      }
      
      const users = await authService.getAllUsers();
      res.json({ users });
    } catch (error) {
      logger.error(`Error fetching users: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/auth/users/:userId/role - Update a user's role (super_admin only)
   */
  router.post('/users/:userId/role', async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      if (!userId || !role) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'User ID and new role are required'
        });
      }
      
      // Check appropriate permissions
      const isSuperAdmin = authService.isSuperAdmin(req.user);
      const isAdmin = authService.isAdmin(req.user);
      
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can update user roles'
        });
      }
      
      // Super admin roles can only be assigned by super admins
      if ((role === 'super_admin' || role === 'admin') && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only super administrators can assign admin roles'
        });
      }
      
      // Update the user's role
      const updatedUser = await authService.updateUserRole(userId, role, req.user.id);
      
      res.json({
        success: true,
        user: updatedUser
      });
    } catch (error) {
      logger.error(`Error updating user role: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/auth/status - Get authentication status and available methods
   */
  router.get('/status', (req, res) => {
    try {
      const status = {
        local: true,
        oidc: authService.isOidcEnabled()
      };
      
      res.json(status);
    } catch (error) {
      logger.error(`Error fetching auth status: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createAuthRouter;