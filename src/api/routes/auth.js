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
      
      // Debug the request user object
      console.log('USER REQUEST OBJECT:', JSON.stringify(req.user, null, 2));
      
      // Debug the auth service
      console.log('AUTH SERVICE:', typeof authService, Object.keys(authService));
      
      // Check if isAdmin exists and is a function
      console.log('IS ADMIN FUNCTION:', typeof authService.isAdmin);
      
      // Test the isAdmin function directly
      const adminCheckResult = authService.isAdmin(req.user);
      console.log('ADMIN CHECK RESULT:', adminCheckResult);
      
      // Check the user's role specifically
      console.log('USER ROLE:', req.user ? req.user.role : 'no user');
      
      // Verify user is admin with detailed logging
      if (!req.user) {
        console.log('FAILING: No user in request');
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can view all users'
        });
      }
      
      if (!authService.isAdmin(req.user)) {
        console.log('FAILING: User is not admin. Role:', req.user.role);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can view all users'
        });
      }
      
      console.log('SUCCESS: User is admin, fetching users');
      const users = await authService.getAllUsers();
      return res.json({ users });
    } catch (error) {
      console.error(`Error in users endpoint:`, error);
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

  // POST /api/auth/users/:userId/delete - Delete a user (admin/super_admin only)
  router.post('/users/:userId/delete', async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      // Get user to delete
      const userToDelete = await authService.database.getUserById(userId);
      if (!userToDelete) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found'
        });
      }
      
      // Check permissions - only super_admin can delete admins, admins can delete regular users
      const isSuperAdmin = authService.isSuperAdmin(req.user);
      const isAdmin = authService.isAdmin(req.user);
      
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only administrators can delete users'
        });
      }
      
      if (userToDelete.role === 'super_admin' && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only super administrators can delete super admin users'
        });
      }
      
      if (userToDelete.role === 'admin' && !isSuperAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only super administrators can delete admin users'
        });
      }
      
      // Cannot delete yourself
      if (userToDelete.id === req.user.id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Cannot delete your own account'
        });
      }
      
      // Delete the user
      await authService.database.deleteUser(userId);
      
      res.json({
        success: true,
        message: `User ${userToDelete.username} deleted successfully`
      });
    } catch (error) {
      logger.error(`Error deleting user: ${error.message}`);
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
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication found'
      });
    }
    
    logger.debug(`User info from token: ${JSON.stringify(req.user)}`);
    
    // Check role capabilities
    const isAdminCheck = authService.isAdmin(req.user);
    const isSuperAdminCheck = authService.isSuperAdmin(req.user);
    
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      },
      roleChecks: {
        isAdmin: isAdminCheck,
        isSuperAdmin: isSuperAdminCheck,
        hasUserRole: authService.hasRole(req.user, authService.ROLES.USER),
        hasAdminRole: authService.hasRole(req.user, authService.ROLES.ADMIN),
        hasSuperAdminRole: authService.hasRole(req.user, authService.ROLES.SUPER_ADMIN)
      }
    });
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