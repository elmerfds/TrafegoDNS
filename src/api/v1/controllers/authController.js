/**
 * Authentication controller
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');
const User = require('../models/User');
const jwtService = require('../services/jwtService');

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  
  // Check if username and password are provided
  if (!username || !password) {
    throw new ApiError('Username and password are required', 400, 'MISSING_CREDENTIALS');
  }
  
  // Verify credentials
  const user = await User.verifyCredentials(username, password);
  
  // Check if user exists and password is correct
  if (!user) {
    logger.warn(`Failed login attempt for username: ${username}`);
    throw new ApiError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  
  // Generate JWT
  const { accessToken, refreshToken, expiresIn } = jwtService.generateTokens(user);
  
  // Update last login
  await User.update(user.id, {
    last_login: new Date().toISOString()
  });
  
  // Set refresh token as cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  
  logger.info(`User ${username} logged in successfully`);
  
  // Send response with access token
  res.json({
    status: 'success',
    data: {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      accessToken,
      expiresIn
    }
  });
});

/**
 * @desc    Register a new user
 * @route   POST /api/v1/auth/register
 * @access  Private/Admin
 */
const register = asyncHandler(async (req, res) => {
  const { username, password, role } = req.body;
  
  // Validate input
  if (!username || !password) {
    throw new ApiError('Username and password are required', 400, 'VALIDATION_ERROR');
  }
  
  // Username validation
  if (username.length < 3 || username.length > 30) {
    throw new ApiError('Username must be between 3 and 30 characters', 400, 'VALIDATION_ERROR');
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new ApiError('Username can only contain letters, numbers, and underscores', 400, 'VALIDATION_ERROR');
  }
  
  // Password validation
  if (password.length < 8) {
    throw new ApiError('Password must be at least 8 characters long', 400, 'VALIDATION_ERROR');
  }
  
  // Role validation (only admins can create admins)
  const validRoles = ['admin', 'operator', 'viewer'];
  const requestedRole = role || 'operator';
  
  if (!validRoles.includes(requestedRole)) {
    throw new ApiError('Invalid role', 400, 'VALIDATION_ERROR');
  }
  
  // Check if requesting user is admin when creating an admin
  if (requestedRole === 'admin' && req.user?.role !== 'admin') {
    throw new ApiError('Only admins can create admin users', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  try {
    // Create user
    const newUser = await User.create({
      username,
      password,
      role: requestedRole
    });
    
    logger.info(`New user created: ${username} (${requestedRole}) by ${req.user?.username || 'system'}`);
    
    res.status(201).json({
      status: 'success',
      data: {
        user: newUser
      }
    });
  } catch (error) {
    if (error.message === 'Username already exists') {
      throw new ApiError('Username already exists', 400, 'USERNAME_TAKEN');
    }
    
    throw new ApiError(`Failed to create user: ${error.message}`, 500, 'USER_CREATION_ERROR');
  }
});

/**
 * @desc    Refresh access token
 * @route   POST /api/v1/auth/refresh
 * @access  Public
 */
const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    throw new ApiError('Refresh token required', 401, 'REFRESH_TOKEN_REQUIRED');
  }
  
  try {
    // Verify token
    const decoded = jwtService.verifyRefreshToken(refreshToken);
    
    if (!decoded) {
      throw new ApiError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    
    // Find user by ID
    const user = User.findById(decoded.id);
    
    if (!user) {
      throw new ApiError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    
    // Generate new tokens
    const tokens = jwtService.generateTokens(user);
    
    // Set new refresh token as cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Send response with new access token
    res.json({
      status: 'success',
      data: {
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn
      }
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new ApiError('Refresh token expired', 401, 'REFRESH_TOKEN_EXPIRED');
    }
    
    throw new ApiError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
});

/**
 * @desc    Logout user / clear cookie
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  // Revoke current access token
  if (req.token) {
    jwtService.revokeToken(req.token);
  }
  
  // Revoke refresh token if present
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    jwtService.revokeToken(refreshToken, true);
  }
  
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
  
  // Log user logout
  logger.info(`User ${req.user?.username} logged out successfully`);
  
  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Get all users
 * @route   GET /api/v1/auth/users
 * @access  Private/Admin
 */
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.getAllUsers();
  
  res.json({
    status: 'success',
    data: {
      users: users || []
    }
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = User.findById(req.user.id);
  
  if (!user) {
    throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  res.json({
    status: 'success',
    data: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.created_at,
      lastLogin: user.last_login
    }
  });
});

/**
 * @desc    Update user
 * @route   PUT /api/v1/auth/users/:id
 * @access  Private/Admin
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, password, role } = req.body;
  
  // Check if user exists
  const user = User.findById(id);
  
  if (!user) {
    throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  // Role validation (only admins can modify roles)
  if (role && req.user.role !== 'admin') {
    throw new ApiError('Only admins can modify roles', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  
  // Prevent last admin from being demoted
  if (user.role === 'admin' && role && role !== 'admin') {
    // Count admins
    const adminCount = User.getAllUsers().filter(u => u.role === 'admin').length;
    
    if (adminCount <= 1) {
      throw new ApiError('Cannot demote the last admin user', 400, 'LAST_ADMIN');
    }
  }
  
  // Create update object
  const updateData = {};
  if (username) updateData.username = username;
  if (password) updateData.password = password;
  if (role) updateData.role = role;
  
  try {
    // Update user
    const updatedUser = await User.update(id, updateData);
    
    res.json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    if (error.message === 'Username already exists') {
      throw new ApiError('Username already exists', 400, 'USERNAME_TAKEN');
    }
    
    throw new ApiError(`Failed to update user: ${error.message}`, 500, 'USER_UPDATE_ERROR');
  }
});

/**
 * @desc    Delete user
 * @route   DELETE /api/v1/auth/users/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check if user exists
  const user = User.findById(id);
  
  if (!user) {
    throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  // Prevent deleting yourself
  if (id === req.user.id) {
    throw new ApiError('Cannot delete your own account', 400, 'SELF_DELETE');
  }
  
  // Prevent deleting the last admin
  if (user.role === 'admin') {
    // Count admins
    const adminCount = User.getAllUsers().filter(u => u.role === 'admin').length;
    
    if (adminCount <= 1) {
      throw new ApiError('Cannot delete the last admin user', 400, 'LAST_ADMIN');
    }
  }
  
  try {
    // Delete user
    User.delete(id);
    
    res.json({
      status: 'success',
      message: 'User deleted successfully'
    });
  } catch (error) {
    throw new ApiError(`Failed to delete user: ${error.message}`, 500, 'USER_DELETE_ERROR');
  }
});

module.exports = {
  login,
  register,
  refreshToken,
  logout,
  getProfile,
  getUsers,
  updateUser,
  deleteUser
};