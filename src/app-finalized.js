// src/app-finalized.js
/**
 * Finalized application entry point for TráfegoDNS 2.0
 * Implements all enhanced components and hot-swapping capabilities
 */
const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');
const DataStore = require('./data/DataStore');
const EnhancedConfigManager = require('./config/EnhancedConfigManager');
const EnhancedProviderFactory = require('./providers/EnhancedProviderFactory');
const ActivityLogger = require('./logs/ActivityLogger');
const EnhancedDNSManager = require('./services/EnhancedDNSManager');
const DockerMonitor = require('./services/DockerMonitor');
const StatusReporter = require('./services/StatusReporter');
const OperationModeSwitcher = require('./services/OperationModeSwitcher');
const EnhancedWebServer = require('./webserver-enhanced');
const EventTypes = require('./events/EventTypes');
const MigrationUtils = require('./utils/migrationUtils');

/**
 * Application startup
 */
async function start() {
  try {
    // Create event bus (central communication)
    const eventBus = new EventBus();
    
    // Create data store
    const dataStore = new DataStore();
    
    // Initialize data store first
    await dataStore.init();
    
    // Initialize enhanced configuration
    const config = new EnhancedConfigManager(dataStore);
    await config.init();
    
    // Initialize activity logger
    const activityLogger = new ActivityLogger(config, dataStore);
    await activityLogger.init();
    
    // Log application startup
    logger.info('🚀 Starting TráfegoDNS 2.0...');
    
    // Initialize DNS provider factory
    const providerFactory = new EnhancedProviderFactory(config, eventBus);
    await providerFactory.init();
    
    // Initialize Docker monitor
    const dockerMonitor = new DockerMonitor(config, eventBus);
    
    // Initialize DNS manager
    const dnsManager = new EnhancedDNSManager(
      config, 
      eventBus, 
      providerFactory,
      dataStore,
      activityLogger
    );
    await dnsManager.init();
    
    // Initialize operation mode switcher
    const operationModeSwitcher = new OperationModeSwitcher(
      config,
      eventBus,
      dnsManager
    );
    await operationModeSwitcher.init(dockerMonitor);
    
    // Initialize status reporter
    const statusReporter = new StatusReporter(config, eventBus, dnsManager.recordTracker);
    
    // Add global stats counter for tracking operations
    global.statsCounter = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0
    };
    
    // Display startup information
    await statusReporter.displaySettings();
    
    // Run migration if needed
    const migrationResults = await MigrationUtils.migrateFromEnvVars(config, dataStore);
    if (migrationResults.totalMigrated > 0) {
      logger.info(`Migration completed: ${migrationResults.totalMigrated} items migrated, ${migrationResults.errors.length} errors`);
    }
    
    // Start watching Docker events
    if (config.watchDockerEvents) {
      await dockerMonitor.startWatching();
    }
    
    // Initialize web server if enabled
    if (process.env.ENABLE_WEB_UI === 'true') {
      logger.info('Initializing Web UI...');
      const webServer = new EnhancedWebServer(
        config, 
        eventBus, 
        dnsManager,
        dataStore,
        activityLogger
      );
      await webServer.start();
      
      // Store web server reference for graceful shutdown
      global.webServer = webServer;
    }
    
    // Set up graceful shutdown
    setupGracefulShutdown({
      eventBus,
      dataStore,
      config,
      activityLogger,
      providerFactory,
      dnsManager,
      operationModeSwitcher,
      dockerMonitor
    });
    
    logger.complete('TráfegoDNS 2.0 running successfully');
    
    // Publish status update
    eventBus.publish(EventTypes.STATUS_UPDATE, {
      type: 'success',
      message: 'TráfegoDNS 2.0 running successfully'
    });
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown
 */
function setupGracefulShutdown(components) {
  const shutdownHandler = async () => {
    logger.info('Shutting down TráfegoDNS...');
    
    try {
      // Stop operation mode switcher (which stops the active monitor)
      if (components.operationModeSwitcher) {
        await components.operationModeSwitcher.shutdown();
      }
      
      if (components.dockerMonitor) {
        components.dockerMonitor.stopWatching();
      }
      
      // Shut down web server if it exists
      if (global.webServer) {
        await global.webServer.stop();
      }
      
      // Shut down activity logger
      if (components.activityLogger) {
        await components.activityLogger.shutdown();
      }
      
      // Shut down provider factory
      if (components.providerFactory) {
        await components.providerFactory.shutdown();
      }
      
      // Log final message
      logger.info('TráfegoDNS shut down successfully');
    } catch (error) {
      logger.error(`Error during shutdown: ${error.message}`);
    } finally {
      process.exit(0);
    }
  };
  
  // Register shutdown handlers
  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
}

// Start the application
start();