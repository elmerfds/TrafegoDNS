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
      const isTracked = DNSManager.recordTracker.isTracked(record);
      const isOrphaned = isTracked && DNSManager.recordTracker.isRecordOrphaned(record);
      
      return {
        id: record.id,
        hostname: record.name,
        type: record.type,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        priority: record.priority,
        provider: DNSManager.config.dnsProvider,
        isManaged: isTracked,
        isOrphaned: isOrphaned,
        createdAt: record.created_on || record.created_at || new Date().toISOString(),
        updatedAt: record.modified_on || record.updated_at || new Date().toISOString()
      };
    });

    // Apply filters if provided
    if (type) {
      formattedRecords = formattedRecords.filter(record =>
        record.type.toLowerCase() === type.toLowerCase());
    }

    if (name) {
      formattedRecords = formattedRecords.filter(record =>
        record.hostname.toLowerCase().includes(name.toLowerCase()));
    }

    if (managed !== undefined) {
      const isManaged = managed === 'true';
      formattedRecords = formattedRecords.filter(record => record.isManaged === isManaged);
    }
    
    // Sort by creation date (newest first) by default
    formattedRecords.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });

    // Get pagination parameters
    const paginationParams = getPaginationParams(req.query);

    // Get pagination parameters and apply pagination
    const { page, limit, offset } = paginationParams;
    const total = formattedRecords.length;
    const paginatedRecords = formattedRecords.slice(offset, offset + limit);

    // Return expected structure
    const response = {
      status: 'success',
      data: {
        records: paginatedRecords,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      provider: DNSManager.config.dnsProvider,
      domain: DNSManager.config.getProviderDomain()
    };

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
  const { stateStore } = global;
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Try to get from state store first if available
    let record;
    
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
    
    // If still not found, check orphaned records in database
    if (!record) {
      logger.info(`Record ${recordId} not found in cache, checking database for orphaned records...`);
      const database = require('../../../database');
      if (database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.managedRecords) {
        try {
          // Try to find in managed records by provider record ID
          const managedRecords = await database.repositories.dnsManager.managedRecords.findAll();
          logger.info(`Found ${managedRecords.length} total managed records in database`);
          
          const orphanedRecord = managedRecords.find(r => {
            const matches = (r.providerId === recordId || r.record_id === recordId);
            if (matches) {
              logger.info(`Found matching record: ${r.name} (${r.type}) - orphaned: ${r.is_orphaned}, isOrphaned: ${r.isOrphaned}`);
            }
            return matches;
          });
          
          if (orphanedRecord) {
            logger.info(`Found orphaned record in database: ${orphanedRecord.name}`);
            record = {
              id: orphanedRecord.providerId || orphanedRecord.record_id,
              type: orphanedRecord.type,
              name: orphanedRecord.name,
              content: orphanedRecord.content,
              provider: orphanedRecord.provider
            };
          } else {
            logger.warn(`No matching record found in database for ID: ${recordId}`);
          }
        } catch (dbError) {
          logger.error(`Failed to check orphaned records: ${dbError.message}`);
        }
      } else {
        logger.warn('Database repositories not available to check for orphaned records');
      }
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
        try {
          await DNSManager.dnsProvider.deleteRecord(recordId);
        } catch (deleteError) {
          // If the record doesn't exist at provider, that's OK - continue to untrack
          logger.warn(`Provider delete failed (record may already be gone): ${deleteError.message}`);
        }
        
        // Untrack the record regardless
        await DNSManager.recordTracker.untrackRecord(record);
      }
    } else {
      // Delete directly
      try {
        await DNSManager.dnsProvider.deleteRecord(recordId);
      } catch (deleteError) {
        // If the record doesn't exist at provider, that's OK - continue to untrack
        logger.warn(`Provider delete failed (record may already be gone): ${deleteError.message}`);
      }
      
      // Untrack the record regardless
      await DNSManager.recordTracker.untrackRecord(record);
    }
    
    // Also remove from managed records if it exists there
    const database = require('../../../database');
    if (database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.managedRecords) {
      try {
        await database.repositories.dnsManager.managedRecords.untrackRecord(
          record.provider || DNSManager.config.dnsProvider,
          recordId
        );
        logger.info(`Removed record from managed records database`);
      } catch (dbError) {
        logger.warn(`Failed to remove from managed records: ${dbError.message}`);
      }
    }
    
    // Also ensure the record is removed from the provider cache
    if (database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.providerCache) {
      try {
        await database.repositories.dnsManager.providerCache.deleteRecord(
          record.provider || DNSManager.config.dnsProvider,
          recordId
        );
        logger.info(`Removed record from provider cache`);
      } catch (cacheError) {
        logger.warn(`Failed to remove from provider cache: ${cacheError.message}`);
      }
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
 * @desc    Get orphaned DNS records history
 * @route   GET /api/v1/dns/orphaned/history
 * @access  Private
 */
const getOrphanedRecordsHistory = asyncHandler(async (req, res) => {
  // Get database from the database module
  const database = require('../../../database');
  
  if (!database.isInitialized() || !database.db) {
    throw new ApiError('Database not initialized', 500, 'DB_NOT_INITIALIZED');
  }
  
  try {
    // Get pagination parameters
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    // Query for historical orphaned records from the dedicated history table
    const historyQuery = `
      SELECT 
        id,
        provider,
        record_id,
        type,
        name,
        content,
        ttl,
        proxied,
        orphaned_at,
        deleted_at,
        grace_period_seconds,
        deletion_reason,
        metadata,
        created_at
      FROM orphaned_records_history 
      ORDER BY deleted_at DESC
      LIMIT ? OFFSET ?
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orphaned_records_history
    `;
    
    const [records, countResult] = await Promise.all([
      database.db.all(historyQuery, [limit, offset]),
      database.db.get(countQuery)
    ]);
    
    // Format the records
    const formattedRecords = records.map(record => {
      let metadata = {};
      try {
        metadata = record.metadata ? JSON.parse(record.metadata) : {};
      } catch (e) {
        metadata = {};
      }
      
      return {
        id: record.record_id,
        historyId: record.id,
        hostname: record.name,
        type: record.type,
        content: record.content,
        ttl: record.ttl,
        proxied: Boolean(record.proxied),
        provider: record.provider,
        orphanedAt: record.orphaned_at,
        deletedAt: record.deleted_at,
        gracePeriodSeconds: record.grace_period_seconds,
        deletionReason: record.deletion_reason,
        createdAt: record.created_at,
        metadata: metadata
      };
    });
    
    const total = countResult ? countResult.total : 0;
    const totalPages = Math.ceil(total / limit);
    
    res.status(200).json({
      status: 'success',
      data: {
        records: formattedRecords,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages
        }
      }
    });
  } catch (error) {
    logger.error(`Error getting orphaned records history: ${error.message}`);
    throw new ApiError('Failed to get orphaned records history', 500, 'ORPHANED_HISTORY_ERROR');
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
    // Get orphaned records from database
    let orphanedRecords = [];
    
    // Check if database repository is available
    const database = require('../../../database');
    if (database && database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.managedRecords) {
      // Get orphaned records directly from database
      const provider = DNSManager.config.dnsProvider;
      const dbOrphanedRecords = await database.repositories.dnsManager.managedRecords.getRecords(provider, { isOrphaned: true });
      
      // Get current records from provider to verify they still exist
      const providerRecords = await DNSManager.dnsProvider.getRecordsFromCache(true);
      const providerRecordIds = new Set(providerRecords.map(r => r.id));
      
      // Filter out records that no longer exist at the provider
      orphanedRecords = dbOrphanedRecords.filter(record => {
        const recordId = record.providerId || record.record_id;
        if (!providerRecordIds.has(recordId)) {
          logger.debug(`Orphaned record ${record.name} (ID: ${recordId}) no longer exists at provider, excluding from results`);
          return false;
        }
        return true;
      });
      
      // Update orphaned_at for any records that don't have it
      for (const record of orphanedRecords) {
        // Check both camelCase and snake_case versions
        const hasOrphanedAt = record.orphanedAt || record.orphaned_at;
        const isOrphaned = record.isOrphaned || record.is_orphaned;
        
        if (!hasOrphanedAt && isOrphaned) {
          logger.warn(`Orphaned record ${record.name} has no orphaned_at timestamp, setting to current time`);
          const now = new Date().toISOString();
          await database.repositories.dnsManager.managedRecords.db.run(`
            UPDATE dns_tracked_records 
            SET orphaned_at = ? 
            WHERE provider = ? AND record_id = ?
          `, [now, provider, record.providerId || record.record_id]);
          // Update both formats for consistency
          record.orphanedAt = now;
          record.orphaned_at = now;
        }
      }
    } else {
      // Fallback to old method using cache and tracker
      const allRecords = await DNSManager.dnsProvider.getRecordsFromCache(true);
      
      // Filter to only orphaned records using the record tracker
      for (const record of allRecords) {
        const isTracked = await DNSManager.recordTracker.isTracked(record);
        if (isTracked) {
          const isOrphaned = await DNSManager.recordTracker.isRecordOrphaned(record);
          if (isOrphaned) {
            orphanedRecords.push(record);
          }
        }
      }
    }
    
    // Format records
    const formattedRecords = await Promise.all(orphanedRecords.map(async record => {
      // Get when it was marked as orphaned
      let formattedTime = null;
      
      // If record has orphaned_at from database, use it
      // Note: The database repository returns this as 'orphanedAt' (camelCase)
      if (record.orphanedAt) {
        formattedTime = record.orphanedAt;
      } else if (record.orphaned_at) {
        formattedTime = record.orphaned_at;
      } else if (record.orphanedSince) {
        formattedTime = record.orphanedSince;
      } else if (DNSManager.recordTracker) {
        // Fallback to tracker
        formattedTime = await DNSManager.recordTracker.getRecordOrphanedTime(record);
      }
      
      // Get grace period info
      const gracePeriod = DNSManager.config.cleanupGracePeriod || 15; // Default 15 minutes
      const now = new Date();
      let orphanedDate = null;
      
      // Parse orphaned date
      if (formattedTime) {
        orphanedDate = new Date(formattedTime);
        // Validate the date
        if (isNaN(orphanedDate.getTime())) {
          orphanedDate = null;
        }
      }
      
      const elapsedMinutes = orphanedDate ? Math.floor((now - orphanedDate) / (1000 * 60)) : null;
      const remainingMinutes = elapsedMinutes !== null ? Math.max(0, gracePeriod - elapsedMinutes) : null;
      
      return {
        id: record.providerId || record.record_id || record.id,
        type: record.type,
        name: record.name,
        content: record.content || record.data || record.value,
        ttl: record.ttl,
        proxied: record.proxied === true || record.proxied === 1,
        orphanedSince: formattedTime,
        elapsedMinutes,
        remainingMinutes,
        dueForDeletion: elapsedMinutes !== null ? elapsedMinutes >= gracePeriod : false
      };
    }));
    
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
        
        // Force immediate cleanup (true = ignore grace period)
        await DNSManager.cleanupOrphanedRecords(true);
      }
    } else {
      // Force immediate cleanup (true = ignore grace period)
      await DNSManager.cleanupOrphanedRecords(true);
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

/**
 * @desc    Refresh DNS records from provider
 * @route   POST /api/v1/dns/refresh
 * @access  Private
 */
const refreshRecords = asyncHandler(async (req, res) => {
  // Get DNSManager from global services
  const { DNSManager } = global.services || {};
  const { actionBroker } = global;
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  try {
    // Use action broker if available
    if (actionBroker) {
      try {
        // Dispatch action to refresh DNS
        await actionBroker.dispatch({
          type: 'DNS_REFRESH',
          metadata: {
            source: 'api',
            requestId: req.id,
            userId: req.user?.id || 'system'
          }
        });
      } catch (stateError) {
        logger.warn(`State action failed, falling back to direct provider: ${stateError.message}`);
        // Fallback to direct refresh
        await DNSManager.refreshRecords();
      }
    } else {
      // Direct refresh
      await DNSManager.refreshRecords();
    }
    
    res.json({
      status: 'success',
      message: 'DNS records refreshed successfully'
    });
  } catch (error) {
    logger.error(`Error refreshing DNS records: ${error.message}`);
    throw new ApiError(`Failed to refresh DNS records: ${error.message}`, 500, 'DNS_REFRESH_ERROR');
  }
});

/**
 * @desc    Process hostnames and update DNS records
 * @route   POST /api/v1/dns/process
 * @access  Private
 */
const processRecords = asyncHandler(async (req, res) => {
  // Get services from global
  const { Monitor } = global.services || {};
  
  if (!Monitor) {
    throw new ApiError('Monitor service not initialized', 500, 'MONITOR_NOT_INITIALIZED');
  }
  
  try {
    const forceUpdate = req.body.force === true;
    
    // Process results tracking
    const results = {
      created: 0,
      updated: 0,
      deleted: 0,
      orphaned: 0,
      total: 0
    };
    
    // Force a poll of Traefik if it's a Traefik monitor
    if (Monitor.pollTraefik && typeof Monitor.pollTraefik === 'function') {
      await Monitor.pollTraefik(true);
      logger.info('Traefik routes polled successfully');
    }
    
    // Process hostnames if available
    if (Monitor.processHostnames && typeof Monitor.processHostnames === 'function') {
      const processingResult = await Monitor.processHostnames(forceUpdate);
      logger.info('Hostnames processed successfully');
      
      // Merge results if available
      if (processingResult && typeof processingResult === 'object') {
        results.created = processingResult.created || 0;
        results.updated = processingResult.updated || 0;
        results.orphaned = processingResult.orphaned || 0;
        results.total = processingResult.total || 0;
      }
    } else {
      throw new ApiError('Hostname processing not available', 500, 'PROCESS_NOT_AVAILABLE');
    }
    
    res.json({
      status: 'success',
      message: 'DNS records processed successfully',
      data: results
    });
  } catch (error) {
    logger.error(`Error processing DNS records: ${error.message}`);
    throw new ApiError(`Failed to process DNS records: ${error.message}`, 500, 'DNS_PROCESS_ERROR');
  }
});

/**
 * @desc    Delete orphaned DNS records respecting grace period
 * @route   POST /api/v1/dns/orphaned/delete-expired
 * @access  Private
 */
const deleteExpiredOrphanedRecords = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  const database = require('../../../database');
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  if (!database || !database.isInitialized()) {
    throw new ApiError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
  }
  
  try {
    const deletedRecords = [];
    const errors = [];
    const gracePeriodMinutes = DNSManager.config.cleanupGracePeriod || 15;
    const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
    const now = new Date();
    
    // Get all orphaned records from the database
    if (database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.managedRecords) {
      const orphanedRecords = await database.repositories.dnsManager.managedRecords.findAll({
        where: { is_orphaned: 1 }
      });
      
      logger.info(`Found ${orphanedRecords.length} orphaned records to check for deletion`);
      
      for (const record of orphanedRecords) {
        try {
          // Check if grace period has expired
          if (record.orphanedAt) {
            const orphanedDate = new Date(record.orphanedAt);
            const elapsedMs = now - orphanedDate;
            
            if (elapsedMs >= gracePeriodMs) {
              // Grace period expired, delete the record
              if (record.providerId) {
                try {
                  await DNSManager.dnsProvider.deleteRecord(record.providerId);
                  logger.info(`Deleted expired orphaned record from provider: ${record.name} (${record.type})`);
                } catch (providerError) {
                  // Record might already be deleted from provider
                  logger.warn(`Could not delete from provider (may already be gone): ${providerError.message}`);
                }
              }
              
              // Remove from tracking database
              await database.repositories.dnsManager.managedRecords.untrackRecord(
                record.provider || DNSManager.config.dnsProvider,
                record.providerId
              );
              
              deletedRecords.push({
                name: record.name,
                type: record.type,
                id: record.providerId,
                orphanedMinutes: Math.floor(elapsedMs / 60000)
              });
              
              logger.info(`Deleted expired orphaned record: ${record.name} (${record.type}) - orphaned for ${Math.floor(elapsedMs / 60000)} minutes`);
            }
          }
        } catch (error) {
          logger.error(`Failed to delete record ${record.name}: ${error.message}`);
          errors.push({
            record: `${record.name} (${record.type})`,
            error: error.message
          });
        }
      }
    }
    
    res.json({
      status: 'success',
      message: `Deleted ${deletedRecords.length} expired orphaned records`,
      data: {
        deleted: deletedRecords,
        errors: errors,
        totalDeleted: deletedRecords.length,
        totalErrors: errors.length,
        gracePeriodMinutes: gracePeriodMinutes
      }
    });
  } catch (error) {
    logger.error(`Error deleting expired orphaned records: ${error.message}`);
    throw new ApiError(`Failed to delete expired orphaned records: ${error.message}`, 500, 'DELETE_EXPIRED_ERROR');
  }
});

