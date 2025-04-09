/**
 * Enhanced debugging for orphaned record cleanup
 * Run this script with: node debug-orphaned-records.js
 */
const fs = require('fs');
const path = require('path');

// Create a debug log file
const logFile = path.join(__dirname, 'cleanup-debug.log');
fs.writeFileSync(logFile, `Cleanup Debug Log - ${new Date().toISOString()}\n\n`, 'utf8');

function debugLog(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(logFile, logMessage, 'utf8');
}

// Load the DNSManager cleanupOrphanedRecords method
const DNSManager = require('./src/services/DNSManager');

// Add debugging hooks to DNSManager
const originalCleanupMethod = DNSManager.prototype.cleanupOrphanedRecords;

DNSManager.prototype.cleanupOrphanedRecords = async function(activeHostnames) {
  debugLog(`=== STARTING CLEANUP PROCESS ===`);
  debugLog(`Active hostnames count: ${activeHostnames.length}`);
  debugLog(`Active hostnames: ${activeHostnames.join(', ')}`);
  debugLog(`DNS Provider: ${this.config.dnsProvider}`);
  
  // Debug record tracker state
  try {
    const allTrackedRecords = this.recordTracker.getAllTrackedRecords();
    const cfzerotrustRecords = allTrackedRecords.filter(record => 
      record.provider === 'cfzerotrust'
    );
    
    debugLog(`Total tracked records: ${allTrackedRecords.length}`);
    debugLog(`CFZeroTrust tracked records: ${cfzerotrustRecords.length}`);
    
    // Log all CFZeroTrust tracked records
    if (cfzerotrustRecords.length > 0) {
      debugLog(`== CFZeroTrust tracked records ==`);
      cfzerotrustRecords.forEach(record => {
        debugLog(`  - ${record.name} (ID: ${record.id}, Tunnel: ${record.tunnelId || 'unknown'})`);
      });
    }
    
    // Debug in-memory tracking
    if (global.tunnelHostnames) {
      debugLog(`In-memory tunnel hostnames: ${global.tunnelHostnames.size}`);
      for (const [hostname, info] of global.tunnelHostnames.entries()) {
        debugLog(`  - ${hostname} (ID: ${info.id}, Tunnel: ${info.tunnelId || 'unknown'})`);
      }
    } else {
      debugLog(`No in-memory tunnel hostnames found`);
    }
    
    // Log preserve hostnames
    const preservedHostnames = this.recordTracker.preserveHostnames || [];
    debugLog(`Preserved hostnames: ${preservedHostnames.length > 0 ? preservedHostnames.join(', ') : 'none'}`);
    
    // Log managed hostnames
    if (this.recordTracker.managedHostnames && this.recordTracker.managedHostnames.length > 0) {
      debugLog(`Managed hostnames: ${this.recordTracker.managedHostnames.length}`);
      this.recordTracker.managedHostnames.forEach(h => {
        debugLog(`  - ${h.hostname} (${h.type})`);
      });
    } else {
      debugLog(`No managed hostnames found`);
    }
  } catch (error) {
    debugLog(`Error debugging record tracker: ${error.message}`);
  }
  
  // Create hook to monitor deletion attempts
  const originalDeleteRecord = this.dnsProvider.deleteRecord;
  this.dnsProvider.deleteRecord = async function(id) {
    debugLog(`Attempting to delete record with ID: ${id}`);
    try {
      const result = await originalDeleteRecord.call(this, id);
      debugLog(`Deletion result for ${id}: ${result ? 'Success' : 'Failed'}`);
      return result;
    } catch (error) {
      debugLog(`Error deleting record ${id}: ${error.message}`);
      throw error;
    }
  };
  
  // Create hook for removeTrackedHostname
  if (typeof this.dnsProvider.removeTrackedHostname === 'function') {
    const originalRemoveTracked = this.dnsProvider.removeTrackedHostname;
    this.dnsProvider.removeTrackedHostname = function(hostname, recordTracker) {
      debugLog(`Attempting to remove tracked hostname: ${hostname}`);
      try {
        originalRemoveTracked.call(this, hostname, recordTracker);
        debugLog(`Successfully removed ${hostname} from tracking`);
      } catch (error) {
        debugLog(`Error removing tracked hostname ${hostname}: ${error.message}`);
      }
    };
  }
  
  // Now call the original method
  try {
    debugLog(`Calling original cleanup method...`);
    await originalCleanupMethod.call(this, activeHostnames);
    debugLog(`Original cleanup method completed successfully`);
  } catch (error) {
    debugLog(`Error in original cleanup method: ${error.message}`);
    debugLog(`${error.stack}`);
  }
  
  // Restore original methods
  this.dnsProvider.deleteRecord = originalDeleteRecord;
  if (typeof this.dnsProvider.removeTrackedHostname === 'function') {
    this.dnsProvider.removeTrackedHostname = originalRemoveTracked;
  }
  
  debugLog(`=== CLEANUP PROCESS COMPLETED ===\n`);
};

// Execute a force debug check
async function runDebugCheck() {
  try {
    // Load config and create manager
    const config = require('./src/config');
    const EventBus = require('./src/events/EventBus');
    const eventBus = new EventBus();
    
    debugLog(`Creating DNSManager instance with provider: ${config.dnsProvider}`);
    const dnsManager = new DNSManager(config, eventBus);
    
    // Initialize
    debugLog(`Initializing DNSManager...`);
    await dnsManager.init();
    
    // Run cleanup with empty list to see what would be cleaned up
    debugLog(`Running cleanup with empty active hostnames list...`);
    await dnsManager.cleanupOrphanedRecords([]);
    
    debugLog(`Debug check completed successfully`);
  } catch (error) {
    debugLog(`Error in debug check: ${error.message}`);
    debugLog(`${error.stack}`);
  }
}

// Run the debug check if executed directly
if (require.main === module) {
  debugLog(`Starting debug check...`);
  runDebugCheck().then(() => {
    debugLog(`Debug check finished. Log file: ${logFile}`);
    process.exit(0);
  }).catch(error => {
    debugLog(`Fatal error: ${error.message}`);
    debugLog(`${error.stack}`);
    process.exit(1);
  });
}

module.exports = {
  patchForDebugging: function() {
    debugLog(`Applied cleanup debugging patch`);
  }
};
