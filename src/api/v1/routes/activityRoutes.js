/**
 * Activity routes
 */
const express = require('express');
const router = express.Router();
const {
  getRecentActivity
} = require('../controllers/activityController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /activity/recent:
 *  get:
 *    summary: Get recent activity feed
 *    tags: [Activity]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: query
 *        name: limit
 *        schema:
 *          type: integer
 *          minimum: 1
 *          maximum: 100
 *          default: 20
 *        description: Maximum number of activities to return
 *    responses:
 *      200:
 *        description: Recent activities retrieved successfully
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
 *                    activities:
 *                      type: array
 *                      items:
 *                        type: object
 *                        properties:
 *                          id:
 *                            type: string
 *                          type:
 *                            type: string
 *                            enum: [created, updated, deleted, managed, tracked]
 *                          recordType:
 *                            type: string
 *                          hostname:
 *                            type: string
 *                          timestamp:
 *                            type: string
 *                            format: date-time
 *                          details:
 *                            type: string
 *                          source:
 *                            type: string
 *                    totalReturned:
 *                      type: number
 *                    limit:
 *                      type: number
 *      401:
 *        description: Not authenticated
 *      500:
 *        description: Server error
 */
router.get('/recent', authenticate, getRecentActivity);

module.exports = router;