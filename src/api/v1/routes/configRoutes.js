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
  getAllSettings,
  updateSecrets,
  testSecrets,
  getSecrets,
  getSecretStatus
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

/**
 * @swagger
 * /config/secrets:
 *   get:
 *     summary: Get decrypted secrets for viewing (admin only)
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Decrypted secrets
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
 *                     secrets:
 *                       type: object
 *                       properties:
 *                         cloudflareToken:
 *                           type: string
 *                         route53AccessKey:
 *                           type: string
 *                         route53SecretKey:
 *                           type: string
 *                         digitalOceanToken:
 *                           type: string
 *                         traefikApiPassword:
 *                           type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       500:
 *         description: Server error
 *   put:
 *     summary: Update secrets (admin only)
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
 *               cloudflareToken:
 *                 type: string
 *                 description: Cloudflare API token
 *               route53AccessKey:
 *                 type: string
 *                 description: AWS Access Key ID for Route53
 *               route53SecretKey:
 *                 type: string
 *                 description: AWS Secret Access Key for Route53
 *               digitalOceanToken:
 *                 type: string
 *                 description: DigitalOcean API token
 *               traefikApiPassword:
 *                 type: string
 *                 description: Traefik API password
 *     responses:
 *       200:
 *         description: Secrets updated successfully
 *       400:
 *         description: Invalid secrets data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       500:
 *         description: Server error
 */
router.get('/secrets', authenticate, authorize('admin'), getSecrets);
router.put('/secrets', authenticate, authorize('admin'), updateSecrets);

/**
 * @swagger
 * /config/secrets/test:
 *   post:
 *     summary: Test secret validation (admin only)
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
 *               - provider
 *               - secrets
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [cloudflare, route53, digitalocean]
 *                 description: DNS provider to test
 *               secrets:
 *                 type: object
 *                 description: Secrets to test
 *     responses:
 *       200:
 *         description: Test results (success or failure)
 *       400:
 *         description: Invalid test data
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       500:
 *         description: Server error
 */
router.post('/secrets/test', authenticate, authorize('admin'), testSecrets);

/**
 * @swagger
 * /config/secrets/status:
 *   get:
 *     summary: Get secret status (which secrets are set)
 *     tags: [Config]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Secret status information
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
 *                     secrets:
 *                       type: object
 *                       properties:
 *                         hasCloudflareToken:
 *                           type: boolean
 *                         hasRoute53AccessKey:
 *                           type: boolean
 *                         hasRoute53SecretKey:
 *                           type: boolean
 *                         hasDigitalOceanToken:
 *                           type: boolean
 *                         hasTraefikApiPassword:
 *                           type: boolean
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       500:
 *         description: Server error
 */
router.get('/secrets/status', authenticate, authorize('admin'), getSecretStatus);

module.exports = router;