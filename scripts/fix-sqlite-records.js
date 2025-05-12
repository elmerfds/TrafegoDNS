#!/usr/bin/env node
/**
 * TrafegoDNS SQLite Record Cleaner
 * 
 * This script cleans up invalid records in the SQLite database.
 * It removes records with:
 * - UNKNOWN or unknown type
 * - unknown name
 * - Empty content (for record types that require content)
 */

const path = require('path');
const fs = require('fs');
const util = require('util');

// Set the NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Get APP_ROOT from environment or set to parent directory
process.env.APP_ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');

// Import logger after setting NODE_ENV
const logger = require('../src/utils/logger');
logger.level = process.env.LOG_LEVEL || 'info';

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const force = args.includes('--force');

if (verbose) {
  logger.level = 'debug';
}

// Print banner
console.log('='.repeat(60));
console.log(' TrafegoDNS SQLite Record Cleaner');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'Dry Run (no changes will be made)' : 'Live Run'}`);
console.log(`Verbose: ${verbose ? 'Yes' : 'No'}`);
console.log(`Force: ${force ? 'Yes' : 'No'}`);
console.log(`Log Level: ${logger.level}`);
console.log('');

// Helper function to find invalid records in a table
async function findInvalidRecords(db, tableName) {
  try {
    logger.debug(`Checking for invalid records in ${tableName}...`);
    
    // First check if the table exists
    const tableCheck = await db.get(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `, [tableName]);
    
    if (!tableCheck) {
      logger.warn(`Table ${tableName} does not exist, skipping...`);
      return [];
    }
    
    // Query for records with issues
    const invalidRecords = await db.all(`
      SELECT * FROM ${tableName}
      WHERE type IS NULL
         OR type = 'UNKNOWN'
         OR type = 'unknown'
         OR name IS NULL
         OR name = 'unknown'
         OR (
            content IS NULL AND 
            type NOT IN ('NS', 'MX', 'SRV')
         )
    `);
    
    return invalidRecords || [];
  } catch (error) {
    logger.error(`Error finding invalid records in ${tableName}: ${error.message}`);
    return [];
  }
}

// Delete invalid records from a table
async function deleteInvalidRecords(db, tableName) {
  if (dryRun) {
    logger.info(`[DRY RUN] Would delete invalid records from ${tableName}`);
    return { changes: 0 };
  }
  
  try {
    logger.info(`Deleting invalid records from ${tableName}...`);
    
    const result = await db.run(`
      DELETE FROM ${tableName}
      WHERE type IS NULL
         OR type = 'UNKNOWN'
         OR type = 'unknown'
         OR name IS NULL
         OR name = 'unknown'
         OR (
            content IS NULL AND 
            type NOT IN ('NS', 'MX', 'SRV')
         )
    `);
    
    return result;
  } catch (error) {
    logger.error(`Error deleting invalid records from ${tableName}: ${error.message}`);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Try to initialize the database
    let database;
    
    try {
      logger.info('Initializing database connection...');
      database = require('../src/database');
      
      if (!database.isInitialized()) {
        logger.info('Database not initialized, initializing now...');
        const initialized = await database.initialize();
        
        if (!initialized) {
          throw new Error('Failed to initialize database');
        }
      }
    } catch (dbInitError) {
      logger.error(`Failed to initialize database: ${dbInitError.message}`);
      process.exit(1);
    }
    
    const db = database.db;
    
    // First check for invalid DNS records
    logger.info('Checking for invalid DNS records...');
    
    const invalidDnsRecords = await findInvalidRecords(db, 'dns_records');
    const invalidTrackedRecords = await findInvalidRecords(db, 'dns_tracked_records');
    
    if (invalidDnsRecords.length === 0 && invalidTrackedRecords.length === 0) {
      logger.info('No invalid records found. Database is clean!');
      process.exit(0);
    }
    
    // Display invalid records if found
    if (invalidDnsRecords.length > 0) {
      logger.info(`Found ${invalidDnsRecords.length} invalid DNS records`);
      
      if (verbose) {
        for (const record of invalidDnsRecords) {
          logger.debug(`- Invalid DNS record: ${JSON.stringify(record)}`);
        }
      }
    }
    
    if (invalidTrackedRecords.length > 0) {
      logger.info(`Found ${invalidTrackedRecords.length} invalid tracked DNS records`);
      
      if (verbose) {
        for (const record of invalidTrackedRecords) {
          logger.debug(`- Invalid tracked record: ${JSON.stringify(record)}`);
        }
      }
    }
    
    // Confirm deletion if not in force mode
    if (!dryRun && !force) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const question = util.promisify(rl.question).bind(rl);
      
      const answer = await question(`Delete ${invalidDnsRecords.length + invalidTrackedRecords.length} invalid records? (yes/no): `);
      
      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        logger.info('Aborting. No changes made.');
        rl.close();
        process.exit(0);
      }
      
      rl.close();
    }
    
    // Perform deletions
    try {
      // Start a transaction
      if (!dryRun) {
        await db.beginTransaction();
      }
      
      let dnsRecordsDeleted = 0;
      let trackedRecordsDeleted = 0;
      
      // Delete invalid DNS records
      if (invalidDnsRecords.length > 0) {
        const dnsResult = await deleteInvalidRecords(db, 'dns_records');
        dnsRecordsDeleted = dnsResult.changes;
        logger.info(`${dryRun ? 'Would have deleted' : 'Deleted'} ${dnsRecordsDeleted} invalid DNS records`);
      }
      
      // Delete invalid tracked records
      if (invalidTrackedRecords.length > 0) {
        const trackedResult = await deleteInvalidRecords(db, 'dns_tracked_records');
        trackedRecordsDeleted = trackedResult.changes;
        logger.info(`${dryRun ? 'Would have deleted' : 'Deleted'} ${trackedRecordsDeleted} invalid tracked DNS records`);
      }
      
      // Commit the transaction
      if (!dryRun) {
        await db.commit();
        logger.info('Changes committed to database');
        
        // Optimize the database
        logger.info('Optimizing database (VACUUM)...');
        await db.run('VACUUM');
        logger.info('Database optimization completed');
      }
      
      logger.info(`${dryRun ? 'Would have deleted' : 'Deleted'} a total of ${dnsRecordsDeleted + trackedRecordsDeleted} invalid records`);
    } catch (error) {
      // Rollback the transaction on error
      if (!dryRun) {
        await db.rollback();
      }
      
      logger.error(`Error while cleaning up records: ${error.message}`);
      process.exit(1);
    }
    
    logger.info('Database cleanup completed successfully');
  } catch (error) {
    logger.error(`Error during cleanup: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});