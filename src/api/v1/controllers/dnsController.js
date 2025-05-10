/**
 * DNS controller
 * Handles DNS record management endpoints
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/paginationUtils');

/**
 * @desc    Get all DNS records
 * @route   GET /api/v1/dns/records
 * @access  Private
 */
const getRecords = asyncHandler(async (req, res) => {
  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker, stateStore } = global;

  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }

  try {
    // Get records using action broker if available
    let records;

    if (actionBroker) {
      try {
        // Dispatch action to fetch records
        await actionBroker.dispatch({
          type: 'DNS_RECORDS_FETCH',
          metadata: {
            source: 'api',
            requestId: req.id
          }
        });

        // Get records from state store
        records = stateStore.getState('dns.records');
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct provider: ${stateError.message}`);
        records = await DNSManager.dnsProvider.getRecordsFromCache(true);
      }
    } else {
      // Direct provider fallback
      records = await DNSManager.dnsProvider.getRecordsFromCache(true);
    }

    // Extract filter parameters
    const { type, name, managed } = req.query;

    // Transform records to a consistent format
    let formattedRecords = records.map(record => {
      return {
        id: record.id,
        type: record.type,
        name: record.name,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        proxied: record.proxied === true,
        managed: DNSManager.recordTracker.isTracked(record),
        priority: record.priority,
        created: record.created_on || record.created_at || null,
        modified: record.modified_on || record.updated_at || null
      };
    });

    // Apply filters if provided
    if (type) {
      formattedRecords = formattedRecords.filter(record =>
        record.type.toLowerCase() === type.toLowerCase());
    }

    if (name) {
      formattedRecords = formattedRecords.filter(record =>
        record.name.toLowerCase().includes(name.toLowerCase()));
    }

    if (managed !== undefined) {
      const isManaged = managed === 'true';
      formattedRecords = formattedRecords.filter(record => record.managed === isManaged);
    }

    // Get pagination parameters
    const paginationParams = getPaginationParams(req.query);

    // Format paginated response
    const response = formatPaginatedResponse(req, formattedRecords, paginationParams);

    // Add provider information
    response.provider = DNSManager.config.dnsProvider;
    response.domain = DNSManager.config.getProviderDomain();

    res.json(response);
  } catch (error) {
    logger.error(`Error fetching DNS records: ${error.message}`);
    throw new ApiError(`Failed to fetch DNS records: ${error.message}`, 500, 'DNS_FETCH_ERROR');
  }
});

/**
 * @desc    Get a single DNS record
 * @route   GET /api/v1/dns/records/:id
 * @access  Private
 */
const getRecord = asyncHandler(async (req, res) => {
  const recordId = req.params.id;
  
  if (!recordId) {
    throw new ApiError('Record ID is required', 400, 'MISSING_RECORD_ID');
  }
  
  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Get all records and find the one with matching ID
    const records = await DNSManager.dnsProvider.getRecordsFromCache(false);
    const record = records.find(r => r.id === recordId);
    
    if (!record) {
      throw new ApiError(`Record with ID ${recordId} not found`, 404, 'RECORD_NOT_FOUND');
    }
    
    // Format the record
    const formattedRecord = {
      id: record.id,
      type: record.type,
      name: record.name,
      content: record.content || record.data || record.value,
      ttl: record.ttl,
      proxied: record.proxied === true,
      managed: DNSManager.recordTracker.isTracked(record),
      priority: record.priority,
      created: record.created_on || record.created_at || null,
      modified: record.modified_on || record.updated_at || null
    };
    
    res.json({
      status: 'success',
      data: formattedRecord
    });
  } catch (error) {
    logger.error(`Error fetching DNS record: ${error.message}`);
    throw new ApiError(`Failed to fetch DNS record: ${error.message}`, 500, 'DNS_FETCH_ERROR');
  }
});

/**
 * @desc    Create a new DNS record
 * @route   POST /api/v1/dns/records
 * @access  Private
 */
const createRecord = asyncHandler(async (req, res) => {
  const { type, name, content, ttl, proxied } = req.body;

  // Validate required fields
  if (!type || !name || !content) {
    throw new ApiError('Type, name, and content are required', 400, 'MISSING_REQUIRED_FIELDS');
  }

  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker } = global;

  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }

  try {
    // Prepare the record configuration
    const recordConfig = {
      type: type.toUpperCase(),
      name,
      content,
      ttl: ttl || DNSManager.config.defaultTTL,
      proxied: proxied === true
    };

    // Add type-specific fields if applicable
    if (type.toUpperCase() === 'MX' && req.body.priority) {
      recordConfig.priority = parseInt(req.body.priority);
    } else if (type.toUpperCase() === 'SRV') {
      if (req.body.priority) recordConfig.priority = parseInt(req.body.priority);
      if (req.body.weight) recordConfig.weight = parseInt(req.body.weight);
      if (req.body.port) recordConfig.port = parseInt(req.body.port);
    } else if (type.toUpperCase() === 'CAA') {
      if (req.body.flags !== undefined) recordConfig.flags = parseInt(req.body.flags);
      if (req.body.tag) recordConfig.tag = req.body.tag;
    }

    let createdRecord;

    // Use action broker if available, otherwise fallback to direct method
    if (actionBroker) {
      try {
        // Dispatch action to create record
        createdRecord = await actionBroker.dispatch({
          type: 'DNS_RECORD_CREATE',
          payload: recordConfig,
          metadata: {
            source: 'api',
            requestId: req.id,
            userId: req.user?.id || 'system'
          }
        });
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct provider: ${stateError.message}`);
        // Fallback to direct method
        createdRecord = await DNSManager.dnsProvider.createRecord(recordConfig);
        // Track the record
        DNSManager.recordTracker.trackRecord(createdRecord);
      }
    } else {
      // Direct provider method
      createdRecord = await DNSManager.dnsProvider.createRecord(recordConfig);
      // Track the record
      DNSManager.recordTracker.trackRecord(createdRecord);
    }

    // Format the record for response
    const formattedRecord = {
      id: createdRecord.id,
      type: createdRecord.type,
      name: createdRecord.name,
      content: createdRecord.content || createdRecord.data || createdRecord.value,
      ttl: createdRecord.ttl,
      proxied: createdRecord.proxied === true,
      managed: true,
      priority: createdRecord.priority,
      created: createdRecord.created_on || createdRecord.created_at || new Date().toISOString(),
      modified: createdRecord.modified_on || createdRecord.updated_at || new Date().toISOString()
    };

    res.status(201).json({
      status: 'success',
      message: `Successfully created ${type} record for ${name}`,
      data: formattedRecord
    });
  } catch (error) {
    logger.error(`Error creating DNS record: ${error.message}`);
    throw new ApiError(`Failed to create DNS record: ${error.message}`, 500, 'DNS_CREATE_ERROR');
  }
});

