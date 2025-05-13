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

    // Enforce SQLite-only mode
    logger.info('🔒 Enforcing SQLite-only mode (JSON storage permanently disabled)');
    process.env.DISABLE_JSON_STORAGE = 'true';

    // Setup local auth bypass options
    config.localAuthBypass = {
      enabled: process.env.LOCAL_AUTH_BYPASS !== 'false', // Enabled by default
      internalToken: process.env.TRAFEGO_INTERNAL_TOKEN || crypto.randomBytes(32).toString('hex'),
      cliToken: process.env.CLI_TOKEN || 'trafegodns-cli'
    };

    // SQLite database is required for operation
    logger.info('🔍 Initializing SQLite database');
    try {
      // Use the lock manager for database initialization coordination
      const lockManager = require('./database/lockManager');
      const fs = require('fs');
      const path = require('path');
      const DATA_DIR = path.join(process.env.CONFIG_DIR || '/config', 'data');
      const DB_FILE = path.join(DATA_DIR, 'trafegodns.db');

      // Create the data directory if it doesn't exist
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`Created data directory: ${DATA_DIR}`);
      }
      
      // Attempt to acquire the lock with a 30 second timeout
      logger.info('🔒 Acquiring exclusive lock for database initialization...');
      const lockAcquired = await lockManager.acquireLock(30000);
      
      if (!lockAcquired) {
        logger.warn('⚠️ Failed to acquire exclusive lock, proceeding in read-only mode');
        // Even without the lock, we'll try to use the database
      } else {
        logger.info('✅ Acquired exclusive lock for database initialization');
      }

      // Load database module
      const database = require('./database');
      
      try {
        // Only attempt full initialization if we have the lock
        if (lockAcquired) {
          // Force sequential initialization with retries and longer timeout
          let initSuccess = false;
          let attempts = 0;
          const maxAttempts = 3;
          
          while (!initSuccess && attempts < maxAttempts) {
            attempts++;
            
            try {
              logger.info(`🔍 Attempting database initialization (attempt ${attempts}/${maxAttempts})`);
              initSuccess = await database.initialize(true); // Pass true to perform JSON migration
              
              if (initSuccess) {
                logger.info('✅ SQLite database initialized successfully');
                
                // Check if this is the first run by looking for a flag in settings
                const firstRunCompleted = await database.repositories.setting.get('first_run_completed', false);
                
                if (!firstRunCompleted) {
                  logger.info('🔧 First run detected, application will be conservative with existing DNS records');
                  // Store as global property so other components can access it
                  global.isFirstRun = true;
                } else {
                  logger.debug('🔄 Subsequent run detected');
                  global.isFirstRun = false;
                }
                
                break;
              } else {
                logger.warn(`⚠️ Database initialization failed on attempt ${attempts}/${maxAttempts}`);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (initError) {
              logger.error(`❌ Database initialization error: ${initError.message}`);
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          // If we couldn't initialize after all attempts
          if (!initSuccess) {
            logger.error('❌ SQLite database initialization failed after multiple attempts');
            logger.error('❌ Application requires SQLite database to operate');
            logger.error('❌ Please install SQLite or check database permissions');
            logger.error('❌ For emergency recovery, run: /app/docker-s6/scripts/fix-sqlite.sh');
            
            // Release the lock before exiting
            lockManager.releaseLock();
            process.exit(1);
          }
        } else {
          // If we couldn't acquire the lock, try to connect without initialization
          logger.info('🔍 Connecting to database without initialization (another process has the lock)');
          
          // Set the database to initialized mode directly
          database.forceInitialized = true;
          logger.info('✅ Database connection established in read-only mode');
        }
      } finally {
        // Always release the lock if we acquired it
        if (lockAcquired) {
          logger.info('🔓 Releasing database initialization lock');
          lockManager.releaseLock();
        }
      }
    } catch (dbError) {
      logger.error(`❌ SQLite database initialization error: ${dbError.message}`);
      logger.error('❌ Application cannot operate without SQLite database');
      logger.error('❌ For emergency recovery, run: /app/docker-s6/scripts/fix-sqlite.sh');
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
    
    // If this was the first run, mark it as completed now that we've started successfully
    if (global.isFirstRun) {
      try {
        logger.info('🔹 First run completed successfully, updating database flag');
        const db = require('./database');
        await db.repositories.setting.set('first_run_completed', true);
        global.isFirstRun = false;
      } catch (error) {
        logger.warn(`⚠️ Failed to update first_run_completed flag: ${error.message}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
start();