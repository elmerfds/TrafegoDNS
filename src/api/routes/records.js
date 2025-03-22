/**
 * src/api/routes/records.js
 * API routes for managing DNS records
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for DNS records endpoints
 * @param {Object} dnsManager - DNS Manager instance
 * @param {Object} stateManager - State Manager instance
 * @returns {Object} Express router
 */
function createRecordsRouter(dnsManager, stateManager) {
  const router = express.Router();
  
  /**
   * GET /api/records - Get all tracked DNS records
   */
  router.get('/', (req, res) => {
    try {
      const state = stateManager.getState();
      res.json({
        tracked: state.records.tracked,
        preserved: state.records.preserved,
        managed: state.records.managed
      });
    } catch (error) {
      logger.error(`Error getting records: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/records/tracked - Get tracked DNS records
   */
  router.get('/tracked', (req, res) => {
    try {
      const records = stateManager.getState().records.tracked;
      res.json(records);
    } catch (error) {
      logger.error(`Error getting tracked records: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/records/preserved - Get preserved hostnames
   */
  router.get('/preserved', (req, res) => {
    try {
      const preserved = stateManager.getState().records.preserved;
      res.json(preserved);
    } catch (error) {
      logger.error(`Error getting preserved hostnames: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/preserved - Update preserved hostnames
   */
  router.post('/preserved', (req, res) => {
    try {
      const { hostnames } = req.body;
      
      if (!Array.isArray(hostnames)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'hostnames must be an array'
        });
      }
      
      // Update in state manager
      stateManager.updatePreservedHostnames(hostnames);
      
      // Update in DNS manager
      if (dnsManager.recordTracker) {
        dnsManager.recordTracker.preservedHostnames = hostnames;
      }
      
      logger.info(`Updated preserved hostnames: ${hostnames.join(', ')}`);
      
      res.json({
        success: true,
        preserved: hostnames
      });
    } catch (error) {
      logger.error(`Error updating preserved hostnames: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/records/managed - Get managed hostnames
   */
  router.get('/managed', (req, res) => {
    try {
      const managed = stateManager.getState().records.managed;
      res.json(managed);
    } catch (error) {
      logger.error(`Error getting managed hostnames: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/managed - Update managed hostnames
   */
  router.post('/managed', async (req, res) => {
    try {
      const { hostnames } = req.body;
      
      if (!Array.isArray(hostnames)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'hostnames must be an array'
        });
      }
      
      // Validate each hostname configuration
      for (const config of hostnames) {
        if (!config.hostname || !config.type || !config.content) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Each hostname config must have hostname, type, and content properties'
          });
        }
      }
      
      // Update in state manager
      stateManager.updateManagedHostnames(hostnames);
      
      // Update in DNS manager
      if (dnsManager.recordTracker) {
        dnsManager.recordTracker.managedHostnames = hostnames;
        
        // Process the updated managed hostnames
        await dnsManager.processManagedHostnames();
      }
      
      logger.info(`Updated managed hostnames: ${hostnames.map(h => h.hostname).join(', ')}`);
      
      res.json({
        success: true,
        managed: hostnames
      });
    } catch (error) {
      logger.error(`Error updating managed hostnames: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/create - Create a new DNS record
   */
  router.post('/create', async (req, res) => {
    try {
      const recordConfig = req.body;
      
      // Validate the record configuration
      if (!recordConfig.name || !recordConfig.type || !recordConfig.content) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Record must have name, type, and content properties'
        });
      }
      
      // Create the record via DNS manager
      const record = await dnsManager.dnsProvider.createRecord(recordConfig);
      
      // Track the new record
      if (dnsManager.recordTracker) {
        dnsManager.recordTracker.trackRecord(record);
      }
      
      logger.info(`Created DNS record: ${record.name} (${record.type})`);
      
      res.json({
        success: true,
        record
      });
    } catch (error) {
      logger.error(`Error creating DNS record: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/update - Update a DNS record
   */
  router.post('/update', async (req, res) => {
    try {
      const { id, record } = req.body;
      
      if (!id || !record) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Request must include id and record properties'
        });
      }
      
      // Update the record via DNS manager
      const updatedRecord = await dnsManager.dnsProvider.updateRecord(id, record);
      
      // Update the tracked record
      if (dnsManager.recordTracker) {
        dnsManager.recordTracker.updateRecordId(record, updatedRecord);
      }
      
      logger.info(`Updated DNS record: ${record.name} (${record.type})`);
      
      res.json({
        success: true,
        record: updatedRecord
      });
    } catch (error) {
      logger.error(`Error updating DNS record: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/delete - Delete a DNS record
   */
  router.post('/delete', async (req, res) => {
    try {
      const { id } = req.body;
      
      if (!id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Request must include id property'
        });
      }
      
      // Find the record in tracked records for logging
      const state = stateManager.getState();
      const record = state.records.tracked.find(r => r.id === id);
      
      // Delete the record via DNS manager
      const success = await dnsManager.dnsProvider.deleteRecord(id);
      
      // Untrack the record
      if (dnsManager.recordTracker && record) {
        dnsManager.recordTracker.untrackRecord(record);
      }
      
      if (record) {
        logger.info(`Deleted DNS record: ${record.name} (${record.type})`);
      } else {
        logger.info(`Deleted DNS record with ID: ${id}`);
      }
      
      res.json({
        success: true
      });
    } catch (error) {
      logger.error(`Error deleting DNS record: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * POST /api/records/cleanup - Trigger cleanup of orphaned records
   */
  router.post('/cleanup', async (req, res) => {
    try {
      // Get currently active hostnames
      const active = await dnsManager.getActiveHostnames();
      
      // Trigger cleanup
      await dnsManager.cleanupOrphanedRecords(active);
      
      res.json({
        success: true,
        message: 'Cleanup completed successfully'
      });
    } catch (error) {
      logger.error(`Error during cleanup: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createRecordsRouter;