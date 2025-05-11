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

    // SQLite database is now required for operation
    logger.info('🔍 Initializing SQLite database');
    try {
      const database = require('./database');
      await database.initialize();

      // Check if database initialized successfully
      if (database.isInitialized()) {
        logger.info('✅ SQLite database initialized successfully');
      } else {
        logger.error('❌ SQLite database initialization failed');
        logger.error('❌ Application cannot operate without SQLite database');
        process.exit(1);
      }
    } catch (dbError) {
      logger.error(`❌ SQLite database initialization error: ${dbError.message}`);
      logger.error('❌ Application cannot operate without SQLite database');
      process.exit(1);
    }

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

      try {
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

        logger.info(`✅ API server started successfully on port ${apiPort}`);
      } catch (apiError) {
        logger.error(`❌ Failed to start API server: ${apiError.message}`);
        logger.error(`API server stack trace: ${apiError.stack}`);

        // Continue running without API if it fails
        logger.warn('Continuing with core functionality without API server');
        useApiMode = false;
      }
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

    // Initialize state management system
    const { initializeStateManagement } = require('./state');
    const { stateStore, actionBroker } = initializeStateManagement(eventBus, {
      DNSManager: dnsManager,
      DockerMonitor: dockerMonitor,
      StatusReporter: statusReporter,
      Monitor: monitor,
      TraefikMonitor: config.operationMode.toLowerCase() !== 'direct' ? monitor : null,
      DirectDNSManager: config.operationMode.toLowerCase() === 'direct' ? monitor : null,
      ConfigManager: config
    });

    // Make state available globally
    global.stateStore = stateStore;
    global.actionBroker = actionBroker;

    logger.complete('TráfegoDNS running successfully');

    // Export API client for CLI usage
    global.apiClient = apiClient;

    // Create CLI client for API interactions
    if (useApiMode && !process.env.API_ONLY) {
      const cliModule = require('./cli');
      await cliModule.start(apiClient, config, eventBus, actionBroker);
    }

    // Signal that system has started
    eventBus.emit('system:startup', {
      timestamp: new Date().toISOString(),
      services: {
        dnsManager: true,
        monitor: true,
        docker: dockerMonitor && dockerMonitor.isConnected(),
        api: apiServer ? true : false,
        database: require('./database').isInitialized()
      }
    });
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();