#!/usr/bin/env node
/**
 * TrafegoDNS SQLite Column Fixer
 * 
 * This script ensures that all required columns exist in the database
 * and fixes common issues like missing last_refreshed column.
 */

const path = require('path');
const fs = require('fs');

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
console.log(' TrafegoDNS SQLite Column Fixer');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'Dry Run (no changes will be made)' : 'Live Run'}`);
console.log(`Verbose: ${verbose ? 'Yes' : 'No'}`);
console.log(`Force: ${force ? 'Yes' : 'No'}`);
console.log(`Log Level: ${logger.level}`);
console.log('');

// Fix missing last_refreshed column
async function fixLastRefreshedColumn(db) {
  try {
    // Check if the dns_records table exists
    const tableExists = await db.get(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='dns_records'
    `);
    
    if (!tableExists) {
      logger.warn('dns_records table does not exist, cannot fix last_refreshed column');
      return false;
    }
    
    // Check if the last_refreshed column exists
    const tableInfo = await db.all(`PRAGMA table_info(dns_records)`);
    const lastRefreshedExists = tableInfo.some(column => column.name === 'last_refreshed');
    
    if (lastRefreshedExists) {
      // Column exists, ensure it has values
      logger.info('last_refreshed column exists, checking for null values');
      
      const nullCount = await db.get(`
        SELECT COUNT(*) as count
        FROM dns_records
        WHERE last_refreshed IS NULL
      `);
      
      if (!nullCount || nullCount.count === 0) {
        logger.info('No null values found in last_refreshed column');
        return true;
      }
      
      logger.info(`Found ${nullCount.count} null values in last_refreshed column`);
      
      if (dryRun) {
        logger.info(`[DRY RUN] Would update ${nullCount.count} records with current timestamp`);
        return true;
      }
      
      // Begin transaction to update null values
      await db.beginTransaction();
      
      try {
        const now = new Date().toISOString();
        const result = await db.run(`
          UPDATE dns_records
          SET last_refreshed = ?
          WHERE last_refreshed IS NULL
        `, [now]);
        
        await db.commit();
        logger.info(`Updated ${result.changes || 0} records with valid last_refreshed value`);
        return true;
      } catch (updateError) {
        await db.rollback();
        logger.error(`Failed to update null values: ${updateError.message}`);
        throw updateError;
      }
    } else {
      logger.info('last_refreshed column does not exist, adding it');
      
      if (dryRun) {
        logger.info('[DRY RUN] Would add last_refreshed column to dns_records table');
        return true;
      }
      
      // Begin transaction to add column
      await db.beginTransaction();
      
      try {
        // Add the column
        await db.run(`
          ALTER TABLE dns_records
          ADD COLUMN last_refreshed TEXT
        `);
        
        // Set default value for all records
        const now = new Date().toISOString();
        await db.run(`
          UPDATE dns_records
          SET last_refreshed = ?
        `, [now]);
        
        // Create index for performance
        await db.run(`
          CREATE INDEX IF NOT EXISTS idx_dns_records_lastrefreshed
          ON dns_records(last_refreshed)
        `);
        
        await db.commit();
        logger.info('Successfully added last_refreshed column and set values');
        return true;
      } catch (alterError) {
        await db.rollback();
        logger.error(`Failed to add last_refreshed column: ${alterError.message}`);
        throw alterError;
      }
    }
  } catch (error) {
    logger.error(`Error fixing last_refreshed column: ${error.message}`);
    return false;
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
    
    // Fix missing last_refreshed column
    const lastRefreshedFixed = await fixLastRefreshedColumn(db);
    
    // Print summary
    console.log('');
    console.log('='.repeat(60));
    console.log(' Fixes Summary');
    console.log('='.repeat(60));
    console.log(`last_refreshed column: ${lastRefreshedFixed ? 'FIXED' : 'FAILED'}`);
    console.log('');
    
    logger.info('Database fixes completed');
    process.exit(0);
  } catch (error) {
    logger.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});