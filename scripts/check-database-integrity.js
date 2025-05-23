#!/usr/bin/env node

/**
 * Database Integrity Check and Repair Script
 * This script checks the SQLite database integrity and attempts recovery if corruption is detected
 */

const path = require('path');
const fs = require('fs');

// Set up environment
process.env.CONFIG_DIR = process.env.CONFIG_DIR || '/config';

async function checkDatabase() {
  try {
    console.log('🔍 Checking database integrity...\n');
    
    // Import the database module
    const BetterSQLite = require('../src/database/better-sqlite');
    const db = new BetterSQLite();
    
    // Check if database file exists
    if (!fs.existsSync(db.dbPath)) {
      console.log('ℹ️  No database file found. The application will create one on first run.');
      return;
    }
    
    console.log(`📁 Database path: ${db.dbPath}`);
    
    // Initialize database connection
    console.log('🔗 Connecting to database...');
    const initialized = await db.initialize();
    
    if (!initialized) {
      console.error('❌ Failed to initialize database connection');
      process.exit(1);
    }
    
    // Check integrity
    console.log('🏥 Running integrity check...');
    const isHealthy = await db.checkIntegrity();
    
    if (isHealthy) {
      console.log('✅ Database integrity check passed - database is healthy!\n');
      
      // Get some statistics
      try {
        const stats = await db.get(`
          SELECT 
            (SELECT COUNT(*) FROM dns_records) as dns_records_count,
            (SELECT COUNT(*) FROM dns_tracked_records) as tracked_records_count,
            (SELECT COUNT(*) FROM dns_tracked_records WHERE is_orphaned = 1) as orphaned_count
        `);
        
        console.log('📊 Database Statistics:');
        console.log(`   - DNS Records: ${stats.dns_records_count || 0}`);
        console.log(`   - Tracked Records: ${stats.tracked_records_count || 0}`);
        console.log(`   - Orphaned Records: ${stats.orphaned_count || 0}`);
      } catch (error) {
        console.log('ℹ️  Could not retrieve statistics:', error.message);
      }
    } else {
      console.error('❌ Database corruption detected!');
      
      // Ask for confirmation before recovery
      console.log('\n⚠️  Database recovery will:');
      console.log('   - Create a backup of the corrupted database');
      console.log('   - Delete the corrupted database');
      console.log('   - Create a fresh, empty database');
      console.log('   - All existing data will be lost (but backed up)');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('\nDo you want to proceed with recovery? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
          console.log('\n🔧 Attempting database recovery...');
          const recovered = await db.attemptRecovery();
          
          if (recovered) {
            console.log('✅ Database recovery successful!');
            console.log('ℹ️  A backup of the corrupted database has been saved.');
            console.log('ℹ️  The application now has a fresh database.');
          } else {
            console.error('❌ Database recovery failed!');
            console.error('Please check the logs for more details.');
          }
        } else {
          console.log('ℹ️  Recovery cancelled.');
        }
        
        rl.close();
        process.exit(0);
      });
      
      return; // Don't exit immediately, wait for user response
    }
    
    // Close database
    if (db.db) {
      db.db.close();
    }
    
  } catch (error) {
    console.error('❌ Error during database check:', error.message);
    process.exit(1);
  }
}

// Run the check
checkDatabase();