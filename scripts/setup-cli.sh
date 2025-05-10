#!/bin/sh
# Setup script for TrafegoDNS CLI
set -e

# Create bin directory if it doesn't exist
mkdir -p /app/bin

# Create CLI entry script
cat > /app/bin/trafego << 'EOF'
#!/usr/bin/env node

/**
 * TrafegoDNS CLI tool
 * Provides command-line interface for interacting with TrafegoDNS
 */
const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

// Set up CLI context
const context = {};

// Check if we can access the application state and services
try {
  // Try to access global objects (works when run within the application)
  if (global.actionBroker) {
    context.actionBroker = global.actionBroker;
    context.stateStore = global.stateStore;
    context.apiClient = global.apiClient;
  } else {
    // We're running as a standalone CLI
    // Initialize ApiClient if needed
    const ApiClient = require('../src/cli/apiClient');
    const config = {
      localAuthBypass: {
        cliToken: process.env.CLI_TOKEN || 'trafegodns-cli'
      }
    };
    context.apiClient = new ApiClient(config);
  }
} catch (error) {
  // Continue without context - commands will handle missing context
  console.warn(chalk.yellow('Warning: Running in standalone mode, some features may be limited'));
}

// Create DNS commands
const dnsCommands = {
  refreshRecords: async (args, ctx) => {
    try {
      console.log(chalk.yellow('Refreshing DNS records...'));
      
      // Try API client first
      if (ctx.apiClient) {
        await ctx.apiClient.refreshDns();
      }
      // Then try action broker
      else if (ctx.actionBroker) {
        await ctx.actionBroker.dispatch({
          type: 'DNS_REFRESH',
          metadata: { source: 'cli' }
        });
      }
      // Last resort - try direct access
      else if (global.services && global.services.DNSManager) {
        await global.services.DNSManager.refreshRecords();
      }
      else {
        console.log(chalk.red('No method available to refresh DNS records'));
        return;
      }
      
      console.log(chalk.green('DNS records refreshed successfully'));
    } catch (error) {
      console.error(chalk.red(`Error refreshing DNS records: ${error.message}`));
    }
  },
  
  processRecords: async (args, ctx) => {
    try {
      const forceUpdate = args.force || false;
      
      console.log(chalk.yellow(`Processing DNS records${forceUpdate ? ' (forced)' : ''}...`));
      
      // Use API if available
      if (ctx.apiClient) {
        try {
          // Try to use processDnsRecords method
          if (ctx.apiClient.processDnsRecords) {
            const response = await ctx.apiClient.processDnsRecords(forceUpdate);
            
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
          }
        } catch (apiError) {
          console.warn(chalk.yellow(`API method failed: ${apiError.message}`));
        }
      }
      
      // Direct method using globals
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
    } catch (error) {
      console.error(chalk.red(`Error processing DNS records: ${error.message}`));
    }
  }
};

