/**
 * Test CloudFlare Zero Trust tunnel hostname cleanup
 * Run this with: node test-cfzerotrust-cleanup.js
 */
const config = require('./src/config');
const EventBus = require('./src/events/EventBus');
const DNSManager = require('./src/services/DNSManager');
const logger = require('./src/utils/logger');

// Set logger to debug level
logger.level = 4; // TRACE level

// Create a minimal test environment
async function runTest() {
  console.log('=== STARTING CFZEROTRUST CLEANUP TEST ===');
  
  // Create event bus and DNS manager
  const eventBus = new EventBus();
  const dnsManager = new DNSManager(config, eventBus);
  
  try {
    // Initialize the manager
    console.log('Initializing DNS manager...');
    await dnsManager.init();
    
    // 1. Test getting current tunnel hostnames
    console.log('\nStep 1: Getting current tunnel hostnames...');
    const allRecords = await dnsManager.dnsProvider.getRecordsFromCache(true); // force refresh
    console.log(`Found ${allRecords.length} records in tunnel cache`);
    
    // 2. Check recordTracker state
    console.log('\nStep 2: Checking RecordTracker state...');
    const trackedRecords = dnsManager.recordTracker.getAllTrackedRecords();
    const cfRecords = trackedRecords.filter(record => 
      record.provider === 'cfzerotrust'
    );
    
    console.log(`Found ${trackedRecords.length} total tracked records`);
    console.log(`Found ${cfRecords.length} tracked CF Zero Trust records`);
    
    if (cfRecords.length > 0) {
      console.log('\nCurrent tracked CF Zero Trust records:');
      cfRecords.forEach(record => {
        console.log(`- ${record.name} (ID: ${record.id}, Tunnel: ${record.tunnelId || 'default'})`);
      });
    }
    
    // 3. Check in-memory tracking
    console.log('\nStep 3: Checking in-memory tracking...');
    if (global.tunnelHostnames) {
      console.log(`Found ${global.tunnelHostnames.size} in-memory tracked hostnames`);
      console.log('In-memory tracked hostnames:');
      for (const [hostname, info] of global.tunnelHostnames.entries()) {
        console.log(`- ${hostname} (ID: ${info.id}, Tunnel: ${info.tunnelId || 'default'})`);
      }
    } else {
      console.log('No in-memory tracking found');
    }
    
    // 4. Run cleanup with empty active list to simulate all containers stopped
    console.log('\nStep 4: Running cleanup with empty active list...');
    await dnsManager.cleanupOrphanedRecords([]);
    
    // 5. Verify state after cleanup
    console.log('\nStep 5: Verifying state after cleanup...');
    const remainingTrackedRecords = dnsManager.recordTracker.getAllTrackedRecords();
    const remainingCfRecords = remainingTrackedRecords.filter(record => 
      record.provider === 'cfzerotrust'
    );
    
    console.log(`Found ${remainingTrackedRecords.length} total tracked records after cleanup`);
    console.log(`Found ${remainingCfRecords.length} tracked CF Zero Trust records after cleanup`);
    
    if (remainingCfRecords.length > 0) {
      console.log('\nRemaining tracked CF Zero Trust records:');
      remainingCfRecords.forEach(record => {
        console.log(`- ${record.name} (ID: ${record.id}, Tunnel: ${record.tunnelId || 'default'})`);
      });
    }
    
    // 6. Check in-memory tracking after cleanup
    console.log('\nStep 6: Checking in-memory tracking after cleanup...');
    if (global.tunnelHostnames) {
      console.log(`Found ${global.tunnelHostnames.size} in-memory tracked hostnames after cleanup`);
      if (global.tunnelHostnames.size > 0) {
        console.log('Remaining in-memory tracked hostnames:');
        for (const [hostname, info] of global.tunnelHostnames.entries()) {
          console.log(`- ${hostname} (ID: ${info.id}, Tunnel: ${info.tunnelId || 'default'})`);
        }
      }
    } else {
      console.log('No in-memory tracking found after cleanup');
    }
    
    console.log('\n=== TEST COMPLETED ===');
  } catch (error) {
    console.error(`Error during test: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest().then(() => {
  console.log('Test script completed');
  process.exit(0);
}).catch(error => {
  console.error(`Fatal error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
