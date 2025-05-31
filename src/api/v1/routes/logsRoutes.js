/**
 * Logs routes
 */
const express = require('express');
const router = express.Router();
const {
  getLogs,
  clearLogs
} = require('../controllers/logsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /logs:
 *  get:
 *    summary: Get recent logs
 *    tags: [Logs]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: query
 *        name: limit
 *        schema:
 *          type: integer
 *          minimum: 1
 *          maximum: 1000
 *          default: 100
 *        description: Maximum number of logs to return
 *      - in: query
 *        name: level
 *        schema:
 *          type: string
 *          enum: [error, warn, info, debug, trace]
 *        description: Minimum log level to include (includes all higher priority levels)
 *    responses:
 *      200:
 *        description: Recent logs retrieved successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                data:
 *                  type: object
 *                  properties:
 *                    logs:
 *                      type: array
 *                      items:
 *                        type: object
 *                        properties:
 *                          level:
 *                            type: string
 *                          message:
 *                            type: string
 *                          formattedMessage:
 *                            type: string
 *                          timestamp:
 *                            type: string
 *                          symbol:
 *                            type: string
 *                    totalReturned:
 *                      type: number
 *                    limit:
 *                      type: number
 *                    level:
 *                      type: string
 *      401:
 *        description: Not authenticated
 *      500:
 *        description: Server error
 */
router.get('/', authenticate, getLogs);

/**
 * @swagger
 * /logs:
 *  delete:
 *    summary: Clear log buffer
 *    tags: [Logs]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Log buffer cleared successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                message:
 *                  type: string
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      500:
 *        description: Server error
 */
router.delete('/', authenticate, authorize(['admin']), clearLogs);

module.exports = router;