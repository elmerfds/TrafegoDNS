/**
 * DNS routes
 */
const express = require('express');
const router = express.Router();
const {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getOrphanedRecords,
  runCleanup
} = require('../controllers/dnsController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { writeLimiter } = require('../middleware/rateLimitMiddleware');

/**
 * @swagger
 * /dns/records:
 *  get:
 *    summary: Get all DNS records
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: query
 *        name: page
 *        schema:
 *          type: integer
 *          minimum: 1
 *          default: 1
 *        description: Page number for pagination
 *      - in: query
 *        name: limit
 *        schema:
 *          type: integer
 *          minimum: 1
 *          maximum: 100
 *          default: 10
 *        description: Number of records per page
 *      - in: query
 *        name: type
 *        schema:
 *          type: string
 *        description: Filter by record type (e.g., A, CNAME)
 *      - in: query
 *        name: name
 *        schema:
 *          type: string
 *        description: Filter by record name (substring match)
 *      - in: query
 *        name: managed
 *        schema:
 *          type: string
 *          enum: [true, false]
 *        description: Filter by managed status
 *    responses:
 *      200:
 *        description: Paginated list of DNS records
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                data:
 *                  type: array
 *                  items:
 *                    type: object
 *                    properties:
 *                      id:
 *                        type: string
 *                      type:
 *                        type: string
 *                      name:
 *                        type: string
 *                      content:
 *                            type: string
 *                          ttl:
 *                            type: number
 *                          proxied:
 *                            type: boolean
 *                          managed:
 *                            type: boolean
 *                    provider:
 *                      type: string
 *                    domain:
 *                      type: string
 *      401:
 *        description: Not authenticated
 *      500:
 *        description: Server error
 */
router.get('/records', authenticate, getRecords);

/**
 * @swagger
 * /dns/records/{id}:
 *  get:
 *    summary: Get a single DNS record
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *        description: Record ID
 *    responses:
 *      200:
 *        description: DNS record details
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                data:
 *                  type: object
 *                  properties:
 *                    id:
 *                      type: string
 *                    type:
 *                      type: string
 *                    name:
 *                      type: string
 *                    content:
 *                      type: string
 *                    ttl:
 *                      type: number
 *                    proxied:
 *                      type: boolean
 *                    managed:
 *                      type: boolean
 *      401:
 *        description: Not authenticated
 *      404:
 *        description: Record not found
 *      500:
 *        description: Server error
 */
router.get('/records/:id', authenticate, getRecord);

/**
 * @swagger
 * /dns/records:
 *  post:
 *    summary: Create a new DNS record
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - type
 *              - name
 *              - content
 *            properties:
 *              type:
 *                type: string
 *                example: A
 *              name:
 *                type: string
 *                example: api.example.com
 *              content:
 *                type: string
 *                example: 192.168.1.10
 *              ttl:
 *                type: number
 *                example: 3600
 *              proxied:
 *                type: boolean
 *                example: false
 *              priority:
 *                type: number
 *                example: 10
 *              weight:
 *                type: number
 *                example: 100
 *              port:
 *                type: number
 *                example: 443
 *              flags:
 *                type: number
 *                example: 0
 *              tag:
 *                type: string
 *                example: issue
 *    responses:
 *      201:
 *        description: Record created successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                message:
 *                  type: string
 *                data:
 *                  type: object
 *      400:
 *        description: Invalid input
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      500:
 *        description: Server error
 */
router.post('/records', authenticate, authorize(['admin', 'operator']), writeLimiter, createRecord);

/**
 * @swagger
 * /dns/records/{id}:
 *  put:
 *    summary: Update a DNS record
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *        description: Record ID
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              content:
 *                type: string
 *              ttl:
 *                type: number
 *              proxied:
 *                type: boolean
 *              priority:
 *                type: number
 *              weight:
 *                type: number
 *              port:
 *                type: number
 *              flags:
 *                type: number
 *              tag:
 *                type: string
 *    responses:
 *      200:
 *        description: Record updated successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                message:
 *                  type: string
 *                data:
 *                  type: object
 *      400:
 *        description: Invalid input
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      404:
 *        description: Record not found
 *      500:
 *        description: Server error
 */
router.put('/records/:id', authenticate, authorize(['admin', 'operator']), writeLimiter, updateRecord);

/**
 * @swagger
 * /dns/records/{id}:
 *  delete:
 *    summary: Delete a DNS record
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *        description: Record ID
 *    responses:
 *      200:
 *        description: Record deleted successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                message:
 *                  type: string
 *                data:
 *                  type: object
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      404:
 *        description: Record not found
 *      500:
 *        description: Server error
 */
router.delete('/records/:id', authenticate, authorize(['admin', 'operator']), writeLimiter, deleteRecord);

/**
 * @swagger
 * /dns/orphaned:
 *  get:
 *    summary: Get orphaned DNS records
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: List of orphaned DNS records
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                data:
 *                  type: object
 *                  properties:
 *                    records:
 *                      type: array
 *                      items:
 *                        type: object
 *                    count:
 *                      type: number
 *                    gracePeriod:
 *                      type: number
 *                    cleanupEnabled:
 *                      type: boolean
 *      401:
 *        description: Not authenticated
 *      500:
 *        description: Server error
 */
router.get('/orphaned', authenticate, getOrphanedRecords);

/**
 * @swagger
 * /dns/cleanup:
 *  post:
 *    summary: Run orphaned records cleanup
 *    tags: [DNS]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Cleanup completed
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status:
 *                  type: string
 *                  example: success
 *                message:
 *                  type: string
 *                data:
 *                  type: object
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      500:
 *        description: Server error
 */
router.post('/cleanup', authenticate, authorize(['admin', 'operator']), runCleanup);

module.exports = router;