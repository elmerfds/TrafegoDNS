/**
 * Logs controller
 * Handles log retrieval endpoints
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

/**
 * @desc    Get recent logs
 * @route   GET /api/v1/logs
 * @access  Private
 */
const getLogs = asyncHandler(async (req, res) => {
  try {
    const { limit = 100, level } = req.query;
    
    // Validate limit
    const maxLimit = 1000;
    const parsedLimit = Math.min(parseInt(limit) || 100, maxLimit);
    
    // Get logs from logger buffer
    const logs = logger.getRecentLogs(parsedLimit, level);
    
    res.status(200).json({
      status: 'success',
      data: {
        logs,
        totalReturned: logs.length,
        limit: parsedLimit,
        level: level || 'all'
      }
    });
  } catch (error) {
    logger.error(`Error getting logs: ${error.message}`);
    throw new ApiError('Failed to retrieve logs', 500, 'LOGS_FETCH_ERROR');
  }
});

/**
 * @desc    Clear log buffer
 * @route   DELETE /api/v1/logs
 * @access  Private (admin only)
 */
const clearLogs = asyncHandler(async (req, res) => {
  try {
    logger.clearLogBuffer();
    logger.info('Log buffer cleared via API');
    
    res.status(200).json({
      status: 'success',
      message: 'Log buffer cleared successfully'
    });
  } catch (error) {
    logger.error(`Error clearing logs: ${error.message}`);
    throw new ApiError('Failed to clear logs', 500, 'LOGS_CLEAR_ERROR');
  }
});

module.exports = {
  getLogs,
  clearLogs
};