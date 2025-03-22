/**
 * src/api/routes/mode.js
 * API routes for managing operation mode
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for operation mode endpoints
 * @param {Object} stateManager - State Manager instance
 * @param {Object} config - Configuration manager instance
 * @returns {Object} Express router
 */
function createModeRouter(stateManager, config) {
  const router = express.Router();
  
  /**
   * GET /api/mode - Get current operation mode and available modes
   */
  router.get('/', (req, res) => {
    try {
      const state = stateManager.getState();
      res.json({
        current: state.mode.current,
        available: state.mode.available
      });
    } catch (error) {
      logger.error(`Error getting operation mode: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/mode/switch - Switch operation mode
   */
  router.post('/switch', async (req, res) => {
    try {
      const { mode } = req.body;
      
      if (!mode) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'mode parameter is required'
        });
      }
      
      // Check if mode is valid
      if (!['traefik', 'direct'].includes(mode)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Mode '${mode}' is not valid. Available modes: traefik, direct`
        });
      }
      
      // Switch mode in state manager
      const modeState = stateManager.switchMode(mode);
      
      logger.info(`Switched operation mode to ${mode}`);
      
      res.json({
        success: true,
        current: modeState.current,
        available: modeState.available
      });
    } catch (error) {
      logger.error(`Error switching operation mode: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createModeRouter;