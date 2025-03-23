// src/api/routes/auth.js
const express = require('express');
const logger = require('../../utils/logger');

function createAuthRouter(authService, config) {
  const router = express.Router();
  
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      logger.debug(`Login attempt for user: ${username}`);
      
      if (!username || !password) {
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
  
  router.get('/profile', async (req, res) => {
    try {
      logger.debug(`Profile endpoint called`);
      
      // Manual token verification for reliability
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication token is required'
        });
      }
      
      const token = authHeader.split(' ')[1];
      
      // Verify token
      const decoded = authService.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }
      
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
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  router.get('/users', async (req, res) => {
    try {
      logger.debug(`Users endpoint called`);
      
      // Verify user is admin
      if (!req.user || !authService.isAdmin(req.user)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can view all users'
        });
      }
      
      const users = await authService.getAllUsers();
      return res.json({ users });
    } catch (error) {
      logger.error(`Error in users endpoint: ${error.message}`);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
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
      
      // Update the user's role
      const updatedUser = await authService.updateUserRole(userId, role, req.user.id);
      
      res.json({
        success: true,
        user: updatedUser
      });
    } catch (error) {
      logger.error(`Error updating user role: ${error.message}`);
      
      if (error.message.includes('Insufficient permissions')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: error.message
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  router.get('/status', (req, res) => {
    try {
      const status = authService.getAuthStatus();
      res.json(status);
    } catch (error) {
      logger.error(`Error fetching auth status: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  // Debugging endpoint
  router.get('/whoami', (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No authentication found'
        });
      }
      
      res.json({
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role
        },
        isAdmin: authService.isAdmin(req.user),
        isSuperAdmin: authService.isSuperAdmin(req.user)
      });
    } catch (error) {
      logger.error(`Error in whoami endpoint: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
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
  
  return router;
}

module.exports = createAuthRouter;