/**
 * Dashboard Layouts Routes
 * Handles routes for multiple saved dashboard layouts
 */
const express = require('express');
const router = express.Router();
const dashboardLayoutsController = require('../controllers/dashboardLayoutsController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
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
 *     SavedLayout:
 *       type: object
 *       properties:
 *         id:
 *           type: number
 *         user_id:
 *           type: number
 *         name:
 *           type: string
 *         layout:
 *           $ref: '#/components/schemas/DashboardLayout'
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/v1/user/dashboard-layouts:
 *   get:
 *     summary: List all saved layouts for the authenticated user
 *     tags: [Dashboard Layouts]
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SavedLayout'
 */
router.get('/', authenticate, dashboardLayoutsController.listLayouts);

/**
 * @swagger
 * /api/v1/user/dashboard-layouts/active:
 *   get:
 *     summary: Get the active layout for the authenticated user
 *     tags: [Dashboard Layouts]
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
 *                     - $ref: '#/components/schemas/SavedLayout'
 *                     - type: 'null'
 */
router.get('/active', authenticate, dashboardLayoutsController.getActiveLayout);

/**
 * @swagger
 * /api/v1/user/dashboard-layouts/{name}:
 *   get:
 *     summary: Get a specific layout for the authenticated user
 *     tags: [Dashboard Layouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Layout name
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
 *                   $ref: '#/components/schemas/SavedLayout'
 *       404:
 *         description: Layout not found
 */
router.get('/:name', authenticate, dashboardLayoutsController.getLayout);

/**
 * @swagger
 * /api/v1/user/dashboard-layouts/{name}:
 *   put:
 *     summary: Save or update a named layout for the authenticated user
 *     tags: [Dashboard Layouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Layout name
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
 *                   $ref: '#/components/schemas/SavedLayout'
 *       400:
 *         description: Invalid layout format or name
 */
router.put('/:name', authenticate, dashboardLayoutsController.saveLayout);

/**
 * @swagger
 * /api/v1/user/dashboard-layouts/{name}:
 *   delete:
 *     summary: Delete a layout for the authenticated user
 *     tags: [Dashboard Layouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Layout name
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
 *         description: Layout not found
 */
router.delete('/:name', authenticate, dashboardLayoutsController.deleteLayout);

/**
 * @swagger
 * /api/v1/user/dashboard-layouts/{name}/set-active:
 *   put:
 *     summary: Set a layout as active/default for the authenticated user
 *     tags: [Dashboard Layouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Layout name
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
 *         description: Layout not found
 */
router.put('/:name/set-active', authenticate, dashboardLayoutsController.setActiveLayout);

module.exports = router;