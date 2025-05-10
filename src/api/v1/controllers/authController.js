/**
 * Authentication controller
 */
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../middleware/errorMiddleware');
const {
  generateTokens,
  findUserByUsername,
  findUserById,
  updateUser
} = require('../middleware/authMiddleware');
const logger = require('../../../utils/logger');

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
  
  // Find user by username
  const user = findUserByUsername(username);
  
  // Check if user exists
  if (!user) {
    throw new ApiError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  
  // Check if password matches
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  
  if (!isMatch) {
    throw new ApiError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
  
  // Generate JWT
  const { accessToken, refreshToken } = generateTokens(user);
  
  // Update last login
  updateUser({
    id: user.id,
    lastLogin: new Date()
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
      accessToken
    }
  });
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
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET || 'trafegodns-jwt-secret'
    );
    
    // Find user by ID
    const user = findUserById(decoded.id);
    
    if (!user) {
      throw new ApiError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    
    // Generate new tokens
    const tokens = generateTokens(user);
    
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
        accessToken: tokens.accessToken
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
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
  
  res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = findUserById(req.user.id);
  
  if (!user) {
    throw new ApiError('User not found', 404, 'USER_NOT_FOUND');
  }
  
  res.json({
    status: 'success',
    data: {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
});

module.exports = {
  login,
  refreshToken,
  logout,
  getProfile
};