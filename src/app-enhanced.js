/**
 * Enhanced application entry point for TráfegoDNS
 * Implements improved data management and component hot-swapping
 */
const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');
const DataStore = require('./data/DataStore');
const EnhancedConfigManager = require('./config/EnhancedConfigManager');
const EnhancedProviderFactory = require('./providers/EnhancedProviderFactory');
const ActivityLogger = require('./logs/ActivityLogger');
const { DNSManager, TraefikMonitor, DockerMonitor, StatusReporter, DirectDNSManager } = require('./services');
const WebServer = require('./webserver');
const EventTypes = require('./events/EventTypes');

/**
 * Enhanced application startup
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
    
    // Initialize components
    await initializeComponents({
      eventBus,
      dataStore,
      config,
      activityLogger,
      providerFactory,
      statusReporter,
      dockerMonitor
    });
    
    // Set up graceful shutdown
    setupGracefulShutdown({
      eventBus,
      dataStore,
      config,
      activityLogger,
      providerFactory,
      statusReporter,
      dockerMonitor
    });
    
    logger.complete('TráfegoDNS running successfully');
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Initialize all components
 */
async function initializeComponents(components) {
  const { 
    eventBus, 
    dataStore, 
    config, 
    activityLogger, 
    providerFactory,
    statusReporter,
    dockerMonitor
  } = components;
  
  // Initialize data store first
  logger.info('Initializing data store...');
  await dataStore.init();
  
  // Initialize enhanced configuration
  logger.info('Initializing configuration...');
  await config.init();
  
  // Initialize activity logger
  logger.info('Initializing activity logger...');
  await activityLogger.init();
  
  // Initialize DNS provider factory
  logger.info('Initializing DNS provider factory...');
  await providerFactory.init();
  
  // Get the active DNS provider
  const dnsProvider = providerFactory.getProvider();
  
  // Create DNS manager
  logger.info('Initializing DNS manager...');
  const dnsManager = new DNSManager(config, eventBus, dnsProvider, dataStore, activityLogger);
  await dnsManager.init();
  
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
  
  // Initialize web server if enabled
  if (process.env.ENABLE_WEB_UI === 'true') {
    logger.info('Initializing Web UI...');
    const webServer = new WebServer(config, eventBus, dnsManager, dataStore, activityLogger);
    await webServer.start();
    
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