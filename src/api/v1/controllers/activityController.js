/**
 * Activity controller
 * Handles recent activity feed endpoints
 */
const asyncHandler = require('express-async-handler');
const { ApiError } = require('../../../utils/apiError');
const logger = require('../../../utils/logger');

/**
 * @desc    Get recent activity feed
 * @route   GET /api/v1/activity/recent
 * @access  Private
 */
const getRecentActivity = asyncHandler(async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    
    // Get database from the database module
    const database = require('../../../database');
    
    if (!database.isInitialized() || !database.db) {
      throw new ApiError('Database not initialized', 500, 'DB_NOT_INITIALIZED');
    }
    
    const activities = [];
    
    // Get recent DNS record activities (created/updated)
    try {
      // Check if we have DNS provider and can get records
      const { DNSManager } = global.services || {};
      if (DNSManager && DNSManager.dnsProvider) {
        const recentRecords = await DNSManager.dnsProvider.getRecordsFromCache(false);
        
        // Convert recent records to activities (limit to last 10 for performance)
        const sortedRecords = recentRecords
          .filter(record => record.created_on || record.created_at || record.modified_on || record.updated_at)
          .sort((a, b) => {
            const dateA = new Date(a.modified_on || a.updated_at || a.created_on || a.created_at);
            const dateB = new Date(b.modified_on || b.updated_at || b.created_on || b.created_at);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, 10);
        
        sortedRecords.forEach(record => {
          const timestamp = record.modified_on || record.updated_at || record.created_on || record.created_at;
          const isUpdate = (record.modified_on || record.updated_at) && 
                          (record.created_on || record.created_at) && 
                          new Date(record.modified_on || record.updated_at).getTime() > 
                          new Date(record.created_on || record.created_at).getTime();
          
          activities.push({
            type: isUpdate ? 'updated' : 'created',
            recordType: record.type,
            hostname: record.name,
            timestamp: timestamp,
            details: `${record.type} record for ${record.name}`,
            source: 'dns'
          });
        });
      }
    } catch (error) {
      logger.warn(`Failed to get DNS records for activity: ${error.message}`);
    }
    
    // Get recent orphaned record deletions from history
    try {
      const historyQuery = `
        SELECT 
          type,
          name,
          deleted_at,
          deletion_reason
        FROM orphaned_records_history 
        ORDER BY deleted_at DESC
        LIMIT 15
      `;
      
      const historyRecords = await database.db.all(historyQuery);
      
      historyRecords.forEach(record => {
        activities.push({
          type: 'deleted',
          recordType: record.type,
          hostname: record.name,
          timestamp: record.deleted_at,
          details: `${record.type} record deleted - ${record.deletion_reason || 'Cleanup'}`,
          source: 'orphaned'
        });
      });
    } catch (error) {
      logger.warn(`Failed to get orphaned history for activity: ${error.message}`);
    }
    
    // Get recent hostname activities from tracked records
    try {
      const trackedQuery = `
        SELECT 
          name as hostname,
          type as record_type,
          updated_at,
          tracked_at as created_at,
          metadata
        FROM dns_tracked_records 
        WHERE updated_at IS NOT NULL OR tracked_at IS NOT NULL
        ORDER BY 
          COALESCE(updated_at, tracked_at) DESC
        LIMIT 10
      `;
      
      const trackedRecords = await database.db.all(trackedQuery);
      
      trackedRecords.forEach(record => {
        const timestamp = record.updated_at || record.created_at;
        const isUpdate = record.updated_at && record.created_at && 
                        new Date(record.updated_at).getTime() > new Date(record.created_at).getTime();
        
        // Check if record is managed (from metadata if available)
        let isManaged = false;
        try {
          if (record.metadata) {
            const metadata = JSON.parse(record.metadata);
            isManaged = metadata.appManaged === true;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
        
        activities.push({
          type: isUpdate ? 'managed' : 'tracked',
          recordType: record.record_type || 'DNS',
          hostname: record.hostname,
          timestamp: timestamp,
          details: `${isManaged ? 'Managed' : 'Tracked'} hostname ${isUpdate ? 'updated' : 'added'}`,
          source: isManaged ? 'managed' : 'tracked'
        });
      });
    } catch (error) {
      logger.warn(`Failed to get tracked records for activity: ${error.message}`);
    }
    
    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Take only the requested number of activities
    const recentActivities = activities.slice(0, parsedLimit);
    
    // Add IDs and format
    const formattedActivities = recentActivities.map((activity, index) => ({
      id: `activity-${Date.now()}-${index}`,
      ...activity,
      timestamp: new Date(activity.timestamp).toISOString()
    }));
    
    res.status(200).json({
      status: 'success',
      data: {
        activities: formattedActivities,
        totalReturned: formattedActivities.length,
        limit: parsedLimit
      }
    });
    
  } catch (error) {
    logger.error(`Error getting recent activity: ${error.message}`);
    throw new ApiError('Failed to retrieve recent activity', 500, 'ACTIVITY_FETCH_ERROR');
  }
});

module.exports = {
  getRecentActivity
};