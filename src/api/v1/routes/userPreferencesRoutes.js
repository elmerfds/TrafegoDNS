/**
 * User Preferences Routes
 * Handles routes for user preferences including dashboard layouts
 */
const express = require('express');
const router = express.Router();
const userPreferencesController = require('../controllers/userPreferencesController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     Preference:
 *       type: object
 *       properties:
 *         key:
 *           type: string
 *         value:
 *           oneOf:
 *             - type: string
 *             - type: object
 *             - type: array
 *             - type: number
 *             - type: boolean
 *     DashboardLayout:
 *       type: object
 *       properties:
 *         lg:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               i:
 *                 type: string
 *               x:
 *                 type: number
 *               y:
 *                 type: number
 *               w:
 *                 type: number
 *               h:
 *                 type: number
 *         md:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DashboardLayout/properties/lg/items'
 *         sm:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DashboardLayout/properties/lg/items'
 */

/**
 * @swagger
 * /api/v1/user/preferences:
 *   get:
 *     summary: Get all preferences for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   additionalProperties: true
 */
router.get('/preferences', authenticate, userPreferencesController.getAllPreferences);

/**
 * @swagger
 * /api/v1/user/preferences/{key}:
 *   get:
 *     summary: Get a specific preference for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Preference key
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Preference'
 *       404:
 *         description: Preference not found
 */
router.get('/preferences/:key', authenticate, userPreferencesController.getPreference);

/**
 * @swagger
 * /api/v1/user/preferences/{key}:
 *   put:
 *     summary: Set a preference for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Preference key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 description: Preference value
 *             required:
 *               - value
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     value:
 *                       description: The saved value
 *                     updated:
 *                       type: boolean
 */
router.put('/preferences/:key', authenticate, userPreferencesController.setPreference);

/**
 * @swagger
 * /api/v1/user/preferences/{key}:
 *   delete:
 *     summary: Delete a preference for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Preference key
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Preference not found
 */
router.delete('/preferences/:key', authenticate, userPreferencesController.deletePreference);

/**
 * @swagger
 * /api/v1/user/dashboard-layout:
 *   get:
 *     summary: Get dashboard layout for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/DashboardLayout'
 *                     - type: 'null'
 */
router.get('/dashboard-layout', authenticate, userPreferencesController.getDashboardLayout);

/**
 * @swagger
 * /api/v1/user/dashboard-layout:
 *   put:
 *     summary: Set dashboard layout for the authenticated user
 *     tags: [User Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               layout:
 *                 $ref: '#/components/schemas/DashboardLayout'
 *             required:
 *               - layout
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     layout:
 *                       $ref: '#/components/schemas/DashboardLayout'
 *                     updated:
 *                       type: boolean
 *       400:
 *         description: Invalid layout format
 */
router.put('/dashboard-layout', authenticate, userPreferencesController.setDashboardLayout);

module.exports = router;