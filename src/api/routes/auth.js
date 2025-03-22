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
      
      if (!username || !password) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Username and password are required'
        });
      }
      
      const result = await authService.authenticate(username, password);
      
      if (!result) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid credentials'
        });
      }
      
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
      if (!req.user || req.user.role !== 'admin') {
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
      
      // Create user
      const user = await authService.createUser({
        username,
        password,
        email,
        name,
        role
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
      
      res.redirect(redirectUrl);
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
   */
  router.get('/profile', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      res.json({
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role
        }
      });
    } catch (error) {
      logger.error(`Error fetching user profile: ${error.message}`);
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