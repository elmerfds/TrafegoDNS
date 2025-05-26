/**
 * Configuration Routes
 * API endpoints for application configuration
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
  getConfig,
  updateConfig,
  getProviderConfig,
  toggleOperationMode,
  getAppStatus,
  getAllSettings
} = require('../controllers/configController');

/**
 * @swagger
 * tags:
 *   name: Config
 *   description: Application configuration endpoints
 */

/**
 * @swagger
 * /config:
 *   get:
 *     summary: Get application configuration
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Application configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     config:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, authorize('admin'), getConfig);

/**
 * @swagger
 * /config:
 *   put:
 *     summary: Update application configuration
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pollInterval:
 *                 type: number
 *                 description: Polling interval in milliseconds
 *               watchDockerEvents:
 *                 type: boolean
 *                 description: Whether to watch Docker events
 *               cleanupOrphaned:
 *                 type: boolean
 *                 description: Whether to clean up orphaned records
 *               cleanupGracePeriod:
 *                 type: number
 *                 description: Grace period in minutes before deletion
 *               dnsDefaultType:
 *                 type: string
 *                 description: Default DNS record type
 *               dnsDefaultProxied:
 *                 type: boolean
 *                 description: Default Cloudflare proxy status
 *               dnsDefaultTTL:
 *                 type: number
 *                 description: Default TTL in seconds
 *               dnsDefaultManage:
 *                 type: boolean
 *                 description: Default DNS management mode
 *               apiTimeout:
 *                 type: number
 *                 description: API timeout in milliseconds
 *               dnsCacheRefreshInterval:
 *                 type: number
 *                 description: DNS cache refresh interval in milliseconds
 *               ipRefreshInterval:
 *                 type: number
 *                 description: IP refresh interval in milliseconds
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     updatedProperties:
 *                       type: array
 *                     requiresRestart:
 *                       type: boolean
 *       400:
 *         description: Invalid configuration data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.put('/', authenticate, authorize('admin'), updateConfig);

/**
 * @swagger
 * /config/provider:
 *   get:
 *     summary: Get DNS provider configuration
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: DNS provider configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     config:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/provider', authenticate, authorize('admin'), getProviderConfig);

/**
 * @swagger
 * /config/mode:
 *   put:
 *     summary: Toggle operation mode (traefik/direct)
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [traefik, direct]
 *                 description: Operation mode
 *     responses:
 *       200:
 *         description: Operation mode updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     previousMode:
 *                       type: string
 *                     currentMode:
 *                       type: string
 *                     requiresRestart:
 *                       type: boolean
 *       400:
 *         description: Invalid operation mode
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.put('/mode', authenticate, authorize('admin'), toggleOperationMode);

/**
 * @swagger
 * /config/status:
 *   get:
 *     summary: Get application status and metrics
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Application status and metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: object
 *                     metrics:
 *                       type: object
 *                     startTime:
 *                       type: string
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/status', authenticate, getAppStatus);

/**
 * @swagger
 * /config/settings:
 *   get:
 *     summary: Get all settings from database
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All settings from database
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                       description: Key-value pairs of all settings
 *                     count:
 *                       type: number
 *                       description: Number of settings
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/settings', authenticate, authorize('admin'), getAllSettings);

module.exports = router;