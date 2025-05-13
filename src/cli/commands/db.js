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
        
        // Use the DNS repository manager if available
        if (database.repositories && database.repositories.dnsManager) {
          const repoManager = database.repositories.dnsManager;
          
          // Choose the appropriate repository based on options
          if (options.managed) {
            // Use managed records repository
            records = await repoManager.getManagedRecords(
              process.env.DNS_PROVIDER || 'cloudflare',
              { isAppManaged: true, ...options }
            );
          } else if (options.orphaned) {
            // Use managed records repository with orphaned filter
            records = await repoManager.getManagedRecords(
              process.env.DNS_PROVIDER || 'cloudflare',
              { isOrphaned: true, ...options }
            );
          } else {
            // Use provider cache repository by default
            records = await repoManager.getProviderRecords(
              process.env.DNS_PROVIDER || 'cloudflare',
              options
            );
            
            // If provider cache is empty, fall back to managed records
            if (!records || records.length === 0) {
              records = await repoManager.getManagedRecords(
                process.env.DNS_PROVIDER || 'cloudflare',
                options
              );
            }
          }
        } else {
          // Fall back to direct database queries
          let tableName = options.managed ? 'dns_tracked_records' : 'dns_records';
          
          // Check if table exists
          const tableExists = await database.db.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name=?
          `, [tableName]);
          
          if (!tableExists) {
            // Try the other table if one doesn't exist
            tableName = tableName === 'dns_records' ? 'dns_tracked_records' : 'dns_records';
            
            const otherTableExists = await database.db.get(`
              SELECT name FROM sqlite_master
              WHERE type='table' AND name=?
            `, [tableName]);
            
            if (!otherTableExists) {
              throw new Error('No DNS record tables found in database');
            }
          }
          
          // Build query
          let query = `SELECT * FROM ${tableName}`;
          const params = [];
          const conditions = [];
          
          if (options.type) {
            conditions.push('type = ?');
            params.push(options.type.toUpperCase());
          }
          
          if (options.orphaned) {
            conditions.push('is_orphaned = 1');
          }
          
          if (tableName === 'dns_tracked_records' && options.managed) {
            conditions.push("json_extract(metadata, '$.appManaged') = 1");
          }
          
          if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
          }
          
          query += ' ORDER BY name ASC LIMIT ?';
          params.push(options.limit);
          
          records = await database.db.all(query, params);
        }
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
      const id = record.id || record.record_id || record.providerId;
      const truncatedId = id && id.length > 8 ? id.substr(0, 8) + '...' : id;
      
      let status = '';
      if (record.is_orphaned || record.isOrphaned || record.orphaned) {
        status = chalk.red('Orphaned');
      } else if (record.isAppManaged || record.managed) {
        status = chalk.green('Managed');
      } else {
        status = chalk.gray('Unmanaged');
      }
      
      table.push([
        truncatedId || '',
        record.type || '',
        record.name || '',
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
      console.error(chalk.red('ERROR: SQLite database is required. JSON storage is permanently disabled.'));
      return;
    }
    
    console.log(chalk.cyan('=== Database Status ==='));
    
    // Get database status
    let providerRecordCount = 0;
    let managedRecordCount = 0;
    let orphanedCount = 0;
    let userCount = 0;
    let tokenCount = 0;
    
    try {
      // Check which tables exist
      const dnsRecordsExists = await database.db.get(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='dns_records'
      `);
      
      const dnsTrackedRecordsExists = await database.db.get(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='dns_tracked_records'
      `);
      
      // Get provider record count
      if (dnsRecordsExists) {
        const recordQuery = 'SELECT COUNT(*) as count FROM dns_records';
        const recordResult = await database.db.get(recordQuery);
        providerRecordCount = recordResult?.count || 0;
        
        // Get orphaned record count from provider cache
        const orphanedQuery = 'SELECT COUNT(*) as count FROM dns_records WHERE is_orphaned = 1';
        const orphanedResult = await database.db.get(orphanedQuery);
        orphanedCount = orphanedResult?.count || 0;
      }
      
      // Get managed record count
      if (dnsTrackedRecordsExists) {
        const managedQuery = 'SELECT COUNT(*) as count FROM dns_tracked_records';
        const managedResult = await database.db.get(managedQuery);
        managedRecordCount = managedResult?.count || 0;
        
        // If we don't have orphaned count from provider cache, get it from tracked records
        if (orphanedCount === 0) {
          const orphanedQuery = 'SELECT COUNT(*) as count FROM dns_tracked_records WHERE is_orphaned = 1';
          const orphanedResult = await database.db.get(orphanedQuery);
          orphanedCount = orphanedResult?.count || 0;
        }
      }
      
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
        { 'Provider Cache Records': chalk.green(providerRecordCount.toString()) },
        { 'Managed Records': chalk.green(managedRecordCount.toString()) },
        { 'Orphaned Records': orphanedCount > 0 ? chalk.yellow(orphanedCount.toString()) : chalk.green('0') },
        { 'Users': chalk.green(userCount.toString()) },
        { 'Revoked Tokens': chalk.green(tokenCount.toString()) }
      );
      
      console.log(table.toString());
      
      // Provide info about tables
      if (dnsRecordsExists && dnsTrackedRecordsExists) {
        console.log(chalk.green('✓ Both DNS record tables are present and initialized'));
      } else if (dnsRecordsExists) {
        console.log(chalk.yellow('⚠ Provider cache table (dns_records) exists but managed records table (dns_tracked_records) is missing'));
      } else if (dnsTrackedRecordsExists) {
        console.log(chalk.yellow('⚠ Managed records table (dns_tracked_records) exists but provider cache table (dns_records) is missing'));
      } else {
        console.log(chalk.red('✗ No DNS record tables found in database'));
      }
      
      // Add info about repository manager
      if (database.repositories && database.repositories.dnsManager) {
        console.log(chalk.green('✓ DNS Repository Manager is available'));
      } else {
        console.log(chalk.yellow('⚠ DNS Repository Manager is not available'));
      }
      
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
      try {
        if (apiClient.runDnsCleanup) {
          result = await apiClient.runDnsCleanup();
        } else if (apiClient.client && apiClient.client.post) {
          result = await apiClient.client.post('/dns/cleanup');
        } else {
          throw new Error('No suitable API method found');
        }
        console.log(chalk.green('Cleanup completed successfully'));
        return;
      } catch (err) {
        console.warn(chalk.yellow(`API method failed: ${err.message}`));
        console.log(chalk.yellow('Trying alternative methods...'));
      }
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
      
      if (database.repositories && database.repositories.dnsManager) {
        // Use repository manager for cleanup
        console.log(chalk.yellow('Using repository manager for cleanup...'));
        
        const provider = process.env.DNS_PROVIDER || 'cloudflare';
        
        // Mark any records as orphaned if they need it
        const marked = await database.repositories.dnsManager.ensureOrphanedRecordsMarked(provider);
        console.log(chalk.green(`Marked ${marked} records as orphaned`));
        
        // We're not actually removing them here - that requires the DNSManager
        console.log(chalk.yellow('Records have been marked as orphaned but not deleted.'));
        console.log(chalk.yellow('Use the DNS cleanup API or DNSManager to actually delete them.'));
      } else {
        // Direct database approach
        
        // Check which tables exist
        const dnsRecordsExists = await database.db.get(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='dns_records'
        `);
        
        const dnsTrackedRecordsExists = await database.db.get(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='dns_tracked_records'
        `);
        
        // Mark orphaned records in both tables
        let markedCount = 0;
        
        if (dnsRecordsExists && dnsTrackedRecordsExists) {
          // Find records in managed table that don't exist in provider cache
          const orphanedRecords = await database.db.all(`
            SELECT t.provider, t.record_id
            FROM dns_tracked_records t
            LEFT JOIN dns_records r
            ON t.provider = r.provider AND t.record_id = r.record_id
            WHERE r.id IS NULL AND t.is_orphaned = 0
          `);
          
          // Mark them as orphaned
          const now = new Date().toISOString();
          for (const record of orphanedRecords) {
            await database.db.run(`
              UPDATE dns_tracked_records
              SET is_orphaned = 1, orphaned_at = ?
              WHERE provider = ? AND record_id = ?
            `, [now, record.provider, record.record_id]);
            markedCount++;
          }
        }
        
        console.log(chalk.green(`Marked ${markedCount} records as orphaned`));
        console.log(chalk.yellow('Records have been marked as orphaned but not deleted.'));
        console.log(chalk.yellow('Use the DNS cleanup API or DNSManager to actually delete them.'));
      }
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
      try {
        if (apiClient.refreshDnsRecords) {
          await apiClient.refreshDnsRecords();
        } else if (apiClient.refreshDns) {
          await apiClient.refreshDns();
        } else {
          throw new Error('No suitable API method found');
        }
        console.log(chalk.green('DNS records refreshed successfully'));
        return;
      } catch (err) {
        console.warn(chalk.yellow(`API method failed: ${err.message}`));
        console.log(chalk.yellow('Trying alternative methods...'));
      }
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
    
    // Last resort, direct method
    try {
      console.log(chalk.yellow('Refreshing DNS records via direct method...'));
      
      // Try to get DNSManager from global services
      if (global.services && global.services.DNSManager) {
        await global.services.DNSManager.refreshRecords(true);
        console.log(chalk.green('DNS records refreshed successfully via DNSManager'));
        return;
      }
      
      console.log(chalk.red('Cannot refresh DNS records: No DNSManager available'));
    } catch (directError) {
      console.error(chalk.red(`Direct refresh failed: ${directError.message}`));
    }
  } catch (error) {
    console.error(chalk.red(`Error refreshing DNS records: ${error.message}`));
  }
}

/**
 * Synchronize DNS record tables
 * @param {Object} args - Command arguments
 * @param {Object} context - CLI context with API client
 */
async function syncTables(args, context) {
  try {
    console.log(chalk.yellow('Synchronizing DNS record tables...'));
    
    // Load database and migrations
    const database = require('../../database');
    if (!database.isInitialized()) {
      await database.initialize();
    }
    
    const { migrateDnsTables } = require('../../database/migrations/dnsTablesMigration');
    
    // Run migration
    const result = await migrateDnsTables(database.db, database.repositories.dnsManager);
    
    if (result.success) {
      console.log(chalk.green('DNS tables synchronization completed successfully'));
      console.log(`Synced records from tracked to provider: ${result.trackedToProvider}`);
      console.log(`Synced records from provider to tracked: ${result.providerToTracked}`);
    } else {
      console.error(chalk.red(`DNS tables synchronization failed: ${result.error}`));
      
      if (result.errors && result.errors.length > 0) {
        for (const error of result.errors) {
          console.error(chalk.red(`- ${error.operation}: ${error.message}`));
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error synchronizing DNS tables: ${error.message}`));
  }
}

module.exports = {
  listRecords,
  status,
  cleanupOrphaned,
  refreshRecords,
  syncTables
};