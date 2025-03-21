// src/integrationFixes.js
// Integration script to fix the dataStore issues

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const logger = require('./utils/logger');
const EnhancedApiRoutes = require('./api/enhancedApiRoutes');
const EnhancedWebServer = require('./webserver-enhanced');
const EnhancedRecordTracker = require('./utils/enhancedRecordTracker');

/**
 * Apply fixes to an existing application instance
 * @param {Object} app - The application instance
 */
async function applyFixes(app) {
  logger.info('Applying TráfegoDNS integration fixes...');
  
  try {
    // Extract components from the app
    const config = app.config;
    const eventBus = app.eventBus;
    const dnsManager = app.dnsManager;
    const dataStore = app.dataStore;
    const activityLogger = app.activityLogger;
    
    // Create enhanced record tracker
    const enhancedRecordTracker = new EnhancedRecordTracker(config, dataStore);
    await enhancedRecordTracker.init();
    
    // Inject enhanced record tracker into DNS manager
    if (dnsManager) {
      logger.info('Injecting enhanced record tracker into DNS manager');
      dnsManager.recordTracker = enhancedRecordTracker;
    }
    
    // Create enhanced web server
    logger.info('Creating enhanced web server');
    const enhancedWebServer = new EnhancedWebServer(
      config,
      eventBus,
      dnsManager,
      dataStore,
      activityLogger
    );
    
    // Store references to enhanced components
    app.enhancedRecordTracker = enhancedRecordTracker;
    app.enhancedWebServer = enhancedWebServer;
    
    logger.success('TráfegoDNS integration fixes applied successfully');
    
    return {
      enhancedRecordTracker,
      enhancedWebServer
    };
  } catch (error) {
    logger.error(`Failed to apply integration fixes: ${error.message}`);
    throw error;
  }
}

/**
 * Replace the default web server with our enhanced version
 * @param {Object} app - The application instance
 */
async function replaceWebServer(app) {
  logger.info('Replacing default web server with enhanced version...');
  
  try {
    // Stop existing web server if running
    if (app.webServer) {
      logger.info('Stopping existing web server');
      await app.webServer.stop();
    }
    
    // Start enhanced web server
    logger.info('Starting enhanced web server');
    await app.enhancedWebServer.start();
    
    // Replace reference in app
    app.webServer = app.enhancedWebServer;
    
    logger.success('Web server replaced successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to replace web server: ${error.message}`);
    throw error;
  }
}

/**
 * Standalone function to initialize minimal components for testing
 */
async function createStandaloneWebServer() {
  logger.info('Creating standalone web server for testing...');
  
  try {
    // Create minimal components
    const config = {
      dnsProvider: 'cloudflare',
      getProviderDomain: () => 'example.com',
      getPublicIPSync: () => '127.0.0.1',
      getPublicIPv6Sync: () => null,
      cleanupOrphaned: false,
      operationMode: 'direct',
      traefikApiUrl: 'http://traefik:8080/api',
      pollInterval: 60000,
      ipRefreshInterval: 3600000,
      cacheRefreshInterval: 3600000
    };
    
    const eventBus = {
      publish: (event, data) => {
        logger.debug(`Event published: ${event}`);
      }
    };
    
    const dnsProvider = {
      recordCache: {
        lastUpdated: Date.now(),
        records: []
      },
      getRecordsFromCache: async () => []
    };
    
    const dnsManager = {
      dnsProvider
    };
    
    // Create enhanced record tracker
    const enhancedRecordTracker = new EnhancedRecordTracker(config);
    await enhancedRecordTracker.init();
    
    // Inject record tracker into DNS manager
    dnsManager.recordTracker = enhancedRecordTracker;
    
    // Create enhanced web server
    const enhancedWebServer = new EnhancedWebServer(
      config,
      eventBus,
      dnsManager
    );
    
    // Start web server
    await enhancedWebServer.start();
    
    logger.success('Standalone web server created successfully');
    
    return {
      config,
      eventBus,
      dnsManager,
      enhancedRecordTracker,
      enhancedWebServer
    };
  } catch (error) {
    logger.error(`Failed to create standalone web server: ${error.message}`);
    throw error;
  }
}

module.exports = {
  applyFixes,
  replaceWebServer,
  createStandaloneWebServer
};