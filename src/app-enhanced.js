/**
 * src/app-enhanced.js
 * Enhanced application entry point for TráfegoDNS with Web UI support
 */
const { ConfigManager } = require('./config');
const { TraefikMonitor, DockerMonitor, DirectDNSManager } = require('./services');
const EnhancedDNSManager = require('./services/EnhancedDNSManager');
const { EventBus } = require('./events/EventBus');
const StateManager = require('./state/StateManager');
const ApiServer = require('./api/server');
const logger = require('./utils/logger');
const path = require('path');
const fs = require('fs');

/**
 * Application startup
 */
async function start() {
  try {
    // Create event bus (central communication)
    const eventBus = new EventBus();
    
    // Initialize configuration
    const config = new ConfigManager();
    
    // Get package version
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = require(packageJsonPath);
    config.version = packageJson.version || '1.0.0';
    
    // Initialize state manager (single source of truth)
    const stateManager = new StateManager(config, eventBus);
    
    // Initialize enhanced DNS manager
    const dnsManager = new EnhancedDNSManager(config, eventBus, stateManager);
    
    // Initialize services
    const dockerMonitor = new DockerMonitor(config, eventBus);
    
    // Choose the appropriate monitor based on operation mode
    let monitor;
    
    if (config.operationMode.toLowerCase() === 'direct') {
      logger.info('🚀 Starting in DIRECT mode (without Traefik)');
      monitor = new DirectDNSManager(config, eventBus);
      dnsManager.directDnsManager = monitor;
    } else {
      logger.info('🚀 Starting in TRAEFIK mode');
      monitor = new TraefikMonitor(config, eventBus);
      dnsManager.traefikMonitor = monitor;
    }
    
    // Connect monitors for container name resolution
    monitor.dockerMonitor = dockerMonitor;
    dnsManager.dockerMonitor = dockerMonitor;
    
    // Initialize API server
    const apiPort = parseInt(process.env.API_PORT || '3000', 10);
    const apiServer = new ApiServer(config, eventBus, dnsManager, stateManager);
    
    // Display startup configuration
    await displaySettings(config, stateManager);
    
    // Initialize all services
    await dnsManager.init();
    await monitor.init();
    
    // Start API server
    apiServer.start(apiPort);
    
    // Start monitoring
    if (config.watchDockerEvents) {
      await dockerMonitor.startWatching();
    }
    
    // Start main polling
    await monitor.startPolling();
    
    logger.complete('TráfegoDNS running successfully');
    
    // Handle process termination gracefully
    process.on('SIGINT', () => shutdown(apiServer, dockerMonitor, monitor));
    process.on('SIGTERM', () => shutdown(apiServer, dockerMonitor, monitor));
  } catch (error) {
    logger.error(`Failed to start TráfegoDNS: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display configured settings in a visually appealing format
 * @param {Object} config - Configuration manager instance
 * @param {Object} stateManager - State manager instance
 */
async function displaySettings(config, stateManager) {
  try {
    console.log(''); // Empty line for better readability
    logger.info(`🚀 TráfegoDNS v${config.version}`);
    
    // Display Web UI information
    const apiPort = parseInt(process.env.API_PORT || '3000', 10);
    const webUiDir = path.join(__dirname, '../webui/dist');
    
    if (fs.existsSync(webUiDir)) {
      logger.info(`🌐 Web UI available at http://localhost:${apiPort}`);
    } else {
      logger.info(`🔌 API available at http://localhost:${apiPort}/api`);
    }
    
    // Display operation mode
    const operationMode = config.operationMode || 'traefik';
    logger.info(`🔄 Operation Mode: ${operationMode.toUpperCase()}`);
    console.log(''); // Empty line for spacing
    
    // DNS Provider Section
    logger.info('🌐 DNS PROVIDER');
    logger.info(`  🟢 Provider: ${config.dnsProvider}`);
    // Mask any sensitive tokens for security
    const maskedToken = config.cloudflareToken ? 'Configured' : 'Not configured';
    logger.info(`  🔑 Auth: ${maskedToken}`);
    logger.info(`  🌐 Zone: ${config.getProviderDomain()}`);
    console.log(''); // Empty line for spacing
    
    // Connectivity Section
    logger.info('🔄 CONNECTIVITY');
    if (operationMode.toLowerCase() === 'traefik') {
      logger.info(`  🟢 Traefik API: ${config.traefikApiUrl}`);
      const authStatus = config.traefikApiUsername ? 'Enabled' : 'Disabled';
      logger.info(`  🔐 Basic Auth: ${authStatus}`);
    } else {
      logger.info(`  🟢 Docker Labels: Direct access mode (no Traefik)`);
    }
    logger.info(`  🐳 Docker Socket: ${config.dockerSocket}`);
    console.log(''); // Empty line for spacing
    
    // Network Section
    logger.info('📍 NETWORK');
    const ipv4 = config.getPublicIPSync() || 'Auto-detecting...';
    logger.info(`  🌐 IPv4: ${ipv4}`);
    const ipv6 = config.getPublicIPv6Sync() || 'Not detected';
    logger.info(`  🌐 IPv6: ${ipv6}`);
    const ipRefreshMin = (config.ipRefreshInterval / 60000).toFixed(0);
    logger.info(`  🔄 IP Refresh: Every ${ipRefreshMin} minutes`);
    console.log(''); // Empty line for spacing
    
    // Settings Section
    logger.info('⚙️ SETTINGS');
    logger.info(`  📊 Log Level: ${logger.levelNames[logger.level]}`);
    logger.info(`  🐳 Docker Events: ${config.watchDockerEvents ? 'Yes' : 'No'}`);
    logger.info(`  🧹 Cleanup Orphaned: ${config.cleanupOrphaned ? 'Yes' : 'No'}`);
    logger.info(`  🕒 Poll Interval: ${(config.pollInterval / 1000).toFixed(0)} seconds`);
  } catch (error) {
    logger.error(`Error displaying settings: ${error.message}`);
    // Continue even if we can't display settings properly
  }
}

/**
 * Graceful shutdown
 * @param {Object} apiServer - API server instance
 * @param {Object} dockerMonitor - Docker monitor instance
 * @param {Object} monitor - Traefik or Direct monitor instance
 */
async function shutdown(apiServer, dockerMonitor, monitor) {
  logger.info('Shutting down TráfegoDNS...');
  
  // Stop API server
  if (apiServer) {
    apiServer.stop();
  }
  
  // Stop Docker event monitoring
  if (dockerMonitor) {
    dockerMonitor.stopWatching();
  }
  
  // Stop polling
  if (monitor) {
    if (typeof monitor.stopPolling === 'function') {
      monitor.stopPolling();
    }
  }
  
  logger.info('TráfegoDNS has been shut down');
  process.exit(0);
}

// Start the application
start();