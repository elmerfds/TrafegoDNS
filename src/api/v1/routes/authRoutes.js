/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const {
  login,
  register,
  refreshToken,
  logout,
  getProfile,
  getUsers,
  updateUser,
  deleteUser,
  oidcAuthorize,
  oidcCallback,
  oidcStatus,
  updateThemePreference,
  getThemePreference
} = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and management
 */

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
 *                    expiresIn:
 *                      type: number
 *      400:
 *        description: Missing credentials
 *      401:
 *        description: Invalid credentials
 *      429:
 *        description: Too many login attempts
 */
router.post('/login', authLimiter, login);

/**
 * @swagger
 * /auth/register:
 *  post:
 *    summary: Register a new user
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
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
 *                description: Username (3-30 characters, letters, numbers, underscores)
 *              password:
 *                type: string
 *                description: Password (min 8 characters)
 *              role:
 *                type: string
 *                enum: [admin, operator, viewer]
 *                description: User role (admin users can only be created by admins)
 *    responses:
 *      201:
 *        description: User created successfully
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
 *      400:
 *        description: Invalid input data
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.post('/register', authenticate, authorize('admin'), register);

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
 *                    expiresIn:
 *                      type: number
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

/**
 * @swagger
 * /auth/users:
 *  get:
 *    summary: Get all users
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Users retrieved successfully
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
 *                    users:
 *                      type: array
 *                      items:
 *                        type: object
 *                        properties:
 *                          id:
 *                            type: string
 *                          username:
 *                            type: string
 *                          role:
 *                            type: string
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 */
router.get('/users', authenticate, authorize('admin'), getUsers);

/**
 * @swagger
 * /auth/users/{id}:
 *  put:
 *    summary: Update a user
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *        description: User ID
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              username:
 *                type: string
 *              password:
 *                type: string
 *              role:
 *                type: string
 *                enum: [admin, operator, viewer]
 *    responses:
 *      200:
 *        description: User updated successfully
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
 *      400:
 *        description: Invalid input data or cannot demote last admin
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      404:
 *        description: User not found
 */
router.put('/users/:id', authenticate, authorize('admin'), updateUser);

/**
 * @swagger
 * /auth/users/{id}:
 *  delete:
 *    summary: Delete a user
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *        description: User ID
 *    responses:
 *      200:
 *        description: User deleted successfully
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
 *      400:
 *        description: Cannot delete own account or last admin
 *      401:
 *        description: Not authenticated
 *      403:
 *        description: Insufficient permissions
 *      404:
 *        description: User not found
 */
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

/**
 * @swagger
 * /auth/oidc/status:
 *  get:
 *    summary: Get OIDC configuration status
 *    tags: [Authentication]
 *    responses:
 *      200:
 *        description: OIDC status retrieved successfully
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
 *                    enabled:
 *                      type: boolean
 *                    configured:
 *                      type: boolean
 *                    issuer:
 *                      type: string
 *                    metadata:
 *                      type: object
 */
router.get('/oidc/status', oidcStatus);

/**
 * @swagger
 * /auth/oidc/authorize:
 *  get:
 *    summary: Get OIDC authorization URL
 *    tags: [Authentication]
 *    responses:
 *      200:
 *        description: Authorization URL generated successfully
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
 *                    authUrl:
 *                      type: string
 *                    state:
 *                      type: string
 *      404:
 *        description: OIDC not enabled
 *      500:
 *        description: Failed to initialize OIDC
 */
router.get('/oidc/authorize', oidcAuthorize);

/**
 * @swagger
 * /auth/oidc/callback:
 *  get:
 *    summary: Handle OIDC callback
 *    tags: [Authentication]
 *    parameters:
 *      - in: query
 *        name: code
 *        schema:
 *          type: string
 *        required: true
 *        description: Authorization code
 *      - in: query
 *        name: state
 *        schema:
 *          type: string
 *        required: true
 *        description: State parameter
 *    responses:
 *      302:
 *        description: Redirect to frontend with token
 *      400:
 *        description: Invalid callback parameters
 */
router.get('/oidc/callback', oidcCallback);

/**
 * @swagger
 * /auth/theme:
 *  get:
 *    summary: Get user theme preference
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    responses:
 *      200:
 *        description: Theme preference retrieved successfully
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
 *                    theme:
 *                      type: string
 *                      example: teal
 *                    availableThemes:
 *                      type: array
 *                      items:
 *                        type: string
 *                      example: [teal, gold, blue, purple]
 *      401:
 *        description: Not authenticated
 */
router.get('/theme', authenticate, getThemePreference);

/**
 * @swagger
 * /auth/theme:
 *  put:
 *    summary: Update user theme preference
 *    tags: [Authentication]
 *    security:
 *      - BearerAuth: []
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            required:
 *              - theme
 *            properties:
 *              theme:
 *                type: string
 *                enum: [teal, gold, blue, purple]
 *                description: Theme ID
 *    responses:
 *      200:
 *        description: Theme preference updated successfully
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
 *                    theme:
 *                      type: string
 *                      example: teal
 *                    message:
 *                      type: string
 *                      example: Theme preference updated successfully
 *      400:
 *        description: Invalid theme
 *      401:
 *        description: Not authenticated
 */
router.put('/theme', authenticate, updateThemePreference);

module.exports = router;