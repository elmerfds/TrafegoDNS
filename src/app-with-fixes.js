// src/app-with-fixes.js
// Enhanced application entry point with fixes for DataStore issues

const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');
const DataStore = require('./data/DataStore');
const EnhancedConfigManager = require('./config/EnhancedConfigManager');
const EnhancedProviderFactory = require('./providers/EnhancedProviderFactory');
const ActivityLogger = require('./logs/ActivityLogger');
const EnhancedRecordTracker = require('./utils/enhancedRecordTracker');
const EnhancedWebServer = require('./webserver-enhanced');
const { DNSManager, TraefikMonitor, DockerMonitor, StatusReporter, DirectDNSManager } = require('./services');
const EventTypes = require('./events/EventTypes');

/**
 * Enhanced application startup with DataStore fixes
 */
async function start() {
  try {
    // Create event bus (central communication)
    const eventBus = new EventBus();
    
    // Create data store
    const dataStore = new DataStore();
    
    // Initialize enhanced configuration
    const config = new EnhancedConfigManager(dataStore);
    
    // Initialize activity logger
    const activityLogger = new ActivityLogger(config, dataStore);
    
    // Initialize DNS provider factory
    const providerFactory = new EnhancedProviderFactory(config, eventBus);
    
    // Initialize services
    const statusReporter = new StatusReporter(config, eventBus);
    const dockerMonitor = new DockerMonitor(config, eventBus);
    
    // Initialize enhanced record tracker
    const recordTracker = new EnhancedRecordTracker(config, dataStore);
    
    // Initialize components
    await initializeComponents({
      eventBus,
      dataStore,
      config,
      activityLogger,
      providerFactory,
      statusReporter,
      dockerMonitor,
      recordTracker
    });
    
    // Set up graceful shutdown
    setupGracefulShutdown({
      eventBus,
      dataStore,
      config,
      activityLogger,
      providerFactory,
      statusReporter,
      dockerMonitor,
      dnsManager: global.dnsManager,
      webServer: global.webServer
    });
    
    logger.complete('TráfegoDNS running successfully');
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Initialize all components with enhanced record tracker
 */
async function initializeComponents(components) {
  const { 
    eventBus, 
    dataStore, 
    config, 
    activityLogger, 
    providerFactory,
    statusReporter,
    dockerMonitor,
    recordTracker
  } = components;
  
  // Initialize data store first
  logger.info('Initializing data store...');
  await dataStore.init();
  
  // Initialize enhanced configuration
  logger.info('Initializing configuration...');
  await config.init();
  
  // Initialize enhanced record tracker
  logger.info('Initializing enhanced record tracker...');
  await recordTracker.init();
  
  // Initialize activity logger
  logger.info('Initializing activity logger...');
  await activityLogger.init();
  
  // Initialize DNS provider factory
  logger.info('Initializing DNS provider factory...');
  await providerFactory.init();
  
  // Get the active DNS provider
  const dnsProvider = providerFactory.getProvider();
  
  // Create DNS manager with enhanced record tracker
  logger.info('Initializing DNS manager with enhanced record tracker...');
  const dnsManager = new DNSManager(config, eventBus, dnsProvider, dataStore, activityLogger);
  
  // Inject enhanced record tracker into DNS manager
  dnsManager.recordTracker = recordTracker;
  
  // Initialize DNS manager
  await dnsManager.init();
  
  // Make available globally
  global.dnsManager = dnsManager;
  
  // Add to components for access in shutdown
  components.dnsManager = dnsManager;
  
  // Create operation mode monitor based on configuration
  let monitor;
  
  if (config.operationMode.toLowerCase() === 'direct') {
    logger.info('🚀 Starting in DIRECT mode (without Traefik)');
    monitor = new DirectDNSManager(config, eventBus, dnsManager);
    
    // Make available globally for web UI to trigger polling
    global.directDnsManager = monitor;
  } else {
    logger.info('🚀 Starting in TRAEFIK mode');
    monitor = new TraefikMonitor(config, eventBus);
    
    // Make available globally for web UI to trigger polling
    global.traefikMonitor = monitor;
  }
  
  // Add to components for access in shutdown
  components.monitor = monitor;
  
  // Connect monitors for container name resolution
  monitor.dockerMonitor = dockerMonitor;
  
  // Add global stats counter for tracking operations
  global.statsCounter = {
    created: 0,
    updated: 0,
    upToDate: 0,
    errors: 0
  };
  
  // Display startup information
  await statusReporter.displaySettings();
  
  // Initialize monitors
  await monitor.init();
  
  // Initialize enhanced web server
  if (process.env.ENABLE_WEB_UI === 'true') {
    logger.info('Initializing Enhanced Web UI...');
    const webServer = new EnhancedWebServer(config, eventBus, dnsManager, dataStore, activityLogger);
    await webServer.start();
    
    // Make available globally
    global.webServer = webServer;
    
    // Add to components for access in shutdown
    components.webServer = webServer;
  }
  
  // Start monitoring
  if (config.watchDockerEvents) {
    await dockerMonitor.startWatching();
  }
  
  // Start main polling
  await monitor.startPolling();
  
  // Set up operation mode change listener
  config.onConfigChange((key, oldValue, newValue) => {
    if (key === 'operationMode' && oldValue !== newValue) {
      handleOperationModeChange(components, newValue);
    }
  });
  
  return components;
}

/**
 * Handle operation mode change
 */
async function handleOperationModeChange(components, newMode) {
  const { 
    eventBus, 
    config, 
    activityLogger,
    dockerMonitor,
    dnsManager,
    monitor: oldMonitor
  } = components;
  
  try {
    logger.info(`Switching operation mode to ${newMode.toUpperCase()}...`);
    
    // Stop the current monitor
    oldMonitor.stopPolling();
    
    // Create a new monitor based on the new mode
    let newMonitor;
    
    if (newMode.toLowerCase() === 'direct') {
      logger.info('🚀 Switching to DIRECT mode (without Traefik)');
      newMonitor = new DirectDNSManager(config, eventBus, dnsManager);
      
      // Update global reference
      global.directDnsManager = newMonitor;
      global.traefikMonitor = null;
    } else {
      logger.info('🚀 Switching to TRAEFIK mode');
      newMonitor = new TraefikMonitor(config, eventBus);
      
      // Update global reference
      global.traefikMonitor = newMonitor;
      global.directDnsManager = null;
    }
    
    // Connect monitors for container name resolution
    newMonitor.dockerMonitor = dockerMonitor;
    
    // Initialize and start the new monitor
    await newMonitor.init();
    await newMonitor.startPolling();
    
    // Update reference in components
    components.monitor = newMonitor;
    
    // Log success
    logger.success(`Successfully switched to ${newMode.toUpperCase()} mode`);
    
    // Log mode change to activity log
    await activityLogger.log({
      type: 'info',
      action: 'operation_mode_changed',
      message: `Operation mode changed from ${oldMonitor.constructor.name} to ${newMonitor.constructor.name}`,
      details: {
        oldMode: oldMonitor.constructor.name,
        newMode: newMonitor.constructor.name
      }
    });
    
    // Publish event
    eventBus.publish(EventTypes.OPERATION_MODE_CHANGED, {
      oldMode: oldMonitor.constructor.name,
      newMode: newMonitor.constructor.name
    });
  } catch (error) {
    logger.error(`Error switching operation mode: ${error.message}`);
    
    // Log error to activity log
    await activityLogger.logError(
      'handleOperationModeChange',
      `Failed to switch operation mode to ${newMode}: ${error.message}`
    );
    
    // Try to restart the old monitor
    try {
      await oldMonitor.startPolling();
    } catch (restartError) {
      logger.error(`Error restarting old monitor: ${restartError.message}`);
    }
  }
}

/**
 * Set up graceful shutdown
 */
function setupGracefulShutdown(components) {
  const shutdownHandler = async () => {
    logger.info('Shutting down TráfegoDNS...');
    
    try {
      // Stop monitoring
      if (components.monitor) {
        components.monitor.stopPolling();
      }
      
      if (components.dockerMonitor) {
        components.dockerMonitor.stopWatching();
      }
      
      // Shut down web server if it exists
      if (components.webServer) {
        await components.webServer.stop();
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

module.exports = { start };