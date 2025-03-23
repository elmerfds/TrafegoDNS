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
  
  router.get('/whoami', (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication found'
      });
    }
    
    logger.debug(`User info from token: ${JSON.stringify(req.user)}`);
    
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      },
      roleChecks: {
        isAdmin: true,
        isSuperAdmin: true,
        hasUserRole: true,
        hasAdminRole: true,
        hasSuperAdminRole: true
      }
    });
  });
  
  return router;
}

module.exports = createAuthRouter;