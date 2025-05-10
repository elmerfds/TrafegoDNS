/**
 * Main application entry point for TráfegoDNS
 * Primary responsibility: Wire up the application components
 */
const { ConfigManager } = require('./config');
const { DNSManager, TraefikMonitor, DockerMonitor, StatusReporter, DirectDNSManager } = require('./services');
const { EventBus } = require('./events/EventBus');
const logger = require('./utils/logger');
const { startApiServer } = require('./api');
const ApiClient = require('./cli/apiClient');
const localAuthBypass = require('./api/v1/middleware/localAuthBypassMiddleware');
const crypto = require('crypto');

/**
 * Application startup
 */
async function start() {
  try {
    // Create event bus (central communication)
    const eventBus = new EventBus();

    // Initialize configuration
    const config = new ConfigManager();

    // Setup local auth bypass options
    config.localAuthBypass = {
      enabled: process.env.LOCAL_AUTH_BYPASS !== 'false', // Enabled by default
      internalToken: process.env.TRAFEGO_INTERNAL_TOKEN || crypto.randomBytes(32).toString('hex'),
      cliToken: process.env.CLI_TOKEN || 'trafegodns-cli'
    };

    // Initialize API mode (default true)
    const useApiMode = process.env.USE_API_MODE !== 'false';

    // Initialize services
    const statusReporter = new StatusReporter(config, eventBus);
    const dnsManager = new DNSManager(config, eventBus);
    const dockerMonitor = new DockerMonitor(config, eventBus);

    // Choose the appropriate monitor based on operation mode
    let monitor;

    if (config.operationMode.toLowerCase() === 'direct') {
      logger.info('🚀 Starting in DIRECT mode (without Traefik)');
      monitor = new DirectDNSManager(config, eventBus);
    } else {
      logger.info('🚀 Starting in TRAEFIK mode');
      monitor = new TraefikMonitor(config, eventBus);
    }

    // Connect monitors for container name resolution
    monitor.dockerMonitor = dockerMonitor;

    // Display startup configuration
    await statusReporter.displaySettings();

    // Initialize API server if API mode is enabled
    let apiServer;
    let apiClient;

    if (useApiMode) {
      logger.info('🚀 Starting API server and using API mode');

      // Start API server
      const apiPort = process.env.API_PORT || 3000;
      apiServer = startApiServer(apiPort, config, eventBus);

      // Inject local auth bypass middleware
      apiServer.app.use(localAuthBypass(config));

      // Create API client for internal use
      apiClient = new ApiClient(config);

      // Connect API client to services
      dnsManager.apiClient = apiClient;
      monitor.apiClient = apiClient;
      dockerMonitor.apiClient = apiClient;
    } else {
      logger.info('🚀 Starting in direct CLI mode (API server disabled)');
    }

    // Initialize all services
    await dnsManager.init();
    await monitor.init();

    // Start monitoring
    if (config.watchDockerEvents) {
      await dockerMonitor.startWatching();
    }

    // Start main polling
    await monitor.startPolling();

    // Make services available to API controllers via global
    global.services = {
      DNSManager: dnsManager,
      DockerMonitor: dockerMonitor,
      StatusReporter: statusReporter,
      Monitor: monitor,
      TraefikMonitor: config.operationMode.toLowerCase() !== 'direct' ? monitor : null,
      DirectDNSManager: config.operationMode.toLowerCase() === 'direct' ? monitor : null,
      ConfigManager: config
    };

    logger.complete('TráfegoDNS running successfully');

    // Export API client for CLI usage
    global.apiClient = apiClient;

    // Create CLI client for API interactions
    if (useApiMode && !process.env.API_ONLY) {
      const cliModule = require('./cli');
      await cliModule.start(apiClient, config, eventBus);
    }
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();