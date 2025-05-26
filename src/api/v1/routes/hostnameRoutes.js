/**
 * Hostname Routes
 * API endpoints for hostname management
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
  getManagedHostnames,
  addManagedHostname,
  deleteManagedHostname,
  getPreservedHostnames,
  addPreservedHostname,
  deletePreservedHostname,
  getOrphanedRecords,
  restoreOrphanedRecord,
  getOrphanedSettings,
  updateOrphanedSettings,
  getAllHostnames,
  createHostname,
  updateHostname,
  deleteHostname
} = require('../controllers/hostnameController');

// Main hostnames endpoints for UI
router.get('/', authenticate, getAllHostnames);
router.post('/', authenticate, authorize(['admin', 'operator']), createHostname);
router.put('/:id', authenticate, authorize(['admin', 'operator']), updateHostname);
router.delete('/:id', authenticate, authorize(['admin', 'operator']), deleteHostname);

/**
 * @swagger
 * tags:
 *   name: Hostnames
 *   description: Hostname management endpoints
 */

/**
 * @swagger
 * /hostnames/managed:
 *   get:
 *     summary: Get all manually managed hostnames
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of manually managed hostnames
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
 *                     managedHostnames:
 *                       type: array
 *                     count:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/managed', authenticate, authorize('admin'), getManagedHostnames);

/**
 * @swagger
 * /hostnames/managed:
 *   post:
 *     summary: Add a manually managed hostname
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hostname
 *               - type
 *               - content
 *             properties:
 *               hostname:
 *                 type: string
 *                 description: The hostname to manage
 *                 example: api.example.com
 *               type:
 *                 type: string
 *                 description: DNS record type
 *                 example: A
 *               content:
 *                 type: string
 *                 description: DNS record content
 *                 example: 192.168.1.10
 *               ttl:
 *                 type: number
 *                 description: Time-to-live in seconds
 *                 example: 3600
 *               proxied:
 *                 type: boolean
 *                 description: Whether to proxy through Cloudflare
 *                 example: false
 *     responses:
 *       201:
 *         description: Hostname added successfully
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
 *                     record:
 *                       type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/managed', authenticate, authorize('admin'), addManagedHostname);

/**
 * @swagger
 * /hostnames/managed/{hostname}:
 *   delete:
 *     summary: Delete a manually managed hostname
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hostname
 *         schema:
 *           type: string
 *         required: true
 *         description: The hostname to delete
 *     responses:
 *       200:
 *         description: Hostname deleted successfully
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
 *                     removed:
 *                       type: boolean
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Hostname not found
 *       500:
 *         description: Server error
 */
router.delete('/managed/:hostname', authenticate, authorize('admin'), deleteManagedHostname);

/**
 * @swagger
 * /hostnames/preserved:
 *   get:
 *     summary: Get all preserved hostnames
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of preserved hostnames
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
 *                     preservedHostnames:
 *                       type: array
 *                     count:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/preserved', authenticate, authorize('admin'), getPreservedHostnames);

/**
 * @swagger
 * /hostnames/preserved:
 *   post:
 *     summary: Add a preserved hostname
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hostname
 *             properties:
 *               hostname:
 *                 type: string
 *                 description: The hostname to preserve (can include wildcards)
 *                 example: *.admin.example.com
 *     responses:
 *       201:
 *         description: Hostname added to preserved list
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
 *                     preservedHostnames:
 *                       type: array
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/preserved', authenticate, authorize('admin'), addPreservedHostname);

/**
 * @swagger
 * /hostnames/preserved/{hostname}:
 *   delete:
 *     summary: Delete a preserved hostname
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hostname
 *         schema:
 *           type: string
 *         required: true
 *         description: The hostname to remove from preserved list
 *     responses:
 *       200:
 *         description: Hostname removed from preserved list
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
 *                     removed:
 *                       type: boolean
 *                     preservedHostnames:
 *                       type: array
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Hostname not found
 *       500:
 *         description: Server error
 */
router.delete('/preserved/:hostname', authenticate, authorize('admin'), deletePreservedHostname);

/**
 * @swagger
 * /hostnames/orphaned:
 *   get:
 *     summary: Get all orphaned records
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of orphaned records
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
 *                     orphanedRecords:
 *                       type: array
 *                     count:
 *                       type: number
 *                     cleanupEnabled:
 *                       type: boolean
 *                     gracePeriod:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/orphaned', authenticate, authorize('admin'), getOrphanedRecords);

/**
 * @swagger
 * /hostnames/orphaned/{id}/restore:
 *   post:
 *     summary: Restore an orphaned record
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The record ID to restore
 *     responses:
 *       200:
 *         description: Record restored successfully
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
 *                     record:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.post('/orphaned/:id/restore', authenticate, authorize('admin'), restoreOrphanedRecord);

/**
 * @swagger
 * /hostnames/orphaned/settings:
 *   put:
 *     summary: Update orphaned record cleanup settings
 *     tags: [Hostnames]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cleanupEnabled:
 *                 type: boolean
 *                 description: Whether to enable automatic cleanup
 *               gracePeriod:
 *                 type: number
 *                 description: Grace period in minutes before deletion
 *     responses:
 *       200:
 *         description: Settings updated successfully
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
 *                     settings:
 *                       type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/orphaned/settings', authenticate, getOrphanedSettings);
router.put('/orphaned/settings', authenticate, authorize('admin'), updateOrphanedSettings);

module.exports = router;