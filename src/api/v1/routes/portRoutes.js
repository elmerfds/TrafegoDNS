const express = require('express');
const PortController = require('../controllers/portController');
const { authenticate } = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');

/**
 * Port management routes
 */
function createPortRoutes(database, portMonitor) {
  const router = express.Router();
  const portController = new PortController(database, portMonitor);

  // Apply authentication middleware to all routes
  router.use(authenticate);

  // Apply rate limiting to scan operations
  const scanRateLimit = rateLimitMiddleware({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 scan requests per windowMs
    message: 'Too many scan requests from this IP, please try again later.'
  });

  /**
   * @swagger
   * /api/v1/ports:
   *   get:
   *     summary: Get all ports with optional filtering
   *     tags: [Ports]
   *     parameters:
   *       - in: query
   *         name: host
   *         schema:
   *           type: string
   *         description: Filter by host
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [open, closed, filtered]
   *         description: Filter by port status
   *       - in: query
   *         name: protocol
   *         schema:
   *           type: string
   *           enum: [tcp, udp]
   *         description: Filter by protocol
   *       - in: query
   *         name: container_id
   *         schema:
   *           type: string
   *         description: Filter by container ID
   *       - in: query
   *         name: service_name
   *         schema:
   *           type: string
   *         description: Filter by service name
   *       - in: query
   *         name: port_range
   *         schema:
   *           type: string
   *         description: Filter by port range (e.g., "80-443")
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Number of items per page
   *       - in: query
   *         name: sort_by
   *         schema:
   *           type: string
   *           default: host
   *         description: Field to sort by
   *       - in: query
   *         name: sort_order
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: asc
   *         description: Sort order
   *     responses:
   *       200:
   *         description: List of ports
   *       400:
   *         description: Invalid parameters
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/', portController.getAllPorts.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/statistics:
   *   get:
   *     summary: Get port monitoring statistics
   *     tags: [Ports]
   *     responses:
   *       200:
   *         description: Port statistics
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/statistics', portController.getPortStatistics.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/alerts:
   *   get:
   *     summary: Get port security alerts
   *     tags: [Ports]
   *     parameters:
   *       - in: query
   *         name: port_id
   *         schema:
   *           type: integer
   *         description: Filter by port ID
   *       - in: query
   *         name: alert_type
   *         schema:
   *           type: string
   *         description: Filter by alert type
   *       - in: query
   *         name: severity
   *         schema:
   *           type: string
   *           enum: [low, medium, high, critical]
   *         description: Filter by severity
   *       - in: query
   *         name: acknowledged
   *         schema:
   *           type: boolean
   *         description: Filter by acknowledgment status
   *       - in: query
   *         name: host
   *         schema:
   *           type: string
   *         description: Filter by host
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of items per page
   *     responses:
   *       200:
   *         description: List of alerts
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/alerts', portController.getPortAlerts.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/alerts/{alertId}/acknowledge:
   *   put:
   *     summary: Acknowledge a port alert
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: alertId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Alert ID
   *     responses:
   *       200:
   *         description: Alert acknowledged
   *       404:
   *         description: Alert not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.put('/alerts/:alertId/acknowledge', portController.acknowledgeAlert.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/alerts/acknowledge:
   *   put:
   *     summary: Acknowledge multiple port alerts
   *     tags: [Ports]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               alert_ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *             required:
   *               - alert_ids
   *     responses:
   *       200:
   *         description: Alerts acknowledged
   *       400:
   *         description: Invalid request body
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.put('/alerts/acknowledge', portController.acknowledgeMultipleAlerts.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/scan:
   *   post:
   *     summary: Trigger a port scan
   *     tags: [Ports]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               host:
   *                 type: string
   *                 description: Target host to scan
   *               port_range:
   *                 type: string
   *                 default: "1-65535"
   *                 description: Port range to scan (e.g., "80-443,8000-8080")
   *               protocols:
   *                 type: array
   *                 items:
   *                   type: string
   *                   enum: [tcp, udp]
   *                 default: ["tcp"]
   *                 description: Protocols to scan
   *               scan_type:
   *                 type: string
   *                 default: "manual"
   *                 description: Type of scan
   *             required:
   *               - host
   *     responses:
   *       200:
   *         description: Scan initiated
   *       400:
   *         description: Invalid parameters
   *       401:
   *         description: Unauthorized
   *       429:
   *         description: Rate limit exceeded
   *       500:
   *         description: Server error
   */
  router.post('/scan', scanRateLimit, portController.triggerScan.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/scans:
   *   get:
   *     summary: Get scan history
   *     tags: [Ports]
   *     parameters:
   *       - in: query
   *         name: host
   *         schema:
   *           type: string
   *         description: Filter by host
   *       - in: query
   *         name: scan_type
   *         schema:
   *           type: string
   *         description: Filter by scan type
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [running, completed, failed, cancelled]
   *         description: Filter by scan status
   *       - in: query
   *         name: created_by
   *         schema:
   *           type: string
   *         description: Filter by user who created the scan
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Number of items per page
   *     responses:
   *       200:
   *         description: Scan history
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/scans', portController.getScanHistory.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/scans/active:
   *   get:
   *     summary: Get active scans
   *     tags: [Ports]
   *     responses:
   *       200:
   *         description: List of active scans
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/scans/active', portController.getActiveScans.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/scans/{scanId}/cancel:
   *   put:
   *     summary: Cancel an active scan
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: scanId
   *         required: true
   *         schema:
   *           type: integer
   *         description: Scan ID
   *     responses:
   *       200:
   *         description: Scan cancelled
   *       404:
   *         description: Scan not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.put('/scans/:scanId/cancel', portController.cancelScan.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/export:
   *   get:
   *     summary: Export port data
   *     tags: [Ports]
   *     parameters:
   *       - in: query
   *         name: format
   *         schema:
   *           type: string
   *           enum: [json, csv]
   *           default: json
   *         description: Export format
   *       - in: query
   *         name: host
   *         schema:
   *           type: string
   *         description: Filter by host
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *         description: Filter by status
   *     responses:
   *       200:
   *         description: Exported data
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/export', portController.exportPorts.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/host/{host}:
   *   get:
   *     summary: Get ports for a specific host
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: host
   *         required: true
   *         schema:
   *           type: string
   *         description: Host to get ports for
   *     responses:
   *       200:
   *         description: List of ports for the host
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/host/:host', portController.getPortsByHost.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/container/{containerId}:
   *   get:
   *     summary: Get ports for a specific container
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: containerId
   *         required: true
   *         schema:
   *           type: string
   *         description: Container ID to get ports for
   *     responses:
   *       200:
   *         description: List of ports for the container
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/container/:containerId', portController.getPortsByContainer.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/{id}:
   *   get:
   *     summary: Get a specific port by ID
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Port ID
   *     responses:
   *       200:
   *         description: Port details
   *       404:
   *         description: Port not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.get('/:id', portController.getPortById.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/{id}:
   *   put:
   *     summary: Update port information
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Port ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               description:
   *                 type: string
   *                 description: Port description
   *               labels:
   *                 type: object
   *                 description: Custom labels for the port
   *               service_name:
   *                 type: string
   *                 description: Override detected service name
   *               service_version:
   *                 type: string
   *                 description: Override detected service version
   *     responses:
   *       200:
   *         description: Port updated
   *       400:
   *         description: Invalid request body
   *       404:
   *         description: Port not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.put('/:id', portController.updatePort.bind(portController));

  /**
   * @swagger
   * /api/v1/ports/{id}:
   *   delete:
   *     summary: Delete a port
   *     tags: [Ports]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Port ID
   *     responses:
   *       200:
   *         description: Port deleted
   *       404:
   *         description: Port not found
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Server error
   */
  router.delete('/:id', portController.deletePort.bind(portController));

  return router;
}

module.exports = createPortRoutes;