/**
 * Container Routes
 * API endpoints for container management
 */
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
  getContainers,
  getContainer,
  getContainerLabels,
  getContainerHostnames,
  getContainersByComposeProject,
  getDockerStatus
} = require('../controllers/containerController');

/**
 * @swagger
 * tags:
 *   name: Containers
 *   description: Container management endpoints
 */

/**
 * @swagger
 * /containers/status:
 *   get:
 *     summary: Get Docker monitor status
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Docker monitor status information
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
 *                     connection:
 *                       type: object
 *                     containers:
 *                       type: object
 *                     labels:
 *                       type: object
 *                     monitoring:
 *                       type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/status', authenticate, getDockerStatus);

/**
 * @swagger
 * /containers:
 *   get:
 *     summary: Get all containers
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: onlyRunning
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter to only running containers (default true)
 *       - in: query
 *         name: withLabels
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter to only containers with labels (default false)
 *       - in: query
 *         name: labelPrefix
 *         schema:
 *           type: string
 *         description: Filter containers by label prefix (e.g. traefik.)
 *     responses:
 *       200:
 *         description: List of containers
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
 *                     containers:
 *                       type: array
 *                     total:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, getContainers);

/**
 * @swagger
 * /containers/{id}:
 *   get:
 *     summary: Get a specific container
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Container ID or name
 *     responses:
 *       200:
 *         description: Container details
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
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Container not found
 *       500:
 *         description: Server error
 */
router.get('/:id', authenticate, getContainer);

/**
 * @swagger
 * /containers/{id}/labels:
 *   get:
 *     summary: Get container labels
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Container ID or name
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: Filter labels by prefix
 *     responses:
 *       200:
 *         description: Container labels
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
 *                     id:
 *                       type: string
 *                     labels:
 *                       type: object
 *                     count:
 *                       type: number
 *                     filter:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Container not found
 *       500:
 *         description: Server error
 */
router.get('/:id/labels', authenticate, getContainerLabels);

/**
 * @swagger
 * /containers/{id}/hostnames:
 *   get:
 *     summary: Get container hostnames (DNS records)
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Container ID or name
 *     responses:
 *       200:
 *         description: Container hostnames and DNS records
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
 *                     id:
 *                       type: string
 *                     hostnames:
 *                       type: array
 *                     records:
 *                       type: array
 *                     count:
 *                       type: number
 *                     recordCount:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Container not found
 *       500:
 *         description: Server error
 */
router.get('/:id/hostnames', authenticate, getContainerHostnames);

/**
 * @swagger
 * /containers/compose/{project}:
 *   get:
 *     summary: Get containers by compose project
 *     tags: [Containers]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: project
 *         schema:
 *           type: string
 *         required: true
 *         description: Docker Compose project name
 *     responses:
 *       200:
 *         description: Containers grouped by service
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
 *                     project:
 *                       type: string
 *                     services:
 *                       type: object
 *                     containerCount:
 *                       type: number
 *                     serviceCount:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Compose project not found
 *       500:
 *         description: Server error
 */
router.get('/compose/:project', authenticate, getContainersByComposeProject);

module.exports = router;