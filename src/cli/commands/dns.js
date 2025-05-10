/**
 * DNS management commands for the CLI
 */
const logger = require('../../utils/logger');
const chalk = require('chalk');

/**
 * Refresh DNS records from provider
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function refreshRecords(args, context) {
  try {
    const { apiClient, actionBroker } = context;
    
    // Try API client first
    if (apiClient) {
      console.log(chalk.yellow('Refreshing DNS records via API...'));
      try {
        if (apiClient.refreshDnsRecords) {
          await apiClient.refreshDnsRecords();
        } else if (apiClient.refreshDns) {
          await apiClient.refreshDns();
        } else {
          throw new Error('No suitable refresh method found in API client');
        }
        console.log(chalk.green('DNS records refreshed successfully'));
        return;
      } catch (err) {
        console.warn(chalk.yellow(`API refresh failed: ${err.message}, trying alternate methods...`));
      }
    }
    
    // Then try action broker
    if (actionBroker) {
      console.log(chalk.yellow('Refreshing DNS records via action broker...'));
      try {
        await actionBroker.dispatch({
          type: 'DNS_REFRESH',
          metadata: { source: 'cli' }
        });
        console.log(chalk.green('DNS records refreshed successfully'));
        return;
      } catch (err) {
        console.warn(chalk.yellow(`Action broker failed: ${err.message}, trying direct access...`));
      }
    }

    // Try direct service access
    try {
      if (global.services && global.services.DNSManager) {
        console.log(chalk.yellow('Refreshing DNS records via direct service access...'));
        if (typeof global.services.DNSManager.refreshRecords === 'function') {
          await global.services.DNSManager.refreshRecords();
          console.log(chalk.green('DNS records refreshed successfully'));
          return;
        }
      }
    } catch (err) {
      console.warn(chalk.yellow(`Direct service access failed: ${err.message}`));
    }

    console.log(chalk.red('Cannot refresh DNS records: No API client, action broker, or direct service access available'));
    console.log('Make sure you are running this command from within the TrafegoDNS container with appropriate permissions');
  } catch (error) {
    console.error(chalk.red(`Error refreshing DNS records: ${error.message}`));
  }
}

/**
 * Process hostnames and update DNS records
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function processRecords(args, context) {
  try {
    const { apiClient } = context;
    const forceUpdate = args.force || false;
    
    console.log(chalk.yellow(`Processing DNS records${forceUpdate ? ' (forced)' : ''}...`));
    
    // Use API if available
    if (apiClient) {
      try {
        // Check if API has a process endpoint
        const response = await apiClient.processDnsRecords(forceUpdate);
        
        if (response.status === 'success') {
          console.log(chalk.green('DNS records processed successfully'));
          console.log(`\nSummary:`);
          console.log(`- Created: ${response.data.created || 0} records`);
          console.log(`- Updated: ${response.data.updated || 0} records`);
          console.log(`- Deleted: ${response.data.deleted || 0} records`);
          console.log(`- Orphaned: ${response.data.orphaned || 0} records`);
          console.log(`- Total: ${response.data.total || 0} records processed`);
        } else {
          console.warn(chalk.yellow('DNS processing returned an unexpected response'));
        }
        return;
      } catch (apiError) {
        console.warn(chalk.yellow(`API method failed: ${apiError.message}`));
        console.log('Trying alternative methods...');
      }
    }
    
    // Direct method using globals - access application services directly
    try {
      if (global.services && global.services.Monitor) {
        const monitor = global.services.Monitor;
        
        console.log('Processing via direct service access...');
        
        // Force a poll of Traefik if it's a Traefik monitor
        if (monitor.pollTraefik && typeof monitor.pollTraefik === 'function') {
          await monitor.pollTraefik(true);
          console.log(chalk.green('Traefik routes polled successfully'));
        }
        
        // Process hostnames if available
        if (monitor.processHostnames && typeof monitor.processHostnames === 'function') {
          const result = await monitor.processHostnames(forceUpdate);
          console.log(chalk.green('Hostnames processed successfully'));
          
          // Display results if available
          if (result && typeof result === 'object') {
            console.log(`\nSummary:`);
            console.log(`- Created: ${result.created || 0} records`);
            console.log(`- Updated: ${result.updated || 0} records`);
            console.log(`- Orphaned: ${result.orphaned || 0} records`);
            console.log(`- Total: ${result.total || 0} hostnames processed`);
          }
        } else {
          console.warn(chalk.yellow('Direct hostname processing not available'));
        }
        
        return;
      }
    } catch (directError) {
      console.warn(chalk.yellow(`Direct service access failed: ${directError.message}`));
    }
    
    // If we got here, no method worked
    console.error(chalk.red('Cannot process DNS records: No valid method available'));
    console.log('Make sure you are running this command from within the TrafegoDNS container');
  } catch (error) {
    console.error(chalk.red(`Error processing DNS records: ${error.message}`));
  }
}

module.exports = {
  refreshRecords,
  processRecords
};