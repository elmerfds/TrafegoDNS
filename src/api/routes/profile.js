/**
 * src/api/routes/profile.js
 * User profile routes
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for profile endpoints
 * @returns {Object} Express router
 */
function createProfileRouter() {
  const router = express.Router();
  
  /**
   * GET /api/profile - Get current user profile
   */
  router.get('/', async (req, res) => {
    try {
      logger.debug(`Profile endpoint called - User object: ${JSON.stringify(req.user)}`);
      
      if (!req.user) {
        logger.debug('Profile endpoint - No user object in request - Authentication failed');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      // Log success
      logger.debug(`Profile endpoint - Returning profile for user: ${req.user.username} (${req.user.role})`);
      
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
  
  return router;
}

module.exports = createProfileRouter;