/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const {
  login,
  refreshToken,
  logout,
  getProfile
} = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

/**
 * @swagger
 * /auth/login:
 *  post:
 *    summary: Authenticate a user
 *    tags: [Authentication]
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - username
 *              - password
 *            properties:
 *              username:
 *                type: string
 *              password:
 *                type: string
 *    responses:
 *      200:
 *        description: User authenticated successfully
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
 *                    user:
 *                      type: object
 *                      properties:
 *                        id:
 *                          type: string
 *                        username:
 *                          type: string
 *                        role:
 *                          type: string
 *                    accessToken:
 *                      type: string
 *      400:
 *        description: Missing credentials
 *      401:
 *        description: Invalid credentials
 */
router.post('/login', login);

/**
 * @swagger
 * /auth/refresh:
 *  post:
 *    summary: Refresh authentication token
 *    tags: [Authentication]
 *    responses:
 *      200:
 *        description: Token refreshed successfully
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
 *                    accessToken:
 *                      type: string
 *      401:
 *        description: Invalid or expired refresh token
 */
router.post('/refresh', refreshToken);

/**
 * @swagger
 * /auth/logout:
 *  post:
 *    summary: Logout user
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: User logged out successfully
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
 *                  example: Logged out successfully
 *      401:
 *        description: Not authenticated
 */
router.post('/logout', authenticate, logout);

/**
 * @swagger
 * /auth/me:
 *  get:
 *    summary: Get current user profile
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: User profile retrieved successfully
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
 *                    username:
 *                      type: string
 *                    role:
 *                      type: string
 *                    createdAt:
 *                      type: string
 *                      format: date-time
 *                    lastLogin:
 *                      type: string
 *                      format: date-time
 *      401:
 *        description: Not authenticated
 *      404:
 *        description: User not found
 */
router.get('/me', authenticate, getProfile);

module.exports = router;