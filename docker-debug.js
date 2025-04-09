/**
 * Docker-compatible debugging script for orphaned record cleanup
 * This version doesn't depend on EventBus or other complex imports
 */
const fs = require('fs');
const path = require('path');

// Create a debug log file
const logFile = path.join(__dirname, 'docker-cleanup-debug.log');
fs.writeFileSync(logFile, `Docker Cleanup Debug Log - ${new Date().toISOString()}\n\n`, 'utf8');

function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFile, logMessage, 'utf8');
}

// Check if tunnelHostnames global exists
debugLog('=== STARTING BASIC DEBUG CHECK ===');

// Import DNSManager directly
try {
  const DNSManager = require('./src/services/DNSManager');
  debugLog('Successfully imported DNSManager');
} catch (error) {
  debugLog(`Error importing DNSManager: ${error.message}`);
}

// Check for global tunnelHostnames
if (global.tunnelHostnames) {
  debugLog(`Found global.tunnelHostnames with ${global.tunnelHostnames.size} entries`);
  for (const [hostname, info] of global.tunnelHostnames.entries()) {
    debugLog(`- ${hostname} (ID: ${info.id}, tunnelId: ${info.tunnelId || 'default'})`);
  }
} else {
  debugLog('No global.tunnelHostnames found');
}

// Check for global config
if (global.config) {
  debugLog(`Found global.config: provider=${global.config.dnsProvider}`);
} else {
  debugLog('No global.config found');
}

// Debug the DNS provider
try {
  const config = require('./src/config');
  debugLog(`Loaded config from file: dnsProvider=${config.dnsProvider}`);

  if (config.dnsProvider === 'cfzerotrust') {
    debugLog('CloudFlare Zero Trust provider detected');
    
    // Try to load the provider directly
    try {
      const { DNSProviderFactory } = require('./src/providers');
      debugLog('Successfully imported DNSProviderFactory');
      
      // Try creating the provider
      try {
        const provider = DNSProviderFactory.createProvider(config);
        debugLog(`Created provider: ${provider.constructor.name}`);
        
        // Check relevant provider methods
        debugLog(`Provider has trackCreatedHostname: ${typeof provider.trackCreatedHostname === 'function'}`);
        debugLog(`Provider has removeTrackedHostname: ${typeof provider.removeTrackedHostname === 'function'}`);
        
        // Print defaultTunnelId if available
        if (provider.defaultTunnelId) {
          debugLog(`Default tunnel ID: ${provider.defaultTunnelId}`);
        }
      } catch (providerError) {
        debugLog(`Error creating provider: ${providerError.message}`);
      }
    } catch (factoryError) {
      debugLog(`Error importing DNSProviderFactory: ${factoryError.message}`);
    }
  }
} catch (configError) {
  debugLog(`Error loading config: ${configError.message}`);
}

// Direct file read to examine recordTracker data
try {
  const recordTrackerPath = path.join(__dirname, 'data', 'recordTracking.json');
  if (fs.existsSync(recordTrackerPath)) {
    const rawData = fs.readFileSync(recordTrackerPath, 'utf8');
    try {
      const recordData = JSON.parse(rawData);
      
      // Get cfzerotrust records
      const cfRecords = (recordData.records || []).filter(r => r.provider === 'cfzerotrust');
      debugLog(`Found ${cfRecords.length} cfzerotrust records in tracking file`);
      
      if (cfRecords.length > 0) {
        debugLog('Records in tracking file:');
        cfRecords.forEach(record => {
          debugLog(`- ${record.name} (ID: ${record.id}, tunnelId: ${record.tunnelId || 'default'})`);
        });
      }
    } catch (parseError) {
      debugLog(`Error parsing record data: ${parseError.message}`);
      debugLog(`Raw data: ${rawData.substring(0, 200)}...`);
    }
  } else {
    debugLog(`Record tracker file not found at ${recordTrackerPath}`);
    
    // Try to find the file
    try {
      const dataDir = path.join(__dirname, 'data');
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        debugLog(`Files in data directory: ${files.join(', ')}`);
      } else {
        debugLog(`Data directory not found at ${dataDir}`);
      }
    } catch (dirError) {
      debugLog(`Error checking data directory: ${dirError.message}`);
    }
  }
} catch (fileError) {
  debugLog(`Error reading record tracker file: ${fileError.message}`);
}

debugLog('=== DEBUG CHECK COMPLETED ===');
debugLog(`Debug log written to: ${logFile}`);
