/**
 * Hostname Controller
 * Handles manual hostname management and preservation rules
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');

/**
 * @desc    Get all manually managed hostnames
 * @route   GET /api/v1/hostnames/managed
 * @access  Private/Admin
 */
const getManagedHostnames = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get the list of manually managed hostnames
    const managedHostnames = await DNSManager.getManagedHostnames();
    
    res.json({
      status: 'success',
      data: {
        managedHostnames,
        count: managedHostnames.length
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get managed hostnames: ${error.message}`,
      500,
      'MANAGED_HOSTNAMES_ERROR'
    );
  }
});

/**
 * @desc    Add a manually managed hostname
 * @route   POST /api/v1/hostnames/managed
 * @access  Private/Admin
 */
const addManagedHostname = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate request body
  const { hostname, type, content, ttl, proxied } = req.body;
  
  if (!hostname) {
    throw new ApiError('Hostname is required', 400, 'VALIDATION_ERROR');
  }
  
  if (!type) {
    throw new ApiError('Record type is required', 400, 'VALIDATION_ERROR');
  }
  
  if (!content) {
    throw new ApiError('Record content is required', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Add the hostname to the managed list
    const result = await DNSManager.addManagedHostname(hostname, {
      type,
      content,
      ttl: ttl || DNSManager.config.getDefaultTTL(),
      proxied: proxied !== undefined ? proxied : DNSManager.config.getDefaultProxied()
    });
    
    if (!result.success) {
      throw new ApiError(result.error || 'Failed to add managed hostname', 400, 'HOSTNAME_ADD_ERROR');
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        message: `Hostname ${hostname} added to managed hostnames`,
        record: result.record
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to add managed hostname: ${error.message}`,
      error.statusCode || 500,
      error.code || 'MANAGED_HOSTNAME_ADD_ERROR'
    );
  }
});

/**
 * @desc    Delete a manually managed hostname
 * @route   DELETE /api/v1/hostnames/managed/:hostname
 * @access  Private/Admin
 */
const deleteManagedHostname = asyncHandler(async (req, res) => {
  const { hostname } = req.params;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Remove the hostname from the managed list
    const result = await DNSManager.removeManagedHostname(hostname);
    
    if (!result.success) {
      throw new ApiError(
        result.error || `Hostname ${hostname} not found in managed hostnames`,
        404,
        'HOSTNAME_NOT_FOUND'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: `Hostname ${hostname} removed from managed hostnames`,
        removed: true
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to remove managed hostname: ${error.message}`,
      error.statusCode || 500,
      error.code || 'MANAGED_HOSTNAME_DELETE_ERROR'
    );
  }
});

/**
 * @desc    Get all preserved hostnames
 * @route   GET /api/v1/hostnames/preserved
 * @access  Private/Admin
 */
const getPreservedHostnames = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get the list of preserved hostnames
    const preservedHostnames = await DNSManager.getPreservedHostnames();
    
    res.json({
      status: 'success',
      data: {
        preservedHostnames,
        count: preservedHostnames.length
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get preserved hostnames: ${error.message}`,
      500,
      'PRESERVED_HOSTNAMES_ERROR'
    );
  }
});

/**
 * @desc    Add a preserved hostname
 * @route   POST /api/v1/hostnames/preserved
 * @access  Private/Admin
 */
const addPreservedHostname = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate request body
  const { hostname } = req.body;
  
  if (!hostname) {
    throw new ApiError('Hostname is required', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Add the hostname to the preserved list
    const result = await DNSManager.addPreservedHostname(hostname);
    
    if (!result.success) {
      throw new ApiError(result.error || 'Failed to add preserved hostname', 400, 'HOSTNAME_ADD_ERROR');
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        message: `Hostname ${hostname} added to preserved hostnames`,
        preservedHostnames: result.preservedHostnames
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to add preserved hostname: ${error.message}`,
      error.statusCode || 500,
      error.code || 'PRESERVED_HOSTNAME_ADD_ERROR'
    );
  }
});

/**
 * @desc    Delete a preserved hostname
 * @route   DELETE /api/v1/hostnames/preserved/:hostname
 * @access  Private/Admin
 */
const deletePreservedHostname = asyncHandler(async (req, res) => {
  const { hostname } = req.params;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Remove the hostname from the preserved list
    const result = await DNSManager.removePreservedHostname(hostname);
    
    if (!result.success) {
      throw new ApiError(
        result.error || `Hostname ${hostname} not found in preserved hostnames`,
        404,
        'HOSTNAME_NOT_FOUND'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: `Hostname ${hostname} removed from preserved hostnames`,
        removed: true,
        preservedHostnames: result.preservedHostnames
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to remove preserved hostname: ${error.message}`,
      error.statusCode || 500,
      error.code || 'PRESERVED_HOSTNAME_DELETE_ERROR'
    );
  }
});

