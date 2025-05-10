/**
 * DNS controller
 * Handles DNS record management endpoints
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../middleware/errorMiddleware');
const logger = require('../../../utils/logger');

/**
 * @desc    Get all DNS records
 * @route   GET /api/v1/dns/records
 * @access  Private
 */
const getRecords = asyncHandler(async (req, res) => {
  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Get records from provider
    const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
    
    // Transform records to a consistent format
    const formattedRecords = records.map(record => {
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
    
    res.json({
      status: 'success',
      data: {
        records: formattedRecords,
        provider: DNSManager.config.dnsProvider,
        domain: DNSManager.config.getProviderDomain()
      }
    });
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
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Create record config
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
    
    // Create the record
    const createdRecord = await DNSManager.dnsProvider.createRecord(recordConfig);
    
    // Track the record
    DNSManager.recordTracker.trackRecord(createdRecord);
    
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
    
    // Create update config
    const updateConfig = {
      ...record,
      content: content || record.content || record.data || record.value,
      ttl: ttl || record.ttl
    };
    
    // Only add proxied if explicitly provided
    if (proxied !== undefined) {
      updateConfig.proxied = proxied === true;
    }
    
    // Add type-specific fields if applicable
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
    
    // Update the record
    const updatedRecord = await DNSManager.dnsProvider.updateRecord(recordId, updateConfig);
    
    // Track the record (will update ID if needed)
    DNSManager.recordTracker.trackRecord(updatedRecord);
    
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
    
    // Store record details for response
    const recordDetails = {
      type: record.type,
      name: record.name
    };
    
    // Delete the record
    await DNSManager.dnsProvider.deleteRecord(recordId);
    
    // Untrack the record
    DNSManager.recordTracker.untrackRecord(record);
    
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
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Get all records
    const records = await DNSManager.dnsProvider.getRecordsFromCache(true);
    
    // Filter to only orphaned records
    const orphanedRecords = records.filter(record => 
      DNSManager.recordTracker.isTracked(record) && 
      DNSManager.recordTracker.isRecordOrphaned(record)
    );
    
    // Format records
    const formattedRecords = orphanedRecords.map(record => {
      // Get when it was marked as orphaned
      const orphanedTime = DNSManager.recordTracker.getRecordOrphanedTime(record);
      const formattedTime = orphanedTime ? orphanedTime.toISOString() : null;
      
      // Get grace period info
      const gracePeriod = DNSManager.config.cleanupGracePeriod || 15; // Default 15 minutes
      const now = new Date();
      const elapsedMinutes = orphanedTime ? Math.floor((now - orphanedTime) / (1000 * 60)) : 0;
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
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Get active hostnames from all containers (simplified for API implementation)
    const activeHostnames = []; // This should be populated with actual active hostnames
    
    // Force immediate cleanup
    const cleanupResult = await DNSManager.cleanupOrphanedRecords(activeHostnames);
    
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