/**
 * @desc    Force delete orphaned DNS records
 * @route   POST /api/v1/dns/orphaned/force-delete
 * @access  Private (Admin only)
 */
const forceDeleteOrphanedRecords = asyncHandler(async (req, res) => {
  const { DNSManager } = global.services || {};
  const database = require('../../../database');
  
  if (!DNSManager || !DNSManager.dnsProvider) {
    throw new ApiError('DNS provider not initialized', 500, 'DNS_PROVIDER_NOT_INITIALIZED');
  }
  
  if (!database || !database.isInitialized()) {
    throw new ApiError('Database not initialized', 500, 'DATABASE_NOT_INITIALIZED');
  }
  
  try {
    const deletedRecords = [];
    const errors = [];
    
    // Get all orphaned records from the database
    if (database.repositories && database.repositories.dnsManager && database.repositories.dnsManager.managedRecords) {
      const orphanedRecords = await database.repositories.dnsManager.managedRecords.findAll({
        where: { is_orphaned: 1 }
      });
      
      logger.info(`Found ${orphanedRecords.length} orphaned records to force delete`);
      
      for (const record of orphanedRecords) {
        try {
          // Try to delete from provider
          if (record.providerId) {
            try {
              await DNSManager.dnsProvider.deleteRecord(record.providerId);
              logger.info(`Deleted orphaned record from provider: ${record.name} (${record.type})`);
            } catch (providerError) {
              // Record might already be deleted from provider
              logger.warn(`Could not delete from provider (may already be gone): ${providerError.message}`);
            }
          }
          
          // Remove from tracking database
          await database.repositories.dnsManager.managedRecords.untrackRecord(
            record.provider || DNSManager.config.dnsProvider,
            record.providerId
          );
          
          deletedRecords.push({
            name: record.name,
            type: record.type,
            id: record.providerId
          });
          
          logger.info(`Force deleted orphaned record: ${record.name} (${record.type})`);
        } catch (error) {
          logger.error(`Failed to force delete record ${record.name}: ${error.message}`);
          errors.push({
            record: `${record.name} (${record.type})`,
            error: error.message
          });
        }
      }
    }
    
    res.json({
      status: 'success',
      message: `Force deleted ${deletedRecords.length} orphaned records`,
      data: {
        deleted: deletedRecords,
        errors: errors,
        totalDeleted: deletedRecords.length,
        totalErrors: errors.length
      }
    });
  } catch (error) {
    logger.error(`Error force deleting orphaned records: ${error.message}`);
    throw new ApiError(`Failed to force delete orphaned records: ${error.message}`, 500, 'FORCE_DELETE_ERROR');
  }
});

