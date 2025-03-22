/**
 * src/api/routes/settings.js
 * API routes for managing application settings
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for settings endpoints
 * @param {Object} config - Configuration manager instance
 * @param {Object} stateManager - State Manager instance
 * @returns {Object} Express router
 */
function createSettingsRouter(config, stateManager) {
  const router = express.Router();
  
  /**
   * GET /api/settings - Get current application settings
   */
  router.get('/', (req, res) => {
    try {
      const settings = stateManager.getState().settings;
      res.json(settings);
    } catch (error) {
      logger.error(`Error getting settings: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/settings - Update application settings
   */
  router.post('/', (req, res) => {
    try {
      const settings = req.body;
      
      // Validate settings
      if (settings.pollInterval !== undefined && (!Number.isInteger(settings.pollInterval) || settings.pollInterval < 5000)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'pollInterval must be an integer greater than or equal to 5000'
        });
      }
      
      if (settings.logLevel !== undefined && !['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'].includes(settings.logLevel)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'logLevel must be one of: ERROR, WARN, INFO, DEBUG, TRACE'
        });
      }
      
      // Update settings in state manager
      const updatedSettings = stateManager.updateSettings(settings);
      
      logger.info('Updated application settings');
      
      res.json({
        success: true,
        settings: updatedSettings
      });
    } catch (error) {
      logger.error(`Error updating settings: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/settings/reset - Reset application settings to defaults
   */
  router.post('/reset', (req, res) => {
    try {
      // Default settings
      const defaultSettings = {
        cleanupOrphaned: false,
        logLevel: 'INFO',
        pollInterval: 60000,
        watchDockerEvents: true
      };
      
      // Update settings in state manager
      const updatedSettings = stateManager.updateSettings(defaultSettings);
      
      logger.info('Reset application settings to defaults');
      
      res.json({
        success: true,
        settings: updatedSettings
      });
    } catch (error) {
      logger.error(`Error resetting settings: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createSettingsRouter;