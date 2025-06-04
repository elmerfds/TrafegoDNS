/**
 * Status routes
 */
const express = require('express');
const router = express.Router();
const {
  getStatus,
  getMetrics,
  getLogs,
  getEnvironment,
  getRateLimitingStatus,
  clearBlockedIPAddress,
  clearAllBlockedIPs
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

/**
 * @swagger
 * /status/rate-limit:
 *  get:
 *    summary: Get rate limiting status
 *    description: Shows current blocked IPs and rate limiting configuration
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Rate limiting status
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
 *                    blockedIPs:
 *                      type: array
 *                      items:
 *                        type: string
 *                    suspiciousIPs:
 *                      type: array
 *                      items:
 *                        type: object
 *                    configuration:
 *                      type: object
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.get('/rate-limit', authenticate, authorize(['admin']), getRateLimitingStatus);

/**
 * @swagger
 * /status/rate-limit/blocked/{ip}:
 *  delete:
 *    summary: Clear blocked IP address
 *    description: Remove a specific IP from the blocked list
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: ip
 *        schema:
 *          type: string
 *        required: true
 *        description: IP address to unblock
 *    responses:
 *      200:
 *        description: IP address cleared successfully
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
 *                data:
 *                  type: object
 *      400:
 *        description: Invalid IP address
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.delete('/rate-limit/blocked/:ip', authenticate, authorize(['admin']), clearBlockedIPAddress);

/**
 * @swagger
 * /status/rate-limit/blocked:
 *  delete:
 *    summary: Clear all blocked IPs
 *    description: Remove all IPs from the blocked and suspicious lists
 *    tags: [Status]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: All blocked IPs cleared successfully
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
 *                data:
 *                  type: object
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.delete('/rate-limit/blocked', authenticate, authorize(['admin']), clearAllBlockedIPs);

// Health endpoint - always public
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is operational' });
});

module.exports = router;