/**
 * @desc    Update a DNS record
 * @route   PUT /api/v1/dns/records/:id
 * @access  Private
 */
const updateRecord = asyncHandler(async (req, res) => {
  const recordId = req.params.id;
  const { content, ttl, proxied } = req.body;

  if (!recordId) {
    throw new ApiError('Record ID is required', 400, 'MISSING_RECORD_ID');
  }

  // At least one field must be provided for update
  if (!content && ttl === undefined && proxied === undefined) {
    throw new ApiError('At least one field must be provided for update', 400, 'MISSING_UPDATE_FIELDS');
  }

  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker, stateStore } = global;

  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }

  try {
    // Get the record to update
    let record;

    // Try to get from state store first if available
    if (stateStore) {
      const records = stateStore.getState('dns.records') || [];
      record = records.find(r => r.id === recordId);
    }

    // Fall back to provider cache if not found in state store
    if (!record) {
      const records = await DNSManager.dnsProvider.getRecordsFromCache(false);
      record = records.find(r => r.id === recordId);
    }

    if (!record) {
      throw new ApiError(`Record with ID ${recordId} not found`, 404, 'RECORD_NOT_FOUND');
    }

    // Create update payload
    const updatePayload = {
      id: recordId,
      content: content || undefined,
      ttl: ttl !== undefined ? ttl : undefined,
      proxied: proxied !== undefined ? proxied : undefined
    };

    // Add type-specific fields if applicable
    if (record.type === 'MX' && req.body.priority) {
      updatePayload.priority = parseInt(req.body.priority);
    } else if (record.type === 'SRV') {
      if (req.body.priority) updatePayload.priority = parseInt(req.body.priority);
      if (req.body.weight) updatePayload.weight = parseInt(req.body.weight);
      if (req.body.port) updatePayload.port = parseInt(req.body.port);
    } else if (record.type === 'CAA') {
      if (req.body.flags !== undefined) updatePayload.flags = parseInt(req.body.flags);
      if (req.body.tag) updatePayload.tag = req.body.tag;
    }

    let updatedRecord;

    // Use action broker if available
    if (actionBroker) {
      try {
        // Dispatch action to update record
        updatedRecord = await actionBroker.dispatch({
          type: 'DNS_RECORD_UPDATE',
          payload: updatePayload,
          metadata: {
            source: 'api',
            requestId: req.id,
            userId: req.user?.id || 'system'
          }
        });
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct provider: ${stateError.message}`);

        // Create legacy update config for direct provider
        const updateConfig = {
          ...record,
          content: content || record.content || record.data || record.value,
          ttl: ttl || record.ttl
        };

        // Only add proxied if explicitly provided
        if (proxied !== undefined) {
          updateConfig.proxied = proxied === true;
        }

        // Add type-specific fields
        if (record.type === 'MX' && req.body.priority) {
          updateConfig.priority = parseInt(req.body.priority);
        } else if (record.type === 'SRV') {
          if (req.body.priority) updateConfig.priority = parseInt(req.body.priority);
          if (req.body.weight) updateConfig.weight = parseInt(req.body.weight);
          if (req.body.port) updateConfig.port = parseInt(req.body.port);
        } else if (record.type === 'CAA') {
          if (req.body.flags !== undefined) updateConfig.flags = parseInt(req.body.flags);
          if (req.body.tag) updateConfig.tag = req.body.tag;
        }

        // Update directly
        updatedRecord = await DNSManager.dnsProvider.updateRecord(recordId, updateConfig);

        // Track the record
        DNSManager.recordTracker.trackRecord(updatedRecord);
      }
    } else {
      // Create legacy update config for direct provider
      const updateConfig = {
        ...record,
        content: content || record.content || record.data || record.value,
        ttl: ttl || record.ttl
      };

      // Only add proxied if explicitly provided
      if (proxied !== undefined) {
        updateConfig.proxied = proxied === true;
      }

      // Add type-specific fields
      if (record.type === 'MX' && req.body.priority) {
        updateConfig.priority = parseInt(req.body.priority);
      } else if (record.type === 'SRV') {
        if (req.body.priority) updateConfig.priority = parseInt(req.body.priority);
        if (req.body.weight) updateConfig.weight = parseInt(req.body.weight);
        if (req.body.port) updateConfig.port = parseInt(req.body.port);
      } else if (record.type === 'CAA') {
        if (req.body.flags !== undefined) updateConfig.flags = parseInt(req.body.flags);
        if (req.body.tag) updateConfig.tag = req.body.tag;
      }

      // Update directly
      updatedRecord = await DNSManager.dnsProvider.updateRecord(recordId, updateConfig);

      // Track the record
      DNSManager.recordTracker.trackRecord(updatedRecord);
    }

    // Format the record for response
    const formattedRecord = {
      id: updatedRecord.id,
      type: updatedRecord.type,
      name: updatedRecord.name,
      content: updatedRecord.content || updatedRecord.data || updatedRecord.value,
      ttl: updatedRecord.ttl,
      proxied: updatedRecord.proxied === true,
      managed: true,
      priority: updatedRecord.priority,
      created: updatedRecord.created_on || updatedRecord.created_at || null,
      modified: updatedRecord.modified_on || updatedRecord.updated_at || new Date().toISOString()
    };

    res.json({
      status: 'success',
      message: `Successfully updated ${updatedRecord.type} record for ${updatedRecord.name}`,
      data: formattedRecord
    });
  } catch (error) {
    logger.error(`Error updating DNS record: ${error.message}`);
    throw new ApiError(`Failed to update DNS record: ${error.message}`, 500, 'DNS_UPDATE_ERROR');
  }
});

/**
 * @desc    Delete a DNS record
 * @route   DELETE /api/v1/dns/records/:id
 * @access  Private
 */
const deleteRecord = asyncHandler(async (req, res) => {
  const recordId = req.params.id;

  if (!recordId) {
    throw new ApiError('Record ID is required', 400, 'MISSING_RECORD_ID');
  }

  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker, stateStore } = global;

  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }

  try {
    // Get the record to delete
    let record;

    // Try to get from state store first if available
    if (stateStore) {
      const records = stateStore.getState('dns.records') || [];
      record = records.find(r => r.id === recordId);
    }

    // Fall back to provider cache if not found in state store
    if (!record) {
      const records = await DNSManager.dnsProvider.getRecordsFromCache(false);
      record = records.find(r => r.id === recordId);
    }

    if (!record) {
      throw new ApiError(`Record with ID ${recordId} not found`, 404, 'RECORD_NOT_FOUND');
    }

    // Store record details for response
    const recordDetails = {
      type: record.type,
      name: record.name
    };

    // Use action broker if available
    if (actionBroker) {
      try {
        // Dispatch action to delete record
        await actionBroker.dispatch({
          type: 'DNS_RECORD_DELETE',
          payload: {
            id: recordId
          },
          metadata: {
            source: 'api',
            requestId: req.id,
            userId: req.user?.id || 'system'
          }
        });
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct provider: ${stateError.message}`);

        // Delete directly
        await DNSManager.dnsProvider.deleteRecord(recordId);

        // Untrack the record
        DNSManager.recordTracker.untrackRecord(record);
      }
    } else {
      // Delete directly
      await DNSManager.dnsProvider.deleteRecord(recordId);

      // Untrack the record
      DNSManager.recordTracker.untrackRecord(record);
    }

    res.json({
      status: 'success',
      message: `Successfully deleted ${recordDetails.type} record for ${recordDetails.name}`,
      data: {
        id: recordId,
        ...recordDetails
      }
    });
  } catch (error) {
    logger.error(`Error deleting DNS record: ${error.message}`);
    throw new ApiError(`Failed to delete DNS record: ${error.message}`, 500, 'DNS_DELETE_ERROR');
  }
});

