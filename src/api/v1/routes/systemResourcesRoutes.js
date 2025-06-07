/**
 * System Resources Routes
 * API endpoints for system monitoring
 */

const express = require('express')
const router = express.Router()
const { getSystemResources } = require('../controllers/systemResourcesController')
const authMiddleware = require('../middleware/authMiddleware')

/**
 * @swagger
 * components:
 *   schemas:
 *     SystemResources:
 *       type: object
 *       properties:
 *         cpu:
 *           type: object
 *           properties:
 *             usage:
 *               type: number
 *               description: CPU usage percentage
 *             cores:
 *               type: integer
 *               description: Number of CPU cores
 *             loadAverage:
 *               type: array
 *               items:
 *                 type: number
 *               description: System load averages
 *             frequency:
 *               type: number
 *               description: CPU frequency in MHz
 *         memory:
 *           type: object
 *           properties:
 *             used:
 *               type: number
 *               description: Used memory in GB
 *             total:
 *               type: number
 *               description: Total memory in GB
 *             available:
 *               type: number
 *               description: Available memory in GB
 *             percentage:
 *               type: number
 *               description: Memory usage percentage
 *         disk:
 *           type: object
 *           properties:
 *             used:
 *               type: number
 *               description: Used disk space in GB
 *             total:
 *               type: number
 *               description: Total disk space in GB
 *             available:
 *               type: number
 *               description: Available disk space in GB
 *             percentage:
 *               type: number
 *               description: Disk usage percentage
 *             path:
 *               type: string
 *               description: Disk path
 *         uptime:
 *           type: number
 *           description: System uptime in seconds
 *         platform:
 *           type: string
 *           description: Operating system platform
 */

/**
 * @swagger
 * /api/v1/status/system-resources:
 *   get:
 *     summary: Get real-time system resource usage
 *     description: Returns current CPU, memory, and disk usage statistics
 *     tags: [System]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System resources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SystemResources'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authMiddleware, getSystemResources)

module.exports = router