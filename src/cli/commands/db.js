/**
 * Database management commands for the CLI
 */
const logger = require('../../utils/logger');
const Table = require('cli-table3');
const chalk = require('chalk');

/**
 * List DNS records from the database
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function listRecords(args, context) {
  try {
    const { apiClient, actionBroker, stateStore } = context;
    
    // Set up filtering options
    const options = {
      type: args.type || undefined,
      orphaned: args.orphaned ? true : undefined,
      managed: args.managed ? true : undefined,
      preserve: args.preserve ? true : undefined,
      limit: args.limit || 100
    };

    let records;
    
    // Try to use API client first if available
    if (apiClient) {
      const response = await apiClient.getDnsRecords(options);
      records = response.data;
    } 
    // Then try action broker if available
    else if (actionBroker) {
      await actionBroker.dispatch({
        type: 'DNS_RECORDS_FETCH',
        metadata: { source: 'cli' }
      });
      records = stateStore.getState('dns.records');
      
      // Apply filters
      if (options.type) {
        records = records.filter(r => r.type === options.type.toUpperCase());
      }
      if (options.orphaned) {
        records = records.filter(r => r.orphaned === true);
      }
      if (options.managed) {
        records = records.filter(r => r.managed === true);
      }
      
      // Apply limit
      records = records.slice(0, options.limit);
    }
    // Last resort, try to load the database directly
    else {
      try {
        const database = require('../../database');
        if (!database.isInitialized()) {
          await database.initialize();
        }
        
        let query = 'SELECT * FROM dns_records';
        const params = [];
        const conditions = [];
        
        if (options.type) {
          conditions.push('type = ?');
          params.push(options.type.toUpperCase());
        }
        if (options.orphaned) {
          conditions.push('is_orphaned = 1');
        }
        
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY tracked_at DESC LIMIT ?';
        params.push(options.limit);
        
        records = await database.db.all(query, params);
      } catch (dbError) {
        console.error(chalk.red(`Failed to query database: ${dbError.message}`));
        throw dbError;
      }
    }
    
    if (!records || records.length === 0) {
      console.log(chalk.yellow('No DNS records found'));
      return;
    }
    
    // Create a table for output
    const table = new Table({
      head: [
        chalk.cyan('ID'), 
        chalk.cyan('Type'), 
        chalk.cyan('Name'), 
        chalk.cyan('Content'), 
        chalk.cyan('Status')
      ],
      colWidths: [10, 8, 30, 35, 10]
    });
    
    // Add records to table
    for (const record of records) {
      const id = record.id || record.record_id;
      const truncatedId = id.length > 8 ? id.substr(0, 8) + '...' : id;
      
      let status = '';
      if (record.is_orphaned || record.orphaned) {
        status = chalk.red('Orphaned');
      } else if (record.managed) {
        status = chalk.green('Managed');
      } else {
        status = chalk.gray('Unmanaged');
      }
      
      table.push([
        truncatedId,
        record.type,
        record.name,
        record.content || record.data || record.value || '',
        status
      ]);
    }
    
    // Print table
    console.log(table.toString());
    console.log(`Total: ${records.length} records`);
  } catch (error) {
    console.error(chalk.red(`Error listing records: ${error.message}`));
  }
}

/**
 * Show database status and statistics
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function status(args, context) {
  try {
    // Try to get access to the database
    let database;
    try {
      database = require('../../database');
      if (!database.isInitialized()) {
        await database.initialize();
      }
    } catch (dbError) {
      console.error(chalk.red(`Database not available: ${dbError.message}`));
      console.log(chalk.yellow('Falling back to JSON storage'));
      return;
    }
    
    console.log(chalk.cyan('=== Database Status ==='));
    
    // Get database status
    let dnsRecordCount = 0;
    let userCount = 0;
    let orphanedCount = 0;
    let tokenCount = 0;
    
    try {
      // Get DNS record counts
      const recordQuery = 'SELECT COUNT(*) as count FROM dns_records';
      const recordResult = await database.db.get(recordQuery);
      dnsRecordCount = recordResult?.count || 0;
      
      // Get orphaned record count
      const orphanedQuery = 'SELECT COUNT(*) as count FROM dns_records WHERE is_orphaned = 1';
      const orphanedResult = await database.db.get(orphanedQuery);
      orphanedCount = orphanedResult?.count || 0;
      
      // Get user count
      const userQuery = 'SELECT COUNT(*) as count FROM users';
      const userResult = await database.db.get(userQuery);
      userCount = userResult?.count || 0;
      
      // Get token count
      const tokenQuery = 'SELECT COUNT(*) as count FROM revoked_tokens';
      const tokenResult = await database.db.get(tokenQuery);
      tokenCount = tokenResult?.count || 0;
      
      // Create stats table
      const table = new Table();
      
      table.push(
        { 'Database Type': chalk.green('SQLite') },
        { 'Database Path': chalk.green('/config/data/trafegodns.db') },
        { 'DNS Records': chalk.green(dnsRecordCount.toString()) },
        { 'Orphaned Records': orphanedCount > 0 ? chalk.yellow(orphanedCount.toString()) : chalk.green('0') },
        { 'Users': chalk.green(userCount.toString()) },
        { 'Revoked Tokens': chalk.green(tokenCount.toString()) }
      );
      
      console.log(table.toString());
    } catch (error) {
      console.error(chalk.red(`Error getting database stats: ${error.message}`));
    }
  } catch (error) {
    console.error(chalk.red(`Error checking database status: ${error.message}`));
  }
}

/**
 * Cleanup orphaned records immediately
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function cleanupOrphaned(args, context) {
  try {
    const { apiClient, actionBroker } = context;
    let result;
    
    // Try API client first
    if (apiClient) {
      console.log(chalk.yellow('Running cleanup via API...'));
      result = await apiClient.runDnsCleanup();
      console.log(chalk.green('Cleanup completed successfully'));
      return;
    }
    
    // Then try action broker
    if (actionBroker) {
      console.log(chalk.yellow('Running cleanup via action broker...'));
      await actionBroker.dispatch({
        type: 'DNS_ORPHANED_CLEANUP',
        metadata: { 
          source: 'cli',
          forceImmediate: true
        }
      });
      console.log(chalk.green('Cleanup completed successfully'));
      return;
    }
    
    // Last resort, try direct database access
    try {
      console.log(chalk.yellow('Running cleanup via direct database access...'));
      const database = require('../../database');
      if (!database.isInitialized()) {
        await database.initialize();
      }
      
      // Delete orphaned records
      const deleteQuery = 'DELETE FROM dns_records WHERE is_orphaned = 1';
      const result = await database.db.run(deleteQuery);
      
      console.log(chalk.green(`Cleanup completed: ${result.changes} records deleted`));
    } catch (dbError) {
      console.error(chalk.red(`Failed to cleanup via database: ${dbError.message}`));
      throw dbError;
    }
  } catch (error) {
    console.error(chalk.red(`Error cleaning up orphaned records: ${error.message}`));
  }
}

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
      await apiClient.refreshDnsRecords();
      console.log(chalk.green('DNS records refreshed successfully'));
      return;
    }
    
    // Then try action broker
    if (actionBroker) {
      console.log(chalk.yellow('Refreshing DNS records via action broker...'));
      await actionBroker.dispatch({
        type: 'DNS_REFRESH',
        metadata: { source: 'cli' }
      });
      console.log(chalk.green('DNS records refreshed successfully'));
      return;
    }
    
    console.log(chalk.red('Cannot refresh DNS records: No API client or action broker available'));
  } catch (error) {
    console.error(chalk.red(`Error refreshing DNS records: ${error.message}`));
  }
}

module.exports = {
  listRecords,
  status,
  cleanupOrphaned,
  refreshRecords
};