/**
 * @desc    Delete a single orphaned record from history
 * @route   DELETE /api/v1/dns/orphaned/history/:id
 * @access  Private
 */
const deleteOrphanedHistoryRecord = asyncHandler(async (req, res) => {
  const historyId = req.params.id;
  
  if (!historyId) {
    throw new ApiError('History record ID is required', 400, 'MISSING_HISTORY_ID');
  }
  
  // Get database from the database module
  const database = require('../../../database');
  
  if (!database.isInitialized() || !database.db) {
    throw new ApiError('Database not initialized', 500, 'DB_NOT_INITIALIZED');
  }
  
  try {
    // First check if the record exists
    const checkQuery = `
      SELECT id, name, type
      FROM orphaned_records_history 
      WHERE id = ?
    `;
    
    const existingRecord = await database.db.get(checkQuery, [historyId]);
    
    if (!existingRecord) {
      throw new ApiError('History record not found', 404, 'HISTORY_RECORD_NOT_FOUND');
    }
    
    // Delete the record
    const deleteQuery = `
      DELETE FROM orphaned_records_history 
      WHERE id = ?
    `;
    
    const result = await database.db.run(deleteQuery, [historyId]);
    
    if (result.changes === 0) {
      throw new ApiError('Failed to delete history record', 500, 'DELETE_FAILED');
    }
    
    logger.info(`Deleted orphaned history record: ${existingRecord.name} (${existingRecord.type})`);
    
    res.status(200).json({
      status: 'success',
      message: `Successfully deleted history record for ${existingRecord.name}`,
      data: {
        deletedRecord: {
          id: historyId,
          name: existingRecord.name,
          type: existingRecord.type
        }
      }
    });
  } catch (error) {
    logger.error(`Error deleting orphaned history record: ${error.message}`);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Failed to delete history record', 500, 'DELETE_HISTORY_ERROR');
  }
});