/**
 * @desc    Get orphaned DNS records
 * @route   GET /api/v1/dns/orphaned
 * @access  Private
 */
const getOrphanedRecords = asyncHandler(async (req, res) => {
  // Get DNSManager from global services
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

    // Format records
    const formattedRecords = orphanedRecords.map(record => {
      // Get when it was marked as orphaned
      const orphanedTime = record.orphanedSince || DNSManager.recordTracker.getRecordOrphanedTime(record);
      const formattedTime = typeof orphanedTime === 'string' ? orphanedTime :
                           orphanedTime ? orphanedTime.toISOString() : null;

      // Get grace period info
      const gracePeriod = DNSManager.config.cleanupGracePeriod || 15; // Default 15 minutes
      const now = new Date();
      const orphanedDate = typeof orphanedTime === 'string' ? new Date(orphanedTime) : orphanedTime;
      const elapsedMinutes = orphanedDate ? Math.floor((now - orphanedDate) / (1000 * 60)) : 0;
      const remainingMinutes = Math.max(0, gracePeriod - elapsedMinutes);

      return {
        id: record.id,
        type: record.type,
        name: record.name,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        proxied: record.proxied === true,
        orphanedSince: formattedTime,
        elapsedMinutes,
        remainingMinutes,
        dueForDeletion: elapsedMinutes >= gracePeriod
      };
    });

    res.json({
      status: 'success',
      data: {
        records: formattedRecords,
        count: formattedRecords.length,
        gracePeriod: DNSManager.config.cleanupGracePeriod || 15,
        cleanupEnabled: DNSManager.config.cleanupOrphaned === true
      }
    });
  } catch (error) {
    logger.error(`Error fetching orphaned DNS records: ${error.message}`);
    throw new ApiError(`Failed to fetch orphaned records: ${error.message}`, 500, 'DNS_FETCH_ERROR');
  }
});

