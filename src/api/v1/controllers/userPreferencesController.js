/**
 * User Preferences Controller
 * Handles API requests for user preferences
 */
const asyncHandler = require('express-async-handler');
const logger = require('../../../utils/logger');
const { ApiError } = require('../../../utils/apiError');
const database = require('../../../database');

/**
 * Get all preferences for the authenticated user
 * GET /api/v1/user/preferences
 */
const getAllPreferences = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const preferences = await database.repositories.userPreferences.getUserPreferences(userId);
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error(`Failed to get user preferences: ${error.message}`);
    next(new ApiError('Failed to get user preferences', 500));
  }
})

/**
 * Get a specific preference for the authenticated user
 * GET /api/v1/user/preferences/:key
 */
const getPreference = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { key } = req.params;
    
    const value = await database.repositories.userPreferences.getUserPreference(userId, key);
    
    if (value === null) {
      return next(new ApiError('Preference not found', 404));
    }
    
    res.json({
      success: true,
      data: {
        key,
        value
      }
    });
  } catch (error) {
    logger.error(`Failed to get user preference: ${error.message}`);
    next(new ApiError('Failed to get user preference', 500));
  }
})

/**
 * Set a preference for the authenticated user
 * PUT /api/v1/user/preferences/:key
 */
const setPreference = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return next(new ApiError('Value is required', 400));
    }
    
    const success = await database.repositories.userPreferences.setUserPreference(userId, key, value);
    
    res.json({
      success: true,
      data: {
        key,
        value,
        updated: success
      }
    });
  } catch (error) {
    logger.error(`Failed to set user preference: ${error.message}`);
    next(new ApiError('Failed to set user preference', 500));
  }
})

/**
 * Delete a preference for the authenticated user
 * DELETE /api/v1/user/preferences/:key
 */
const deletePreference = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { key } = req.params;
    
    const success = await database.repositories.userPreferences.deleteUserPreference(userId, key);
    
    if (!success) {
      return next(new ApiError('Preference not found', 404));
    }
    
    res.json({
      success: true,
      message: 'Preference deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete user preference: ${error.message}`);
    next(new ApiError('Failed to delete user preference', 500));
  }
})

/**
 * Get dashboard layout for the authenticated user
 * GET /api/v1/user/dashboard-layout
 */
const getDashboardLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const layout = await database.repositories.userPreferences.getDashboardLayout(userId);
    
    res.json({
      success: true,
      data: layout || null
    });
  } catch (error) {
    logger.error(`Failed to get dashboard layout: ${error.message}`);
    next(new ApiError('Failed to get dashboard layout', 500));
  }
})

/**
 * Set dashboard layout for the authenticated user
 * PUT /api/v1/user/dashboard-layout
 */
const setDashboardLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.userPreferences) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { layout } = req.body;
    
    if (!layout || typeof layout !== 'object') {
      return next(new ApiError('Invalid layout format', 400));
    }
    
    const success = await database.repositories.userPreferences.setDashboardLayout(userId, layout);
    
    res.json({
      success: true,
      data: {
        layout,
        updated: success
      }
    });
  } catch (error) {
    logger.error(`Failed to set dashboard layout: ${error.message}`);
    next(new ApiError('Failed to set dashboard layout', 500));
  }
})

module.exports = {
  getAllPreferences,
  getPreference,
  setPreference,
  deletePreference,
  getDashboardLayout,
  setDashboardLayout
};