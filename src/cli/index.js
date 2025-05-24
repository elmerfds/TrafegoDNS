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
      
      // Import db commands once at the beginning
      const dbCommands = require('./commands/db');
      
      switch (command.toLowerCase()) {
        case 'help':
          displayHelp();
          break;
          
        case 'db':
          // Handle database commands
          const subCommand = args[0];
          const dbArgs = args.slice(1);
          
          switch (subCommand) {
            case 'list':
              // Parse arguments for db list
              const listArgs = {};
              for (let i = 0; i < dbArgs.length; i++) {
                if (dbArgs[i] === '--managed') listArgs.managed = true;
                else if (dbArgs[i] === '--orphaned') listArgs.orphaned = true;
                else if (dbArgs[i] === '--type' && dbArgs[i+1]) {
                  listArgs.type = dbArgs[i+1];
                  i++;
                }
                else if (dbArgs[i] === '--limit' && dbArgs[i+1]) {
                  listArgs.limit = parseInt(dbArgs[i+1]);
                  i++;
                }
              }
              await dbCommands.listRecords(listArgs, { apiClient });
              break;
              
            case 'status':
              await dbCommands.status({}, { apiClient });
              break;
              
            case 'cleanup':
              await dbCommands.cleanupOrphaned({}, { apiClient });
              break;
              
            case 'refresh':
              await dbCommands.refreshRecords({}, { apiClient });
              break;
              
            case 'sync':
              await dbCommands.syncTables({}, { apiClient });
              break;
              
            default:
              console.log('Available db commands:');
              console.log('  db list [--managed] [--orphaned] [--type TYPE] [--limit N]');
              console.log('  db status');
              console.log('  db cleanup');
              console.log('  db refresh');
              console.log('  db sync');
          }
          break;
          
        case 'status':
          const status = await apiClient.getStatus();
          console.log('System Status:');
          console.log(JSON.stringify(status, null, 2));
          break;
          
        case 'records':
        case 'dns':
          // Use the db command for better output
          await dbCommands.listRecords(args, { apiClient });
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
  console.log('  records, dns       - List all DNS records (with managed status)');
  console.log('  config             - Show current configuration');
  console.log('  hostnames          - List managed hostnames');
  console.log('  containers         - List Docker containers');
  console.log('  refresh            - Force DNS refresh');
  console.log('  add <name> <type> <content> [ttl] [proxied] - Add a new DNS record');
  console.log('  delete, del <id>   - Delete a DNS record');
  console.log('  exit, quit         - Exit the CLI (server continues running)');
  console.log('\nDatabase Commands:');
  console.log('  db list [options]  - List DNS records from database');
  console.log('    --managed        - Show only app-managed records');
  console.log('    --orphaned       - Show only orphaned records');
  console.log('    --type TYPE      - Filter by record type');
  console.log('    --limit N        - Limit number of results');
  console.log('  db status          - Show database statistics');
  console.log('  db cleanup         - Mark orphaned records for cleanup');
  console.log('  db refresh         - Refresh DNS records from provider');
  console.log('  db sync            - Sync DNS record tables\n');
}

module.exports = { start };