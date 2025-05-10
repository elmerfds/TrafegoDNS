/**
 * Status routes
 */
const express = require('express');
const router = express.Router();
const {
  getStatus,
  getMetrics,
  getLogs,
  getEnvironment
} = require('../controllers/statusController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /status:
 *  get:
 *    summary: Get system status
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: System status information
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
 *                    version:
 *                      type: string
 *                    uptime:
 *                      type: number
 *                    hostname:
 *                      type: string
 *                    services:
 *                      type: object
 *                    operationMode:
 *                      type: string
 *      401:
 *        description: Not authenticated
 */
router.get('/', authenticate, getStatus);

/**
 * @swagger
 * /status/metrics:
 *  get:
 *    summary: Get system metrics
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: System metrics information
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
 *                    system:
 *                      type: object
 *                    process:
 *                      type: object
 *                    dns:
 *                      type: object
 *      401:
 *        description: Not authenticated
 */
router.get('/metrics', authenticate, getMetrics);

/**
 * @swagger
 * /status/logs:
 *  get:
 *    summary: Get recent logs
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Recent log entries
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
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.get('/logs', authenticate, authorize(['admin', 'operator']), getLogs);

/**
 * @swagger
 * /status/env:
 *  get:
 *    summary: Get environment variables (dev only)
 *    description: Returns non-sensitive environment variables (only in development)
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Environment variables
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
 *                    environment:
 *                      type: object
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.get('/env', authenticate, authorize(['admin']), getEnvironment);

// Health endpoint - always public
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is operational' });
});

module.exports = router;