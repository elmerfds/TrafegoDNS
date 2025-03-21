/**
 * Main application entry point for TráfegoDNS
 * Primary responsibility: Wire up the application components
 */
const { ConfigManager } = require('./config');
const { DNSManager, TraefikMonitor, DockerMonitor, StatusReporter, DirectDNSManager } = require('./services');
const WebServer = require('./webserver');
const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');

// Import integration fixes
const { applyFixes, replaceWebServer } = require('./integrationFixes');

// Apply fixes after initialization
initializeComponents(components)
  .then(async (components) => {
    // Apply enhanced components
    const enhancedComponents = await applyFixes(components);
    
    // Replace web server with enhanced version
    await replaceWebServer(components);
    
    logger.info('Enhanced components applied successfully');
  })
  .catch(error => {
    logger.error(`Error applying enhanced components: ${error.message}`);
  });

/**
 * Application startup
 */
async function start() {
  try {
    // Create event bus (central communication)
    const eventBus = new EventBus();
    
    // Initialize configuration
    const config = new ConfigManager();
    
    // Initialize services
    const statusReporter = new StatusReporter(config, eventBus);
    const dnsManager = new DNSManager(config, eventBus);
    const dockerMonitor = new DockerMonitor(config, eventBus);
    
    // Choose the appropriate monitor based on operation mode
    let monitor;
    
    if (config.operationMode.toLowerCase() === 'direct') {
      logger.info('🚀 Starting in DIRECT mode (without Traefik)');
      monitor = new DirectDNSManager(config, eventBus);
      
      // Make available globally for web UI to trigger polling
      global.directDnsManager = monitor;
    } else {
      logger.info('🚀 Starting in TRAEFIK mode');
      monitor = new TraefikMonitor(config, eventBus);
      
      // Make available globally for web UI to trigger polling
      global.traefikMonitor = monitor;
    }
    
    // Connect monitors for container name resolution
    monitor.dockerMonitor = dockerMonitor;
    
    // Add global stats counter for tracking operations
    global.statsCounter = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0
    };
    
    // Display startup configuration
    await statusReporter.displaySettings();
    
    // Initialize all services
    await dnsManager.init();
    await monitor.init();
    
    // Initialize web server if enabled
    if (process.env.ENABLE_WEB_UI === 'true') {
      logger.info('Initializing Web UI...');
      const webServer = new WebServer(config, eventBus, dnsManager, dnsManager.recordTracker);
      await webServer.start();
    }
    
    // Start monitoring
    if (config.watchDockerEvents) {
      await dockerMonitor.startWatching();
    }
    
    // Start main polling
    await monitor.startPolling();
    
    logger.complete('TráfegoDNS running successfully');
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();