/**
 * @desc    Clear all orphaned records history
 * @route   DELETE /api/v1/dns/orphaned/history
 * @access  Private
 */
const clearOrphanedHistory = asyncHandler(async (req, res) => {
  // Get database from the database module
  const database = require('../../../database');
  
  if (!database.isInitialized() || !database.db) {
    throw new ApiError('Database not initialized', 500, 'DB_NOT_INITIALIZED');
  }
  
  try {
    // First get count of records to be deleted
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orphaned_records_history
    `;
    
    const countResult = await database.db.get(countQuery);
    const totalRecords = countResult ? countResult.total : 0;
    
    if (totalRecords === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No history records to clear',
        data: {
          deletedCount: 0
        }
      });
    }
    
    // Delete all records
    const deleteQuery = `
      DELETE FROM orphaned_records_history
    `;
    
    const result = await database.db.run(deleteQuery);
    
    logger.info(`Cleared orphaned records history: ${result.changes} records deleted`);
    
    res.status(200).json({
      status: 'success',
      message: `Successfully cleared orphaned records history`,
      data: {
        deletedCount: result.changes
      }
    });
  } catch (error) {
    logger.error(`Error clearing orphaned history: ${error.message}`);
    throw new ApiError('Failed to clear orphaned records history', 500, 'CLEAR_HISTORY_ERROR');
  }
});

module.exports = {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getOrphanedRecords,
  getOrphanedRecordsHistory,
  deleteOrphanedHistoryRecord,
  clearOrphanedHistory,
  runCleanup,
  refreshRecords,
  processRecords,
  deleteExpiredOrphanedRecords,
  forceDeleteOrphanedRecords
};