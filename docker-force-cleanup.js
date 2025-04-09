/**
 * Docker-compatible force cleanup script for CloudFlare Zero Trust hostnames
 * Run with: node docker-force-cleanup.js <hostname>
 */
const fs = require('fs');
const path = require('path');

// Parse command line args
const hostname = process.argv[2];
if (!hostname) {
  console.error('Error: Please provide a hostname to clean up');
  console.log('Usage: node docker-force-cleanup.js <hostname>');
  process.exit(1);
}

// Setup logging
const logFile = path.join(__dirname, `cleanup-${hostname}.log`);
fs.writeFileSync(logFile, `Force Cleanup Log for ${hostname} - ${new Date().toISOString()}\n\n`, 'utf8');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logMessage, 'utf8');
}

// Load the DNSManager and other required modules
log('Loading required modules...');

let config, DNSProviderFactory, DNSManager, provider;

try {
  config = require('./src/config');
  log(`Loaded config: provider=${config.dnsProvider}`);
  
  if (config.dnsProvider !== 'cfzerotrust') {
    log('Error: This script only works with the CFZeroTrust provider');
    process.exit(1);
  }
  
  try {
    const providersModule = require('./src/providers');
    DNSProviderFactory = providersModule.DNSProviderFactory;
    log('Loaded DNSProviderFactory successfully');
    
    // Create provider instance directly
    provider = DNSProviderFactory.createProvider(config);
    log(`Created provider instance: ${provider.constructor.name}`);
    
    // Initialize provider
    log('Initializing provider...');
    provider.init().then(() => {
      log('Provider initialized successfully');
      cleanupHostname(hostname, provider);
    }).catch(error => {
      log(`Error initializing provider: ${error.message}`);
      process.exit(1);
    });
  } catch (providerError) {
    log(`Error loading providers: ${providerError.message}`);
    process.exit(1);
  }
} catch (configError) {
  log(`Error loading config: ${configError.message}`);
  process.exit(1);
}

// Function to search for a record ID by hostname
async function findRecordIdByHostname(hostname, provider) {
  log(`Searching for record ID for hostname: ${hostname}`);
  
  // Method 1: Check for the record in the tunnel configuration
  try {
    log(`Checking tunnel ${provider.defaultTunnelId} for hostname ${hostname}`);
    const tunnelRecords = await provider.getTunnelHostnames(provider.defaultTunnelId);
    const record = tunnelRecords.find(r => r.name === hostname);
    
    if (record) {
      log(`Found record in tunnel: ${record.id}`);
      return record.id;
    } else {
      log(`Hostname ${hostname} not found in tunnel ${provider.defaultTunnelId}`);
    }
  } catch (error) {
    log(`Error searching tunnel: ${error.message}`);
  }
  
  // Method 2: Check for the record in global.tunnelHostnames
  if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
    const info = global.tunnelHostnames.get(hostname);
    log(`Found in memory tracking: ${info.id}`);
    return info.id;
  }
  
  // Method 3: Try constructing the ID
  const constructedId = `${provider.defaultTunnelId}:${hostname}`;
  log(`Constructed ID from default tunnel: ${constructedId}`);
  return constructedId;
}

// Function to forcibly clean up a hostname
async function cleanupHostname(hostname, provider) {
  log(`\n=== STARTING FORCE CLEANUP FOR ${hostname} ===\n`);
  
  // Step 1: Find the record ID
  const recordId = await findRecordIdByHostname(hostname, provider);
  if (!recordId) {
    log('Failed to determine record ID');
    return;
  }
  
  // Step 2: Try to delete the record directly
  try {
    log(`Attempting to delete record with ID: ${recordId}`);
    const deleteResult = await provider.deleteRecord(recordId);
    log(`Delete result: ${deleteResult ? 'Success' : 'Failed'}`);
    
    // Step 3: Clean up tracking
    if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
      global.tunnelHostnames.delete(hostname);
      log(`Removed ${hostname} from in-memory tracking`);
    } else {
      log(`Hostname ${hostname} not found in in-memory tracking`);
    }
    
    // Step 4: Verify the hostname is gone
    try {
      log(`Verifying deletion from tunnel ${provider.defaultTunnelId}...`);
      const remainingRecords = await provider.getTunnelHostnames(provider.defaultTunnelId);
      const recordStillExists = remainingRecords.some(r => r.name === hostname);
      
      if (recordStillExists) {
        log(`WARNING: Hostname ${hostname} still exists in tunnel after deletion!`);
        
        // Try to get the record to show details
        const record = remainingRecords.find(r => r.name === hostname);
        if (record) {
          log(`Remaining record details: ${JSON.stringify(record)}`);
        }
      } else {
        log(`Success: Hostname ${hostname} no longer exists in tunnel`);
      }
    } catch (verifyError) {
      log(`Error verifying deletion: ${verifyError.message}`);
    }
    
  } catch (error) {
    log(`Error deleting record: ${error.message}`);
    if (error.stack) {
      log(error.stack);
    }
  }
  
  log('\n=== FORCE CLEANUP COMPLETED ===\n');
}

// Handle process exit
process.on('exit', () => {
  log(`Cleanup script complete. Log written to ${logFile}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`);
  if (error.stack) {
    log(error.stack);
  }
  process.exit(1);
});
