/**
 * Port Routes
 * API routes for port monitoring and management
 */
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authMiddleware');
const {
  checkPortAvailability,
  reservePorts,
  releasePorts,
  suggestAlternativePorts,
  validateDeployment,
  getPortStatistics,
  getPortReservations,
  getPortRecommendations,
  scanPortRange
} = require('../controllers/portController');

/**
 * @swagger
 * components:
 *   schemas:
 *     PortAvailabilityRequest:
 *       type: object
 *       required:
 *         - ports
 *       properties:
 *         ports:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 65535
 *           description: Array of ports to check
 *         protocol:
 *           type: string
 *           enum: [tcp, udp]
 *           default: tcp
 *           description: Protocol to check
 *     
 *     PortReservationRequest:
 *       type: object
 *       required:
 *         - ports
 *         - containerId
 *       properties:
 *         ports:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 65535
 *           description: Array of ports to reserve
 *         containerId:
 *           type: string
 *           description: Container ID for the reservation
 *         protocol:
 *           type: string
 *           enum: [tcp, udp]
 *           default: tcp
 *           description: Protocol for the reservation
 *         duration:
 *           type: integer
 *           minimum: 60
 *           maximum: 86400
 *           default: 3600
 *           description: Reservation duration in seconds
 *         metadata:
 *           type: object
 *           description: Additional metadata for the reservation
 *     
 *     PortSuggestionRequest:
 *       type: object
 *       required:
 *         - ports
 *       properties:
 *         ports:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 65535
 *           description: Array of originally requested ports
 *         protocol:
 *           type: string
 *           enum: [tcp, udp]
 *           default: tcp
 *           description: Protocol for suggestions
 *         serviceType:
 *           type: string
 *           enum: [web, api, database, cache, monitoring, development, custom]
 *           description: Type of service for better suggestions
 *         maxSuggestions:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *           description: Maximum number of suggestions per port
 *         nearbyRange:
 *           type: integer
 *           minimum: 10
 *           maximum: 1000
 *           default: 100
 *           description: Range to search for nearby alternatives
 *         preferSequential:
 *           type: boolean
 *           default: true
 *           description: Prefer sequential port suggestions
 *     
 *     DeploymentConfig:
 *       type: object
 *       properties:
 *         ports:
 *           type: array
 *           items:
 *             type: integer
 *             minimum: 1
 *             maximum: 65535
 *           description: Ports used in deployment
 *         containerId:
 *           type: string
 *           description: Container ID for deployment
 *         protocol:
 *           type: string
 *           enum: [tcp, udp]
 *           default: tcp
 *           description: Protocol used
 *         containerName:
 *           type: string
 *           description: Container name
 *         serviceType:
 *           type: string
 *           description: Type of service being deployed
 *     
 *     PortScanRequest:
 *       type: object
 *       required:
 *         - startPort
 *         - endPort
 *       properties:
 *         startPort:
 *           type: integer
 *           minimum: 1
 *           maximum: 65535
 *           description: Start of port range to scan
 *         endPort:
 *           type: integer
 *           minimum: 1
 *           maximum: 65535
 *           description: End of port range to scan
 *         protocol:
 *           type: string
 *           enum: [tcp, udp]
 *           default: tcp
 *           description: Protocol to scan
 */

/**
 * @swagger
 * /api/v1/ports/check-availability:
 *   post:
 *     summary: Check port availability
 *     description: Check if specific ports are available on the system
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PortAvailabilityRequest'
 *     responses:
 *       200:
 *         description: Port availability results
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
 *                     ports:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           port:
 *                             type: integer
 *                           available:
 *                             type: boolean
 *                           reserved:
 *                             type: boolean
 *                           reservedBy:
 *                             type: string
 *                           protocol:
 *                             type: string
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/check-availability', authenticate, checkPortAvailability);

/**
 * @swagger
 * /api/v1/ports/reserve:
 *   post:
 *     summary: Reserve ports for a container
 *     description: Create port reservations for a specific container
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PortReservationRequest'
 *     responses:
 *       201:
 *         description: Ports reserved successfully
 *       409:
 *         description: Port conflicts detected with suggestions
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/reserve', authenticate, reservePorts);

/**
 * @swagger
 * /api/v1/ports/reserve:
 *   delete:
 *     summary: Release port reservations
 *     description: Release port reservations for a specific container
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ports
 *               - containerId
 *             properties:
 *               ports:
 *                 type: array
 *                 items:
 *                   type: integer
 *               containerId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ports released successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.delete('/reserve', authenticate, releasePorts);

/**
 * @swagger
 * /api/v1/ports/suggest-alternatives:
 *   post:
 *     summary: Suggest alternative ports
 *     description: Get alternative port suggestions when conflicts are detected
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PortSuggestionRequest'
 *     responses:
 *       200:
 *         description: Port suggestions generated
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/suggest-alternatives', authenticate, suggestAlternativePorts);

/**
 * @swagger
 * /api/v1/ports/validate-deployment:
 *   post:
 *     summary: Validate deployment configuration
 *     description: Validate a deployment configuration for port conflicts
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeploymentConfig'
 *     responses:
 *       200:
 *         description: Deployment is valid
 *       409:
 *         description: Deployment has conflicts
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/validate-deployment', authenticate, validateDeployment);

/**
 * @swagger
 * /api/v1/ports/statistics:
 *   get:
 *     summary: Get port monitoring statistics
 *     description: Retrieve comprehensive port monitoring statistics
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Port statistics retrieved
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
 *                     totalMonitoredPorts:
 *                       type: integer
 *                     activeReservations:
 *                       type: integer
 *                     availablePortsInRange:
 *                       type: integer
 *                     conflictsDetected:
 *                       type: integer
 *                     lastScanTime:
 *                       type: string
 *                     monitoringEnabled:
 *                       type: boolean
 *       500:
 *         description: Server error
 */
router.get('/statistics', authenticate, getPortStatistics);

/**
 * @swagger
 * /api/v1/ports/reservations:
 *   get:
 *     summary: Get active port reservations
 *     description: Retrieve active port reservations, optionally filtered by container or ports
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: containerId
 *         schema:
 *           type: string
 *         description: Filter by container ID
 *       - in: query
 *         name: ports
 *         schema:
 *           type: string
 *         description: Comma-separated list of ports to filter by
 *     responses:
 *       200:
 *         description: Port reservations retrieved
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get('/reservations', authenticate, getPortReservations);

/**
 * @swagger
 * /api/v1/ports/recommendations:
 *   post:
 *     summary: Get port recommendations
 *     description: Get comprehensive port recommendations for a deployment
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestedPorts:
 *                 type: array
 *                 items:
 *                   type: integer
 *               serviceType:
 *                 type: string
 *               protocol:
 *                 type: string
 *               preferredRange:
 *                 type: object
 *                 properties:
 *                   start:
 *                     type: integer
 *                   end:
 *                     type: integer
 *               containerName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Port recommendations generated
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/recommendations', authenticate, getPortRecommendations);

/**
 * @swagger
 * /api/v1/ports/scan-range:
 *   post:
 *     summary: Scan port range for availability
 *     description: Scan a range of ports to check availability
 *     tags: [Ports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PortScanRequest'
 *     responses:
 *       200:
 *         description: Port scan completed
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
 *                     results:
 *                       type: object
 *                       additionalProperties:
 *                         type: boolean
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalPorts:
 *                           type: integer
 *                         availablePorts:
 *                           type: integer
 *                         unavailablePorts:
 *                           type: integer
 *                         availabilityPercentage:
 *                           type: integer
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
router.post('/scan-range', authenticate, scanPortRange);

module.exports = router;