/**
 * @desc    Run orphaned records cleanup
 * @route   POST /api/v1/dns/cleanup
 * @access  Private
 */
const runCleanup = asyncHandler(async (req, res) => {
  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker } = global;

  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }

  try {
    // Use action broker if available for state-managed cleanup
    if (actionBroker) {
      try {
        // Dispatch action to run cleanup
        await actionBroker.dispatch({
          type: 'DNS_ORPHANED_CLEANUP',
          metadata: {
            source: 'api',
            requestId: req.id,
            userId: req.user?.id || 'system',
            forceImmediate: true
          }
        });
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct method: ${stateError.message}`);

        // Get active hostnames from all containers (simplified for API implementation)
        const activeHostnames = []; // This should be populated with actual active hostnames

        // Force immediate cleanup
        await DNSManager.cleanupOrphanedRecords(activeHostnames);
      }
    } else {
      // Get active hostnames from all containers (simplified for API implementation)
      const activeHostnames = []; // This should be populated with actual active hostnames

      // Force immediate cleanup
      await DNSManager.cleanupOrphanedRecords(activeHostnames);
    }

    res.json({
      status: 'success',
      message: 'Orphaned records cleanup completed',
      data: {
        cleanupEnabled: DNSManager.config.cleanupOrphaned === true
      }
    });
  } catch (error) {
    logger.error(`Error running orphaned records cleanup: ${error.message}`);
    throw new ApiError(`Failed to run cleanup: ${error.message}`, 500, 'DNS_CLEANUP_ERROR');
  }
});

module.exports = {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getOrphanedRecords,
  runCleanup
};