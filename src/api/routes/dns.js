/**
 * src/api/routes/dns.js
 * API routes for DNS operations
 */
const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create router for DNS operations endpoints
 * @param {Object} dnsManager - DNS Manager instance
 * @param {Object} stateManager - State Manager instance
 * @returns {Object} Express router
 */
function createDnsRouter(dnsManager, stateManager) {
  const router = express.Router();
  
  /**
   * GET /api/dns/poll - Trigger a manual poll
   */
  router.get('/poll', async (req, res) => {
    try {
      // Get the current monitor
      let monitor;
      const currentMode = stateManager.getState().mode.current;
      
      if (currentMode === 'traefik') {
        // Use TraefikMonitor if available
        monitor = dnsManager.traefikMonitor;
      } else {
        // Use DirectDNSManager if available
        monitor = dnsManager.directDnsManager;
      }
      
      if (!monitor) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Monitor not available'
        });
      }
      
      // Trigger a poll
      if (currentMode === 'traefik') {
        await monitor.pollTraefikAPI();
      } else {
        await monitor.pollContainers();
      }
      
      logger.info('Manual poll triggered');
      
      res.json({
        success: true,
        message: 'Poll triggered successfully'
      });
    } catch (error) {
      logger.error(`Error triggering poll: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/dns/records - Get current DNS records from provider
   */
  router.get('/records', async (req, res) => {
    try {
      // Get records from the DNS provider
      const records = await dnsManager.dnsProvider.getRecordsFromCache(true);
      
      res.json(records);
    } catch (error) {
      logger.error(`Error getting DNS records: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/dns/hostnames - Get active hostnames
   */
  router.get('/hostnames', async (req, res) => {
    try {
      // Get the current monitor
      let monitor;
      const currentMode = stateManager.getState().mode.current;
      
      if (currentMode === 'traefik') {
        // Use TraefikMonitor if available
        monitor = dnsManager.traefikMonitor;
      } else {
        // Use DirectDNSManager if available
        monitor = dnsManager.directDnsManager;
      }
      
      if (!monitor) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Monitor not available'
        });
      }
      
      // Get hostnames based on the operation mode
      let hostnames = [];
      let containerLabels = {};
      
      if (currentMode === 'traefik') {
        // Get routers from Traefik
        const routers = await monitor.getRouters();
        const result = monitor.processRouters(routers);
        hostnames = result.hostnames;
        containerLabels = result.containerLabels;
      } else {
        // Get hostnames from Docker labels
        const result = monitor.extractHostnamesFromLabels(monitor.lastDockerLabels);
        hostnames = result.hostnames;
        containerLabels = result.containerLabels;
      }
      
      res.json({
        hostnames,
        count: hostnames.length
      });
    } catch (error) {
      logger.error(`Error getting hostnames: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  /**
   * GET /api/dns/check/{hostname} - Check DNS record status
   */
  router.get('/check/:hostname', async (req, res) => {
    try {
      const { hostname } = req.params;
      
      if (!hostname) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'hostname parameter is required'
        });
      }
      
      // Check if hostname exists in DNS records
      const records = await dnsManager.dnsProvider.getRecordsFromCache(false);
      
      // Look for any records that match this hostname
      const matchingRecords = records.filter(record => {
        // Normalize records for comparison
        const recordName = record.name.toLowerCase();
        const checkName = hostname.toLowerCase();
        
        // Check for exact match or matching with domain suffix
        return recordName === checkName || 
               recordName === `${checkName}.` || 
               recordName === `${checkName}.${dnsManager.config.getProviderDomain()}`;
      });
      
      // Check if hostname is in tracked records
      const state = stateManager.getState();
      const isTracked = state.records.tracked.some(record => {
        const recordName = record.name.toLowerCase();
        const checkName = hostname.toLowerCase();
        
        return recordName === checkName || 
               recordName === `${checkName}.` || 
               recordName === `${checkName}.${dnsManager.config.getProviderDomain()}`;
      });
      
      // Check if hostname is in preserved list
      const isPreserved = dnsManager.recordTracker ? 
                        dnsManager.recordTracker.shouldPreserveHostname(hostname) : 
                        false;
      
      res.json({
        hostname,
        exists: matchingRecords.length > 0,
        records: matchingRecords,
        tracked: isTracked,
        preserved: isPreserved
      });
    } catch (error) {
      logger.error(`Error checking hostname: ${error.message}`);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });
  
  return router;
}

module.exports = createDnsRouter;