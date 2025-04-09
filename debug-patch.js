/**
 * Debug patch for DNSManager to fix orphaned record cleanup
 * 
 * Apply this patch by adding this to your Docker run command:
 * -v /path/to/debug-patch.js:/app/debug-patch.js
 * 
 * Then in your app's entrypoint script, add:
 * require('./debug-patch.js');
 */

// Try to load the DNSManager
try {
  const DNSManager = require('./src/services/DNSManager');
  console.log('[Debug Patch] Successfully loaded DNSManager');

  // Store the original method
  const originalCleanupMethod = DNSManager.prototype.cleanupOrphanedRecords;

  // Override the cleanup method
  DNSManager.prototype.cleanupOrphanedRecords = async function(activeHostnames) {
    console.log(`[Debug Patch] cleanupOrphanedRecords called with ${activeHostnames ? activeHostnames.length : 0} active hostnames`);
    
    // Make sure activeHostnames is an array
    activeHostnames = Array.isArray(activeHostnames) ? activeHostnames : [];
    
    // ONLY for cfzerotrust provider - This is the critical part
    if (this.config.dnsProvider === 'cfzerotrust') {
      console.log('[Debug Patch] CloudFlare Zero Trust provider detected');
      
      try {
        // Get all tracked records
        const allTrackedRecords = this.recordTracker.getAllTrackedRecords();
        const cfzerotrustRecords = allTrackedRecords.filter(record => 
          record.provider === 'cfzerotrust'
        );
        
        console.log(`[Debug Patch] Found ${cfzerotrustRecords.length} tracked CF Zero Trust records`);
        
        // Normalize active hostnames for comparison
        const normalizedActiveHostnames = new Set(
          activeHostnames.map(hostname => hostname.toLowerCase())
        );
        
        // Find orphaned records
        const orphanedRecords = [];
        for (const record of cfzerotrustRecords) {
          const hostname = record.name;
          const isActive = normalizedActiveHostnames.has(hostname.toLowerCase());
          const shouldPreserve = this.recordTracker.shouldPreserveHostname ?
            this.recordTracker.shouldPreserveHostname(hostname) : false;
          
          console.log(`[Debug Patch] Checking ${hostname}: active=${isActive}, preserved=${shouldPreserve}`);
          
          // Only include truly orphaned records
          if (!isActive && !shouldPreserve) {
            console.log(`[Debug Patch] Found orphaned record: ${hostname}`);
            orphanedRecords.push({
              hostname,
              info: {
                tunnelId: record.tunnelId,
                id: record.id
              }
            });
          }
        }
        
        // Delete orphaned records
        if (orphanedRecords.length > 0) {
          console.log(`[Debug Patch] Found ${orphanedRecords.length} orphaned records to delete`);
          
          for (const { hostname, info } of orphanedRecords) {
            try {
              console.log(`[Debug Patch] Deleting orphaned record: ${hostname} (ID: ${info.id})`);
              
              // Delete the record using the provider
              await this.dnsProvider.deleteRecord(info.id);
              
              // Remove from tracking
              if (typeof this.dnsProvider.removeTrackedHostname === 'function') {
                this.dnsProvider.removeTrackedHostname(hostname, this.recordTracker);
              }
              
              // Also clean up memory tracking
              if (global.tunnelHostnames && global.tunnelHostnames.has(hostname)) {
                global.tunnelHostnames.delete(hostname);
              }
              
              console.log(`[Debug Patch] Successfully deleted ${hostname}`);
            } catch (error) {
              console.log(`[Debug Patch] Error deleting ${hostname}: ${error.message}`);
            }
          }
        } else {
          console.log('[Debug Patch] No orphaned records found');
        }
        
        // Return without calling original method
        return;
      } catch (error) {
        console.log(`[Debug Patch] Error in custom cleanup: ${error.message}`);
      }
    }
    
    // Call original method for other providers or if our custom logic fails
    return originalCleanupMethod.call(this, activeHostnames);
  };
  
  console.log('[Debug Patch] Successfully patched cleanupOrphanedRecords method');
} catch (error) {
  console.log(`[Debug Patch] Error applying patch: ${error.message}`);
}
