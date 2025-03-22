// src/api/routes/profile.js
const express = require('express');
const logger = require('../../utils/logger');

function createProfileRouter() {
  const router = express.Router();
  
  router.get('/', async (req, res) => {
    try {
      logger.debug(`Profile endpoint called - Has user: ${!!req.user}`);
      
      if (!req.user) {
        logger.debug('Profile endpoint - No user in request');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }
      
      // Return the user profile
      logger.debug(`Profile endpoint - Returning profile for user: ${req.user.username}`);
      res.json({
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role
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
  
  return router;
}

module.exports = createProfileRouter;