/**
 * @desc    Get all orphaned records
 * @route   GET /api/v1/hostnames/orphaned
 * @access  Private/Admin
 */
const getOrphanedRecords = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    const orphanedRecords = await DNSManager.getOrphanedRecords();
    
    // Format the records for API response
    const formattedRecords = orphanedRecords.map(record => ({
      id: record.id,
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied || false,
      markedAt: record.orphanedSince || null,
      gracePeriod: DNSManager.config.cleanupGracePeriod || 15, // Minutes
      remainingTime: record.orphanedSince 
        ? Math.max(0, (DNSManager.config.cleanupGracePeriod || 15) * 60 * 1000 - (Date.now() - record.orphanedSince)) / (60 * 1000)
        : null // Remaining time in minutes
    }));
    
    res.json({
      status: 'success',
      data: {
        orphanedRecords: formattedRecords,
        count: formattedRecords.length,
        cleanupEnabled: DNSManager.config.cleanupOrphaned || false,
        gracePeriod: DNSManager.config.cleanupGracePeriod || 15 // Minutes
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get orphaned records: ${error.message}`,
      500,
      'ORPHANED_RECORDS_ERROR'
    );
  }
});

/**
 * @desc    Restore an orphaned record (unmark as orphaned)
 * @route   POST /api/v1/hostnames/orphaned/:id/restore
 * @access  Private/Admin
 */
const restoreOrphanedRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    const result = await DNSManager.restoreOrphanedRecord(id);
    
    if (!result.success) {
      throw new ApiError(
        result.error || `Record with ID ${id} not found or is not orphaned`,
        404,
        'RECORD_NOT_FOUND'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: `Record with ID ${id} has been restored and will no longer be deleted`,
        record: result.record
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to restore orphaned record: ${error.message}`,
      error.statusCode || 500,
      error.code || 'ORPHANED_RECORD_RESTORE_ERROR'
    );
  }
});

/**
 * @desc    Update orphaned record cleanup settings
 * @route   PUT /api/v1/hostnames/orphaned/settings
 * @access  Private/Admin
 */
