/**
 * Dashboard Layouts Controller
 * Handles API requests for multiple dashboard layouts
 */
const asyncHandler = require('express-async-handler');
const logger = require('../../../utils/logger');
const { ApiError } = require('../../../utils/apiError');
const database = require('../../../database');

/**
 * List all saved layouts for the authenticated user
 * GET /api/v1/user/dashboard-layouts
 */
const listLayouts = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const layouts = await database.repositories.dashboardLayouts.listUserLayouts(userId);
    
    res.json({
      success: true,
      data: layouts
    });
  } catch (error) {
    logger.error(`Failed to list dashboard layouts: ${error.message}`);
    next(new ApiError('Failed to list dashboard layouts', 500));
  }
});

/**
 * Get a specific layout for the authenticated user
 * GET /api/v1/user/dashboard-layouts/:name
 */
const getLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { name } = req.params;
    
    const layout = await database.repositories.dashboardLayouts.getLayout(userId, name);
    
    if (!layout) {
      return next(new ApiError('Layout not found', 404));
    }
    
    res.json({
      success: true,
      data: layout
    });
  } catch (error) {
    logger.error(`Failed to get dashboard layout: ${error.message}`);
    next(new ApiError('Failed to get dashboard layout', 500));
  }
});

/**
 * Save or update a named layout for the authenticated user
 * PUT /api/v1/user/dashboard-layouts/:name
 */
const saveLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { name } = req.params;
    const { layout } = req.body;
    
    if (!layout || typeof layout !== 'object') {
      return next(new ApiError('Invalid layout format', 400));
    }
    
    if (!name || name.trim().length === 0) {
      return next(new ApiError('Layout name is required', 400));
    }
    
    if (name.length > 100) {
      return next(new ApiError('Layout name must be less than 100 characters', 400));
    }
    
    const savedLayout = await database.repositories.dashboardLayouts.saveLayout(userId, name, layout);
    
    res.json({
      success: true,
      data: savedLayout
    });
  } catch (error) {
    logger.error(`Failed to save dashboard layout: ${error.message}`);
    next(new ApiError('Failed to save dashboard layout', 500));
  }
});

/**
 * Delete a layout for the authenticated user
 * DELETE /api/v1/user/dashboard-layouts/:name
 */
const deleteLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { name } = req.params;
    
    const success = await database.repositories.dashboardLayouts.deleteLayout(userId, name);
    
    if (!success) {
      return next(new ApiError('Layout not found', 404));
    }
    
    res.json({
      success: true,
      message: 'Layout deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete dashboard layout: ${error.message}`);
    next(new ApiError('Failed to delete dashboard layout', 500));
  }
});

/**
 * Set a layout as active/default for the authenticated user
 * PUT /api/v1/user/dashboard-layouts/:name/set-active
 */
const setActiveLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const { name } = req.params;
    
    const success = await database.repositories.dashboardLayouts.setActiveLayout(userId, name);
    
    if (!success) {
      return next(new ApiError('Layout not found', 404));
    }
    
    res.json({
      success: true,
      message: 'Active layout updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to set active dashboard layout: ${error.message}`);
    next(new ApiError('Failed to set active dashboard layout', 500));
  }
});

/**
 * Get the active layout for the authenticated user
 * GET /api/v1/user/dashboard-layouts/active
 */
const getActiveLayout = asyncHandler(async (req, res, next) => {
  try {
    if (!database.isInitialized() || !database.repositories.dashboardLayouts) {
      throw new ApiError('Database not initialized', 500);
    }
    
    const userId = req.user.id;
    const layout = await database.repositories.dashboardLayouts.getActiveLayout(userId);
    
    res.json({
      success: true,
      data: layout
    });
  } catch (error) {
    logger.error(`Failed to get active dashboard layout: ${error.message}`);
    next(new ApiError('Failed to get active dashboard layout', 500));
  }
});

module.exports = {
  listLayouts,
  getLayout,
  saveLayout,
  deleteLayout,
  setActiveLayout,
  getActiveLayout
};