/**
 * Main application entry point for TráfegoDNS
 * Primary responsibility: Wire up the application components
 */
const { ConfigManager } = require('./config');
const { DNSManager, TraefikMonitor, DockerMonitor, StatusReporter } = require('./services');
const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');

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
    const traefikMonitor = new TraefikMonitor(config, eventBus);
    const dockerMonitor = new DockerMonitor(config, eventBus);
    
    // Connect monitors for container name resolution
    traefikMonitor.dockerMonitor = dockerMonitor;
    
    // Display startup configuration
    await statusReporter.displaySettings();
    
    // Initialize all services
    await dnsManager.init();
    await traefikMonitor.init();
    
    // Start monitoring
    if (config.watchDockerEvents) {
      await dockerMonitor.startWatching();
    }
    
    // Start main polling
    await traefikMonitor.startPolling();
    
    logger.complete('TráfegoDNS running successfully');
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();