const updateOrphanedSettings = asyncHandler(async (req, res) => {
  const { cleanupEnabled, gracePeriod } = req.body;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // At least one parameter must be provided
    if (cleanupEnabled === undefined && gracePeriod === undefined) {
      throw new ApiError(
        'At least one setting must be provided',
        400,
        'VALIDATION_ERROR'
      );
    }
    
    // Validate grace period if provided
    if (gracePeriod !== undefined) {
      if (typeof gracePeriod !== 'number' || gracePeriod < 1) {
        throw new ApiError(
          'Grace period must be a positive number (minutes)',
          400,
          'VALIDATION_ERROR'
        );
      }
    }
    
    // Update settings
    const result = await DNSManager.updateOrphanedSettings({
      cleanupEnabled: cleanupEnabled !== undefined ? cleanupEnabled : DNSManager.config.cleanupOrphaned,
      gracePeriod: gracePeriod !== undefined ? gracePeriod : DNSManager.config.cleanupGracePeriod
    });
    
    if (!result.success) {
      throw new ApiError(result.error || 'Failed to update orphaned record settings', 400, 'SETTINGS_UPDATE_ERROR');
    }
    
    res.json({
      status: 'success',
      data: {
        message: 'Orphaned record settings updated successfully',
        settings: {
          cleanupEnabled: result.settings.cleanupEnabled,
          gracePeriod: result.settings.gracePeriod
        }
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to update orphaned record settings: ${error.message}`,
      error.statusCode || 500,
      error.code || 'ORPHANED_SETTINGS_UPDATE_ERROR'
    );
  }
});

/**
 * @desc    Get all hostnames (managed and preserved combined)
 * @route   GET /api/v1/hostnames
 * @access  Private
 */
const getAllHostnames = asyncHandler(async (req, res) => {
  const database = require('../../../database');
  
  try {
    // Get query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const type = req.query.type || 'all';
    
    // Get managed records from database
    let allHostnames = [];
    
    if (database && database.repositories && database.repositories.managedRecords) {
      const managedRecords = await database.repositories.managedRecords.findAll();
      
      // Convert to expected format
      allHostnames = managedRecords.map(record => ({
        id: record.id.toString(),
        hostname: record.hostname,
        type: record.is_preserved ? 'preserved' : 'managed',
        source: record.source || 'manual',
        containerId: record.container_id,
        containerName: record.container_name,
        recordCount: 0, // Will be populated if needed
        createdAt: record.created_at,
        updatedAt: record.updated_at
      }));
    }
    
    // Apply filters
    if (search) {
      allHostnames = allHostnames.filter(h => 
        h.hostname.toLowerCase().includes(search.toLowerCase()) ||
        (h.containerName && h.containerName.toLowerCase().includes(search.toLowerCase()))
      );
    }
    
    if (type !== 'all') {
      allHostnames = allHostnames.filter(h => h.type === type);
    }
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedHostnames = allHostnames.slice(startIndex, endIndex);
    
    res.json({
      status: 'success',
      data: {
        hostnames: paginatedHostnames,
        total: allHostnames.length,
        page: page,
        limit: limit
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get hostnames: ${error.message}`,
      500,
      'HOSTNAMES_FETCH_ERROR'
    );
  }
});

/**
 * @desc    Create a new hostname
 * @route   POST /api/v1/hostnames
 * @access  Private/Admin/Operator
 */
const createHostname = asyncHandler(async (req, res) => {
  const database = require('../../../database');
  const { hostname, type = 'preserved' } = req.body;
  
  if (!hostname) {
    throw new ApiError('Hostname is required', 400, 'HOSTNAME_REQUIRED');
  }
  
  try {
    // Create preserved hostname
    const record = await database.repositories.managedRecords.create({
      hostname,
      is_preserved: type === 'preserved' ? 1 : 0,
      source: 'manual',
      created_at: new Date().toISOString()
    });
    
    res.json({
      status: 'success',
      data: {
        id: record.id.toString(),
        hostname: record.hostname,
        type: record.is_preserved ? 'preserved' : 'managed',
        createdAt: record.created_at
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to create hostname: ${error.message}`,
      500,
      'HOSTNAME_CREATE_ERROR'
    );
  }
});

/**
 * @desc    Update a hostname
 * @route   PUT /api/v1/hostnames/:id
 * @access  Private/Admin/Operator
 */
const updateHostname = asyncHandler(async (req, res) => {
  const database = require('../../../database');
  const { id } = req.params;
  const { type } = req.body;
  
  try {
    const record = await database.repositories.managedRecords.findById(id);
    
    if (!record) {
      throw new ApiError('Hostname not found', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    // Update the type
    await database.repositories.managedRecords.update(id, {
      is_preserved: type === 'preserved' ? 1 : 0,
      updated_at: new Date().toISOString()
    });
    
    res.json({
      status: 'success',
      data: {
        id: id,
        hostname: record.hostname,
        type: type
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to update hostname: ${error.message}`,
      500,
      'HOSTNAME_UPDATE_ERROR'
    );
  }
});

/**
 * @desc    Delete a hostname
 * @route   DELETE /api/v1/hostnames/:id
 * @access  Private/Admin/Operator
 */
const deleteHostname = asyncHandler(async (req, res) => {
  const database = require('../../../database');
  const { id } = req.params;
  
  try {
    const record = await database.repositories.managedRecords.findById(id);
    
    if (!record) {
      throw new ApiError('Hostname not found', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    // Don't allow deleting managed (non-preserved) hostnames
    if (!record.is_preserved) {
      throw new ApiError('Cannot delete managed hostnames', 400, 'CANNOT_DELETE_MANAGED');
    }
    
    await database.repositories.managedRecords.delete(id);
    
    res.json({
      status: 'success',
      message: 'Hostname deleted successfully'
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      `Failed to delete hostname: ${error.message}`,
      500,
      'HOSTNAME_DELETE_ERROR'
    );
  }
});

module.exports = {
  getManagedHostnames,
  addManagedHostname,
  deleteManagedHostname,
  getPreservedHostnames,
  addPreservedHostname,
  deletePreservedHostname,
  getOrphanedRecords,
  restoreOrphanedRecord,
  updateOrphanedSettings,
  getAllHostnames
};