#!/usr/bin/env node

/**
 * Database Statistics Check Script
 * Directly queries the SQLite database to check record counts
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database configuration
const DATA_DIR = process.env.CONFIG_DIR ? path.join(process.env.CONFIG_DIR, 'data') : path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'trafegodns.db');

console.log('=== TrafegoDNS Database Statistics Check ===\n');
console.log(`Database file: ${DB_FILE}`);

try {
  // Open database
  const db = new Database(DB_FILE, { 
    readonly: true,
    fileMustExist: true 
  });

  // Check if tables exist
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all();
  
  console.log('\n📋 Available tables:');
  tables.forEach(table => {
    console.log(`  - ${table.name}`);
  });

  // Check dns_tracked_records
  console.log('\n📊 DNS Tracked Records Statistics:');
  try {
    const trackedTotal = db.prepare('SELECT COUNT(*) as count FROM dns_tracked_records').get();
    console.log(`  Total records: ${trackedTotal.count}`);
    
    const trackedNonOrphaned = db.prepare('SELECT COUNT(*) as count FROM dns_tracked_records WHERE is_orphaned = 0').get();
    console.log(`  Non-orphaned records: ${trackedNonOrphaned.count}`);
    
    const trackedOrphaned = db.prepare('SELECT COUNT(*) as count FROM dns_tracked_records WHERE is_orphaned = 1').get();
    console.log(`  Orphaned records: ${trackedOrphaned.count}`);
    
    // Get unique hostnames
    const uniqueHostnames = db.prepare('SELECT DISTINCT name FROM dns_tracked_records WHERE is_orphaned = 0').all();
    console.log(`  Unique hostnames (non-orphaned): ${uniqueHostnames.length}`);
    
    // Sample records
    console.log('\n  Sample records:');
    const sampleRecords = db.prepare('SELECT * FROM dns_tracked_records LIMIT 5').all();
    sampleRecords.forEach(record => {
      console.log(`    - ${record.name} (${record.type}) - Provider: ${record.provider}, Orphaned: ${record.is_orphaned}`);
    });
  } catch (e) {
    console.log(`  ❌ Error querying dns_tracked_records: ${e.message}`);
  }

  // Check dns_provider_cache
  console.log('\n📊 DNS Provider Cache Statistics:');
  try {
    const cacheTotal = db.prepare('SELECT COUNT(*) as count FROM dns_provider_cache').get();
    console.log(`  Total cached records: ${cacheTotal.count}`);
    
    // Group by provider
    const byProvider = db.prepare('SELECT provider, COUNT(*) as count FROM dns_provider_cache GROUP BY provider').all();
    if (byProvider.length > 0) {
      console.log('  Records by provider:');
      byProvider.forEach(p => {
        console.log(`    - ${p.provider}: ${p.count}`);
      });
    }
  } catch (e) {
    console.log(`  ❌ Error querying dns_provider_cache: ${e.message}`);
  }

  // Check dns_records (if exists)
  console.log('\n📊 DNS Records Table Statistics:');
  try {
    const recordsTotal = db.prepare('SELECT COUNT(*) as count FROM dns_records').get();
    console.log(`  Total records: ${recordsTotal.count}`);
  } catch (e) {
    console.log(`  ❌ Table dns_records not found or error: ${e.message}`);
  }

  // Close database
  db.close();
  
  console.log('\n✅ Database check complete');
} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
}