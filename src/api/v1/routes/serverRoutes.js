/**
 * Server Routes
 * Handles server management endpoints
 */
const express = require('express');
const {
  getServers,
  createServer,
  updateServer,
  deleteServer,
  testServerConnectivity
} = require('../controllers/serverController');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Server:
 *       type: object
 *       required:
 *         - id
 *         - name
 *         - ip
 *       properties:
 *         id:
 *           type: string
 *           description: Server unique identifier
 *         name:
 *           type: string
 *           description: Server display name
 *         ip:
 *           type: string
 *           description: Server IP address or hostname
 *         description:
 *           type: string
 *           description: Optional server description
 *         isHost:
 *           type: boolean
 *           description: Whether this is the host server
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Server creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Server last update timestamp
 */

/**
 * @swagger
 * /api/v1/servers:
 *   get:
 *     summary: Get all configured servers
 *     tags: [Servers]
 *     responses:
 *       200:
 *         description: List of servers retrieved successfully
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
 *                     servers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Server'
 */
router.get('/', getServers);

/**
 * @swagger
 * /api/v1/servers:
 *   post:
 *     summary: Create a new server
 *     tags: [Servers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - ip
 *             properties:
 *               name:
 *                 type: string
 *                 description: Server display name
 *               ip:
 *                 type: string
 *                 description: Server IP address or hostname
 *               description:
 *                 type: string
 *                 description: Optional server description
 *     responses:
 *       201:
 *         description: Server created successfully
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
 *                     server:
 *                       $ref: '#/components/schemas/Server'
 *                 message:
 *                   type: string
 */
router.post('/', createServer);

/**
 * @swagger
 * /api/v1/servers/test:
 *   post:
 *     summary: Test server connectivity
 *     tags: [Servers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ip
 *             properties:
 *               ip:
 *                 type: string
 *                 description: Server IP address to test
 *               ports:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: List of ports to test (default: [22, 80, 443])
 *     responses:
 *       200:
 *         description: Connectivity test completed
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
 *                     ip:
 *                       type: string
 *                     isReachable:
 *                       type: boolean
 *                     reachablePorts:
 *                       type: integer
 *                     totalPorts:
 *                       type: integer
 *                     results:
 *                       type: object
 */
router.post('/test', testServerConnectivity);

/**
 * @swagger
 * /api/v1/servers/{id}:
 *   put:
 *     summary: Update a server
 *     tags: [Servers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Server ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - ip
 *             properties:
 *               name:
 *                 type: string
 *               ip:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Server updated successfully
 */
router.put('/:id', updateServer);

/**
 * @swagger
 * /api/v1/servers/{id}:
 *   delete:
 *     summary: Delete a server
 *     tags: [Servers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Server ID
 *     responses:
 *       200:
 *         description: Server deleted successfully
 */
router.delete('/:id', deleteServer);

module.exports = router;