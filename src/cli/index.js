/**
 * TrafegoDNS CLI Module
 * 
 * Provides a command-line interface to interact with the TrafegoDNS API
 * Uses the ApiClient for all operations
 */
const logger = require('../utils/logger');
const readline = require('readline');

/**
 * Start the CLI module
 * @param {Object} apiClient - API client instance
 * @param {Object} config - Configuration object
 * @param {Object} eventBus - Event bus instance
 */
async function start(apiClient, config, eventBus) {
  // Only initialize CLI if in interactive mode
  if (process.stdout.isTTY && !process.env.DISABLE_CLI) {
    logger.info('CLI module initialized. Type "help" for available commands.');
    initCli(apiClient, config, eventBus);
  }
}

/**
 * Initialize the CLI interface
 */
function initCli(apiClient, config, eventBus) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'TrafegoDNS> '
  });

  // Start prompt
  rl.prompt();

  // Handle commands
  rl.on('line', async (line) => {
    try {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) {
        rl.prompt();
        return;
      }
      
      const [command, ...args] = trimmedLine.split(' ');
      
      switch (command.toLowerCase()) {
        case 'help':
          displayHelp();
          break;
          
        case 'status':
          const status = await apiClient.getStatus();
          console.log('System Status:');
          console.log(JSON.stringify(status, null, 2));
          break;
          
        case 'records':
        case 'dns':
          const records = await apiClient.getDnsRecords();
          console.log('DNS Records:');
          if (records.data && records.data.length > 0) {
            records.data.forEach(record => {
              console.log(`${record.id}: ${record.name} (${record.type}) -> ${record.content}`);
            });
          } else {
            console.log('No DNS records found');
          }
          break;
          
        case 'config':
          const config = await apiClient.getConfig();
          console.log('Configuration:');
          console.log(JSON.stringify(config, null, 2));
          break;
          
        case 'hostnames':
          const hostnames = await apiClient.getHostnames();
          console.log('Managed Hostnames:');
          if (hostnames.data && hostnames.data.length > 0) {
            hostnames.data.forEach(hostname => {
              console.log(`- ${hostname}`);
            });
          } else {
            console.log('No managed hostnames found');
          }
          break;
          
        case 'containers':
          const containers = await apiClient.getContainers();
          console.log('Docker Containers:');
          if (containers.data && containers.data.length > 0) {
            containers.data.forEach(container => {
              console.log(`${container.id}: ${container.name} (${container.status})`);
            });
          } else {
            console.log('No containers found');
          }
          break;
          
        case 'refresh':
          console.log('Refreshing DNS records...');
          await apiClient.refreshDns();
          console.log('DNS refresh completed');
          break;
          
        case 'add':
          if (args.length < 3) {
            console.log('Usage: add <hostname> <type> <content> [ttl] [proxied]');
            break;
          }
          
          const [hostname, type, content] = args;
          const ttl = args[3] ? parseInt(args[3]) : undefined;
          const proxied = args[4] ? args[4].toLowerCase() === 'true' : undefined;
          
          const newRecord = await apiClient.createDnsRecord({
            name: hostname,
            type: type.toUpperCase(),
            content,
            ttl,
            proxied
          });
          
          console.log(`DNS record created: ${newRecord.name} (${newRecord.type})`);
          break;
          
        case 'delete':
        case 'del':
          if (args.length < 1) {
            console.log('Usage: delete <record_id>');
            break;
          }
          
          await apiClient.deleteDnsRecord(args[0]);
          console.log(`DNS record ${args[0]} deleted`);
          break;
          
        case 'exit':
        case 'quit':
          rl.close();
          return;
          
        default:
          console.log(`Unknown command: ${command}. Type "help" for available commands.`);
      }
    } catch (error) {
      console.error(`Error: ${error.message || 'Unknown error'}`);
    }
    
    rl.prompt();
  }).on('close', () => {
    console.log('CLI session ended. Server continues running in the background.');
    // Don't exit the process as the server should continue running
  });
}

/**
 * Display help information
 */
function displayHelp() {
  console.log('\nTrafegoDNS CLI Commands:');
  console.log('  help               - Show this help message');
  console.log('  status             - Show system status');
  console.log('  records, dns       - List all DNS records');
  console.log('  config             - Show current configuration');
  console.log('  hostnames          - List managed hostnames');
  console.log('  containers         - List Docker containers');
  console.log('  refresh            - Force DNS refresh');
  console.log('  add <name> <type> <content> [ttl] [proxied] - Add a new DNS record');
  console.log('  delete, del <id>   - Delete a DNS record');
  console.log('  exit, quit         - Exit the CLI (server continues running)\n');
}

module.exports = { start };