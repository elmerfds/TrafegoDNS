/**
 * Force cleanup of a specific tunnel hostname
 * Run with: node force-cleanup.js hostname [--dryRun]
 */
const config = require('./src/config');
const EventBus = require('./src/events/EventBus');
const DNSManager = require('./src/services/DNSManager');
const logger = require('./src/utils/logger');

// Set logger to debug level
logger.level = 3; // DEBUG level

// Parse command-line arguments
const hostname = process.argv[2];
const dryRun = process.argv.includes('--dryRun');

if (!hostname) {
  console.error('Error: Please provide a hostname to clean up');
  console.log('Usage: node force-cleanup.js <hostname> [--dryRun]');
  process.exit(1);
}

async function forceCleanup(hostname) {
  console.log(`=== FORCE CLEANUP: ${hostname} ${dryRun ? '(DRY RUN)' : ''} ===`);
  
  // Create event bus and DNS manager
  const eventBus = new EventBus();
  const dnsManager = new DNSManager(config, eventBus);
  
  try {
    // Initialize the manager
    console.log('Initializing DNS manager...');
    await dnsManager.init();
    
    // Check if hostname exists in tracking before cleanup
    console.log(`\nChecking if ${hostname} exists in tracking...`);
    let found = false;
    
    // Check recordTracker
    const trackedRecords = dnsManager.recordTracker.getAllTrackedRecords();
    const cfRecord = trackedRecords.find(r => 
      r.provider === 'cfzerotrust' && r.name === hostname
    );
    
    if (cfRecord) {
      found = true;
      console.log(`Found in RecordTracker: ${hostname} (ID: ${cfRecord.id}, Tunnel: ${cfRecord.tunnelId || 'default'})`);
    }
    
    // Check in-memory tracking
    let memoryInfo = null;
    if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
      found = true;
      memoryInfo = global.tunnelHostnames.get(hostname);
      console.log(`Found in memory tracking: ${hostname} (ID: ${memoryInfo.id}, Tunnel: ${memoryInfo.tunnelId || 'default'})`);
    }
    
    // Check tunnel directly
    let tunnelId = cfRecord?.tunnelId || memoryInfo?.tunnelId || config.cfzerotrustTunnelId;
    console.log(`\nChecking tunnel ${tunnelId} for ${hostname}...`);
    
    if (typeof dnsManager.dnsProvider.getTunnelHostnames === 'function') {
      const tunnelRecords = await dnsManager.dnsProvider.getTunnelHostnames(tunnelId);
      const directRecord = tunnelRecords.find(r => r.name === hostname);
      
      if (directRecord) {
        found = true;
        console.log(`Found directly in tunnel: ${hostname} (ID: ${directRecord.id})`);
      } else {
        console.log(`Not found directly in tunnel ${tunnelId}`);
      }
    }
    
    if (!found) {
      console.log(`\nHostname ${hostname} not found in any tracking or directly in tunnel.`);
      return;
    }
    
    if (dryRun) {
      console.log(`\nDRY RUN: Would clean up hostname ${hostname}`);
      return;
    }
    
    // Force cleanup using DNSManager method
    console.log(`\nForcing cleanup of ${hostname}...`);
    await dnsManager.forceTunnelCleanup(hostname);
    
    // Verify cleanup
    console.log(`\nVerifying cleanup of ${hostname}...`);
    
    // Check recordTracker again
    const remainingRecords = dnsManager.recordTracker.getAllTrackedRecords();
    const remainingCfRecord = remainingRecords.find(r => 
      r.provider === 'cfzerotrust' && r.name === hostname
    );
    
    if (remainingCfRecord) {
      console.log(`Still found in RecordTracker: ${hostname} (ID: ${remainingCfRecord.id})`);
    } else {
      console.log(`Successfully removed from RecordTracker`);
    }
    
    // Check in-memory tracking again
    if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
      console.log(`Still found in memory tracking: ${hostname}`);
    } else {
      console.log(`Successfully removed from memory tracking`);
    }
    
    // Check tunnel directly again
    if (typeof dnsManager.dnsProvider.getTunnelHostnames === 'function') {
      const remainingTunnelRecords = await dnsManager.dnsProvider.getTunnelHostnames(tunnelId);
      const remainingDirectRecord = remainingTunnelRecords.find(r => r.name === hostname);
      
      if (remainingDirectRecord) {
        console.log(`Still found directly in tunnel: ${hostname} (ID: ${remainingDirectRecord.id})`);
      } else {
        console.log(`Successfully removed from tunnel ${tunnelId}`);
      }
    }
    
    console.log('\n=== FORCE CLEANUP COMPLETED ===');
  } catch (error) {
    console.error(`Error during force cleanup: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the force cleanup
forceCleanup(hostname).then(() => {
  console.log('Force cleanup completed');
  process.exit(0);
}).catch(error => {
  console.error(`Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