// Create DB commands
const dbCommands = {
  listRecords: async (args, ctx) => {
    try {
      console.log(chalk.yellow('Listing DNS records...'));
      
      // Try API client first
      if (ctx.apiClient && ctx.apiClient.getDnsRecords) {
        const response = await ctx.apiClient.getDnsRecords();
        if (response.data && Array.isArray(response.data)) {
          console.log(`Found ${response.data.length} DNS records`);
          response.data.forEach(record => {
            const id = record.id || record.record_id;
            const status = record.orphaned ? 'Orphaned' : (record.managed ? 'Managed' : 'Unmanaged');
            console.log(`${id.substr(0, 8)}... | ${record.type.padEnd(6)} | ${record.name.padEnd(30)} | ${status}`);
          });
        } else {
          console.log('No DNS records found or unexpected response format');
        }
        return;
      }
      
      // Try direct access to global state
      if (global.stateStore) {
        const records = global.stateStore.getState('dns.records') || [];
        console.log(`Found ${records.length} DNS records`);
        records.forEach(record => {
          const id = record.id || record.record_id;
          const status = record.orphaned ? 'Orphaned' : (record.managed ? 'Managed' : 'Unmanaged');
          console.log(`${id.substr(0, 8)}... | ${record.type.padEnd(6)} | ${record.name.padEnd(30)} | ${status}`);
        });
        return;
      }
      
      // Last resort - try direct database access
      if (global.services && global.services.DNSManager) {
        const records = await global.services.DNSManager.dnsProvider.getRecordsFromCache(true) || [];
        console.log(`Found ${records.length} DNS records`);
        records.forEach(record => {
          const id = record.id || record.record_id;
          const status = global.services.DNSManager.recordTracker.isRecordOrphaned(record) ? 'Orphaned' : 
                        (global.services.DNSManager.recordTracker.isTracked(record) ? 'Managed' : 'Unmanaged');
          console.log(`${id.substr(0, 8)}... | ${record.type.padEnd(6)} | ${record.name.padEnd(30)} | ${status}`);
        });
        return;
      }
      
      console.log(chalk.red('No method available to list DNS records'));
    } catch (error) {
      console.error(chalk.red(`Error listing DNS records: ${error.message}`));
    }
  },
  
  status: async (args, ctx) => {
    try {
      console.log(chalk.yellow('Checking database status...'));
      
      // Try direct access to global database object
      if (global.services && global.services.DNSManager) {
        console.log('DNS provider: ' + (global.services.DNSManager.config.dnsProvider || 'unknown'));
        console.log('Domain: ' + (global.services.DNSManager.config.getProviderDomain() || 'unknown'));
        if (global.stateStore) {
          const records = global.stateStore.getState('dns.records') || [];
          console.log(`Records: ${records.length}`);
        }
        return;
      }
      
      console.log(chalk.red('No method available to check database status'));
    } catch (error) {
      console.error(chalk.red(`Error checking database status: ${error.message}`));
    }
  },
  
  cleanup: async (args, ctx) => {
    try {
      console.log(chalk.yellow('Cleaning up orphaned records...'));
      
      // Try API client first
      if (ctx.apiClient && ctx.apiClient.runCleanup) {
        await ctx.apiClient.runCleanup();
        console.log(chalk.green('Cleanup completed'));
        return;
      }
      
      // Try action broker if available
      if (ctx.actionBroker) {
        await ctx.actionBroker.dispatch({
          type: 'DNS_ORPHANED_CLEANUP',
          metadata: { source: 'cli', forceImmediate: true }
        });
        console.log(chalk.green('Cleanup completed'));
        return;
      }
      
      // Last resort - try direct access
      if (global.services && global.services.DNSManager && global.services.DNSManager.cleanupOrphanedRecords) {
        await global.services.DNSManager.cleanupOrphanedRecords([]);
        console.log(chalk.green('Cleanup completed'));
        return;
      }
      
      console.log(chalk.red('No method available to cleanup orphaned records'));
    } catch (error) {
      console.error(chalk.red(`Error cleaning up orphaned records: ${error.message}`));
    }
  }
};

// Set up CLI program
program
  .name('trafego')
  .description('TrafegoDNS CLI tool')
  .version(pkg?.version || '1.11.0');

// DNS commands
program
  .command('dns')
  .description('DNS management commands')
  .addCommand(
    program.createCommand('refresh')
      .description('Refresh DNS records from provider')
      .action(args => dnsCommands.refreshRecords(args, context))
  )
  .addCommand(
    program.createCommand('process')
      .description('Process hostnames and update DNS records')
      .option('-f, --force', 'Force update of all DNS records')
      .action(args => dnsCommands.processRecords(args, context))
  );

// Database commands  
program
  .command('db')
  .description('Database management commands')
  .addCommand(
    program.createCommand('records')
      .description('List DNS records')
      .action(args => dbCommands.listRecords(args, context))
  )
  .addCommand(
    program.createCommand('status')
      .description('Show database status')
      .action(args => dbCommands.status(args, context))
  )
  .addCommand(
    program.createCommand('cleanup')
      .description('Clean up orphaned records')
      .action(args => dbCommands.cleanup(args, context))
  );

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(' ')}`));
  console.error('See --help for a list of available commands.');
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
EOF

# Make script executable
chmod +x /app/bin/trafego

# Create CLI wrapper in /usr/local/bin for system-wide access
cat > /usr/local/bin/trafego << 'EOF'
#!/bin/sh
exec node /app/bin/trafego "$@"
EOF

chmod +x /usr/local/bin/trafego

# Install required dependencies if not already installed
cd /app
npm install --no-save commander@11.1.0 chalk@4.1.2

echo "TrafegoDNS CLI setup complete! You can now use 'trafego' command."