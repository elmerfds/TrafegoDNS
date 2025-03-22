/**
 * src/api/routes/status.js
 * API routes for application status
 */
const express = require('express');
const logger = require('../../utils/logger');
const os = require('os');

/**
 * Create router for status endpoints
 * @param {Object} dnsManager - DNS Manager instance
 * @param {Object} stateManager - State Manager instance
 * @returns {Object} Express router
 */
function createStatusRouter(dnsManager, stateManager) {
  const router = express.Router();
  
  /**
   * GET /api/status - Get current application status
   */
  router.get('/', (req, res) => {
    try {
      const state = stateManager.getState();
      
      // Add system information
      const systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        },
        uptime: os.uptime()
      };
      
      // Add version information
      const version = require('../../../package.json').version;
      
      res.json({
        status: state.status,
        stats: state.stats,
        system: systemInfo,
        version
      });
    } catch (error) {
      logger.error(`Error getting status: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/status/stats - Get current statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = stateManager.getState().stats;
      res.json(stats);
    } catch (error) {
      logger.error(`Error getting stats: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/status/stats/reset - Reset statistics
   */
  router.post('/stats/reset', (req, res) => {
    try {
      const stats = stateManager.resetStats();
      
      logger.info('Statistics reset');
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error(`Error resetting stats: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/status/ip - Get public IP addresses
   */
  router.get('/ip', async (req, res) => {
    try {
      // Force refresh of IP addresses
      const ipInfo = await dnsManager.config.updatePublicIPs();
      
      res.json({
        ipv4: ipInfo.ipv4,
        ipv6: ipInfo.ipv6,
        lastCheck: ipInfo.lastCheck
      });
    } catch (error) {
      logger.error(`Error getting IP addresses: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/status/logs - Get recent application logs
   */
  router.get('/logs', (req, res) => {
    try {
      // This would typically be integrated with a log storage system
      // For simplicity, we'll return a message about log availability
      res.json({
        message: 'Log access is available via log files. Use the /config volume to access logs.',
        logFile: '/config/logs/app.log',
        logsAvailable: false
      });
    } catch (error) {
      logger.error(`Error getting logs: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createStatusRouter;