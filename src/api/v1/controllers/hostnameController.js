/**
 * Hostname Controller
 * Handles hostname management operations
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');
const { paginateArray, getPaginationParams } = require('../utils/paginationUtils');

/**
 * @desc    Get all hostnames (managed and preserved combined)
 * @route   GET /api/v1/hostnames
 * @access  Private
 */
const getAllHostnames = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const type = req.query.type || 'all'; // all, managed, preserved
    
    // Get both managed and preserved hostnames from record tracker
    const managedHostnames = DNSManager.recordTracker?.managedHostnames || [];
    const preservedHostnames = DNSManager.recordTracker?.preservedHostnames || [];
    const activeHostnames = DNSManager.lastActiveHostnames || [];
    
    // Get containerMap from DockerMonitor if available
    const { DockerMonitor } = global.services || {};
    const containerMap = DockerMonitor?.containerTracker?.containerMap || new Map();
    
    // Combine and format hostnames
    let allHostnames = [];
    
    if (type === 'all' || type === 'managed') {
      // Add MANAGED_HOSTNAMES from environment
      managedHostnames.forEach((config, index) => {
        // Handle both string and object formats
        const hostnameValue = typeof config === 'string' ? config : config.hostname;
        if (hostnameValue) {
          allHostnames.push({
            id: `managed-${hostnameValue}-${index}`,
            hostname: hostnameValue,
            type: 'managed',
            source: 'manual',
            recordCount: 1, // Each managed hostname is one record
            createdAt: new Date().toISOString() // DNSManager doesn't track creation date
          });
        }
      });
      
      // Add container-managed hostnames from active containers
      activeHostnames.forEach((hostname, index) => {
        // Skip if already in managedHostnames or preservedHostnames
        const isInManagedHostnames = managedHostnames.some(config => 
          (typeof config === 'string' ? config : config.hostname) === hostname
        );
        const isInPreservedHostnames = preservedHostnames.includes(hostname);
        
        if (!isInManagedHostnames && !isInPreservedHostnames) {
          // Find the container that owns this hostname
          let containerName = null;
          for (const [containerId, container] of containerMap) {
            if (container.hostnames && container.hostnames.includes(hostname)) {
              containerName = container.name;
              break;
            }
          }
          
          allHostnames.push({
            id: `container-${hostname}-${index}`,
            hostname: hostname,
            type: 'managed',
            source: 'container',
            containerName: containerName,
            recordCount: 1,
            createdAt: new Date().toISOString()
          });
        }
      });
    }
    
    if (type === 'all' || type === 'preserved') {
      preservedHostnames.forEach((hostname, index) => {
        allHostnames.push({
          id: `preserved-${hostname}-${index}`,
          hostname,
          type: 'preserved',
          source: 'manual',
          recordCount: 1, // Each preserved hostname is one record
          createdAt: new Date().toISOString()
        });
      });
    }
    
    // Apply search filter
    if (search) {
      allHostnames = allHostnames.filter(h => 
        h.hostname.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Apply pagination
    const total = allHostnames.length;
    const paginationParams = { page, limit, offset: (page - 1) * limit };
    const paginatedResult = paginateArray(allHostnames, paginationParams);
    const paginatedHostnames = paginatedResult.data;
    
    res.json({
      status: 'success',
      data: {
        hostnames: paginatedHostnames,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get hostnames: ${error.message}`,
      500,
      'HOSTNAMES_GET_ERROR'
    );
  }
});

/**
 * @desc    Create a new hostname (managed)
 * @route   POST /api/v1/hostnames
 * @access  Private/Operator
 */
const createHostname = asyncHandler(async (req, res) => {
  const { hostname, type, content, ttl, proxied } = req.body;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate required fields
  if (!hostname || !type || !content) {
    throw new ApiError('Hostname, type, and content are required', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Add managed hostname to tracker
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    // Add to managed hostnames array
    DNSManager.recordTracker.managedHostnames.push({
      hostname,
      type,
      content,
      ttl: ttl || 3600,
      proxied: proxied || false
    });
    
    // Create the DNS record
    const record = await DNSManager.processHostnames([hostname], {
      [`dns.${hostname}.type`]: type,
      [`dns.${hostname}.content`]: content,
      [`dns.${hostname}.ttl`]: ttl || 3600,
      [`dns.${hostname}.proxied`]: proxied || false
    });
    
    logger.info(`Created managed hostname: ${hostname}`);
    
    res.status(201).json({
      status: 'success',
      data: {
        message: 'Hostname created successfully',
        hostname: {
          id: `managed-${hostname}`,
          hostname,
          type: 'managed',
          record
        }
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
 * @access  Private/Operator
 */
const updateHostname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, content, ttl, proxied } = req.body;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Extract hostname from ID (format: "managed-hostname" or "preserved-hostname")
  const [hostnameType, ...hostnameParts] = id.split('-');
  const hostname = hostnameParts.join('-');
  
  if (!hostname || !['managed', 'preserved'].includes(hostnameType)) {
    throw new ApiError('Invalid hostname ID', 400, 'INVALID_ID');
  }
  
  try {
    if (hostnameType === 'managed') {
      // For managed hostnames, we need to update the DNS record
      if (!DNSManager.recordTracker) {
        throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
      }
      
      // Find and update the managed hostname
      const index = DNSManager.recordTracker.managedHostnames.findIndex(h => h.hostname === hostname);
      if (index === -1) {
        throw new ApiError('Hostname not found', 404, 'HOSTNAME_NOT_FOUND');
      }
      
      // Update the managed hostname entry
      DNSManager.recordTracker.managedHostnames[index] = {
        hostname,
        type: type || DNSManager.recordTracker.managedHostnames[index].type,
        content: content || DNSManager.recordTracker.managedHostnames[index].content,
        ttl: ttl || DNSManager.recordTracker.managedHostnames[index].ttl,
        proxied: proxied !== undefined ? proxied : DNSManager.recordTracker.managedHostnames[index].proxied
      };
      
      // Update the DNS record
      const record = await DNSManager.processHostnames([hostname], {
        [`dns.${hostname}.type`]: type || DNSManager.recordTracker.managedHostnames[index].type,
        [`dns.${hostname}.content`]: content || DNSManager.recordTracker.managedHostnames[index].content,
        [`dns.${hostname}.ttl`]: ttl || DNSManager.recordTracker.managedHostnames[index].ttl,
        [`dns.${hostname}.proxied`]: proxied !== undefined ? proxied : DNSManager.recordTracker.managedHostnames[index].proxied
      });
      
      res.json({
        status: 'success',
        data: {
          message: 'Hostname updated successfully',
          hostname: {
            id,
            hostname,
            type: 'managed',
            record
          }
        }
      });
    } else {
      throw new ApiError('Cannot update preserved hostnames', 400, 'OPERATION_NOT_ALLOWED');
    }
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
 * @access  Private/Operator
 */
const deleteHostname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Extract hostname from ID
  const [hostnameType, ...hostnameParts] = id.split('-');
  const hostname = hostnameParts.join('-');
  
  if (!hostname || !['managed', 'preserved'].includes(hostnameType)) {
    throw new ApiError('Invalid hostname ID', 400, 'INVALID_ID');
  }
  
  try {
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    if (hostnameType === 'managed') {
      const index = DNSManager.recordTracker.managedHostnames.findIndex(h => h.hostname === hostname);
      if (index === -1) {
        throw new ApiError('Hostname not found', 404, 'HOSTNAME_NOT_FOUND');
      }
      DNSManager.recordTracker.managedHostnames.splice(index, 1);
    } else {
      const index = DNSManager.recordTracker.preservedHostnames.indexOf(hostname);
      if (index === -1) {
        throw new ApiError('Hostname not found in preserved list', 404, 'HOSTNAME_NOT_FOUND');
      }
      DNSManager.recordTracker.preservedHostnames.splice(index, 1);
    }
    
    res.json({
      status: 'success',
      data: {
        message: `${hostnameType} hostname deleted successfully`,
        removed: true
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to delete hostname: ${error.message}`,
      500,
      'HOSTNAME_DELETE_ERROR'
    );
  }
});

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
    const managedHostnames = DNSManager.recordTracker?.managedHostnames || [];
    
    res.json({
      status: 'success',
      data: {
        managedHostnames: managedHostnames || [],
        count: managedHostnames ? managedHostnames.length : 0
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get managed hostnames: ${error.message}`,
      500,
      'MANAGED_HOSTNAMES_GET_ERROR'
    );
  }
});

/**
 * @desc    Add a manually managed hostname
 * @route   POST /api/v1/hostnames/managed
 * @access  Private/Admin
 */
const addManagedHostname = asyncHandler(async (req, res) => {
  const { hostname, type, content, ttl, proxied } = req.body;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate required fields
  if (!hostname || !type || !content) {
    throw new ApiError('Hostname, type, and content are required', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Add managed hostname to tracker
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    // Add to managed hostnames array
    DNSManager.recordTracker.managedHostnames.push({
      hostname,
      type,
      content,
      ttl: ttl || 3600,
      proxied: proxied || false
    });
    
    // Create the DNS record
    const record = await DNSManager.processHostnames([hostname], {
      [`dns.${hostname}.type`]: type,
      [`dns.${hostname}.content`]: content,
      [`dns.${hostname}.ttl`]: ttl || 3600,
      [`dns.${hostname}.proxied`]: proxied || false
    });
    
    logger.info(`Added managed hostname: ${hostname}`);
    
    res.status(201).json({
      status: 'success',
      data: {
        message: 'Managed hostname added successfully',
        record
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to add managed hostname: ${error.message}`,
      500,
      'MANAGED_HOSTNAME_ADD_ERROR'
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
    // Remove from managed hostnames array
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    const index = DNSManager.recordTracker.managedHostnames.findIndex(h => h.hostname === hostname);
    if (index === -1) {
      throw new ApiError('Hostname not found', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    DNSManager.recordTracker.managedHostnames.splice(index, 1);
    
    // Delete the DNS record
    const result = { success: true };
    
    if (!result || !result.success) {
      throw new ApiError('Hostname not found or could not be removed', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    logger.info(`Removed managed hostname: ${hostname}`);
    
    res.json({
      status: 'success',
      data: {
        message: 'Managed hostname removed successfully',
        removed: true
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    
    throw new ApiError(
      `Failed to remove managed hostname: ${error.message}`,
      500,
      'MANAGED_HOSTNAME_REMOVE_ERROR'
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
    const preservedHostnames = DNSManager.recordTracker?.preservedHostnames || [];
    
    res.json({
      status: 'success',
      data: {
        preservedHostnames: preservedHostnames || [],
        count: preservedHostnames ? preservedHostnames.length : 0
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get preserved hostnames: ${error.message}`,
      500,
      'PRESERVED_HOSTNAMES_GET_ERROR'
    );
  }
});

/**
 * @desc    Add a preserved hostname
 * @route   POST /api/v1/hostnames/preserved
 * @access  Private/Admin
 */
const addPreservedHostname = asyncHandler(async (req, res) => {
  const { hostname } = req.body;
  const { DNSManager } = global.services || {};
  
  if (!DNSManager) {
    throw new ApiError('DNS manager not initialized', 500, 'DNS_MANAGER_NOT_INITIALIZED');
  }
  
  // Validate required field
  if (!hostname) {
    throw new ApiError('Hostname is required', 400, 'VALIDATION_ERROR');
  }
  
  try {
    // Add to preserved hostnames array
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    if (!DNSManager.recordTracker.preservedHostnames.includes(hostname)) {
      DNSManager.recordTracker.preservedHostnames.push(hostname);
    }
    
    const result = { success: true };
    
    logger.info(`Added preserved hostname: ${hostname}`);
    
    res.status(201).json({
      status: 'success',
      data: {
        message: 'Preserved hostname added successfully',
        preservedHostnames: DNSManager.getPreservedHostnames()
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to add preserved hostname: ${error.message}`,
      500,
      'PRESERVED_HOSTNAME_ADD_ERROR'
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
    // Remove from preserved hostnames array
    if (!DNSManager.recordTracker) {
      throw new ApiError('Record tracker not initialized', 500, 'TRACKER_NOT_INITIALIZED');
    }
    
    const index = DNSManager.recordTracker.preservedHostnames.indexOf(hostname);
    if (index === -1) {
      throw new ApiError('Hostname not found in preserved list', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    DNSManager.recordTracker.preservedHostnames.splice(index, 1);
    
    const result = { success: true };
    
    if (!result || !result.success) {
      throw new ApiError('Hostname not found in preserved list', 404, 'HOSTNAME_NOT_FOUND');
    }
    
    logger.info(`Removed preserved hostname: ${hostname}`);
    
    res.json({
      status: 'success',
      data: {
        message: 'Preserved hostname removed successfully',
        removed: true,
        preservedHostnames: DNSManager.getPreservedHostnames()
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    
    throw new ApiError(
      `Failed to remove preserved hostname: ${error.message}`,
      500,
      'PRESERVED_HOSTNAME_REMOVE_ERROR'
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
  const { stateStore } = global;
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Get orphaned records from state store if available
    let orphanedRecords = [];
    
    if (stateStore && stateStore.hasPath('dns.orphaned')) {
      orphanedRecords = stateStore.getState('dns.orphaned');
    } else {
      // Fallback to direct access
      const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
      
      // Filter to only orphaned records
      orphanedRecords = records.filter(record => 
        DNSManager.recordTracker.isTracked(record) && 
        DNSManager.recordTracker.isRecordOrphaned(record)
      );
    }
    
    res.json({
      status: 'success',
      data: {
        orphanedRecords: orphanedRecords || [],
        count: orphanedRecords ? orphanedRecords.length : 0,
        cleanupEnabled: DNSManager.config.cleanupOrphaned || false,
        gracePeriod: DNSManager.config.cleanupGracePeriod || 3600
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get orphaned records: ${error.message}`,
      500,
      'ORPHANED_RECORDS_GET_ERROR'
    );
  }
});

/**
 * @desc    Restore an orphaned record
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
    // Find the orphaned record
    const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
    const record = records.find(r => r.id === id);
    
    if (!record) {
      throw new ApiError('Orphaned record not found', 404, 'RECORD_NOT_FOUND');
    }
    
    // Unmark as orphaned
    if (DNSManager.recordTracker && DNSManager.recordTracker.unmarkRecordOrphaned) {
      DNSManager.recordTracker.unmarkRecordOrphaned(record);
    }
    
    logger.info(`Restored orphaned record: ${id}`);
    
    res.json({
      status: 'success',
      data: {
        message: 'Orphaned record restored successfully',
        record: record
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    
    throw new ApiError(
      `Failed to restore orphaned record: ${error.message}`,
      500,
      'ORPHANED_RECORD_RESTORE_ERROR'
    );
  }
});

/**
 * @desc    Get orphaned record cleanup settings
 * @route   GET /api/v1/hostnames/orphaned/settings
 * @access  Private
 */
const getOrphanedSettings = asyncHandler(async (req, res) => {
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  try {
    res.json({
      status: 'success',
      data: {
        settings: {
          cleanupOrphaned: ConfigManager.cleanupOrphaned || false,
          cleanupGracePeriod: ConfigManager.cleanupGracePeriod || 3600
        }
      }
    });
  } catch (error) {
    throw new ApiError(
      `Failed to get orphaned settings: ${error.message}`,
      500,
      'ORPHANED_SETTINGS_GET_ERROR'
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
  const { ConfigManager } = global.services || {};
  
  if (!ConfigManager) {
    throw new ApiError('Config manager not initialized', 500, 'CONFIG_MANAGER_NOT_INITIALIZED');
  }
  
  const updates = {};
  if (cleanupEnabled !== undefined) updates.cleanupOrphaned = cleanupEnabled;
  if (gracePeriod !== undefined) updates.cleanupGracePeriod = gracePeriod;
  
  if (Object.keys(updates).length === 0) {
    throw new ApiError('No valid settings provided', 400, 'VALIDATION_ERROR');
  }
  
  try {
    const result = await ConfigManager.updateConfig(updates);
    
    if (!result.success) {
      throw new ApiError(
        result.error || 'Failed to update settings',
        400,
        'SETTINGS_UPDATE_ERROR'
      );
    }
    
    res.json({
      status: 'success',
      data: {
        message: 'Orphaned record settings updated successfully',
        settings: {
          cleanupEnabled: updates.cleanupOrphaned !== undefined ? updates.cleanupOrphaned : undefined,
          gracePeriod: updates.cleanupGracePeriod
        }
      }
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    
    throw new ApiError(
      `Failed to update orphaned settings: ${error.message}`,
      500,
      'ORPHANED_SETTINGS_UPDATE_ERROR'
    );
  }
});

module.exports = {
  getAllHostnames,
  createHostname,
  updateHostname,
  deleteHostname,
  getManagedHostnames,
  addManagedHostname,
  deleteManagedHostname,
  getPreservedHostnames,
  addPreservedHostname,
  deletePreservedHostname,
  getOrphanedRecords,
  restoreOrphanedRecord,
  getOrphanedSettings,
  updateOrphanedSettings
};