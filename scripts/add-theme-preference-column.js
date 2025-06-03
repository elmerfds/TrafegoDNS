#!/usr/bin/env node

/**
 * Script to add theme_preference column to users table
 * Run this script to fix the "no such column: theme_preference" error
 */

const path = require('path');
const fs = require('fs');

// Determine the database path
const dbPath = process.env.DATABASE_PATH || path.join(process.env.CONFIG_DIR || '/config', 'db', 'trafegodns.db');

console.log(`\n🔧 Adding theme_preference column to database`);
console.log(`📍 Database path: ${dbPath}\n`);

// Check if database file exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database file not found at: ${dbPath}`);
  console.error(`   Please ensure TrafegoDNS has been started at least once.`);
  process.exit(1);
}

async function addThemePreferenceColumn() {
  try {
    // Import better-sqlite3
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (importError) {
      console.error('❌ better-sqlite3 module not found');
      console.error('   Please run: npm install better-sqlite3');
      process.exit(1);
    }

    // Open database connection
    const db = new Database(dbPath);
    
    console.log('📊 Checking current users table structure...');
    
    // Get current table info
    const tableInfo = db.prepare('PRAGMA table_info(users)').all();
    const columnNames = tableInfo.map(col => col.name);
    
    console.log('Current columns:', columnNames.join(', '));
    
    // Check if theme_preference column already exists
    if (columnNames.includes('theme_preference')) {
      console.log('\n✅ theme_preference column already exists!');
      db.close();
      return;
    }
    
    console.log('\n➕ Adding theme_preference column...');
    
    try {
      // Add the theme_preference column
      db.prepare(`
        ALTER TABLE users 
        ADD COLUMN theme_preference TEXT DEFAULT 'teal'
      `).run();
      
      console.log('✅ Successfully added theme_preference column');
      
      // Verify the change
      const newTableInfo = db.prepare('PRAGMA table_info(users)').all();
      const newColumns = newTableInfo.map(col => col.name);
      
      if (newColumns.includes('theme_preference')) {
        console.log('\n✅ Verified: theme_preference column has been added');
        console.log('\nUpdated columns:', newColumns.join(', '));
      } else {
        console.error('\n❌ Verification failed: Column was not added properly');
      }
      
    } catch (alterError) {
      console.error('\n❌ Failed to add column:', alterError.message);
      throw alterError;
    }
    
    // Close database
    db.close();
    
    console.log('\n✅ Database update complete!');
    console.log('   You can now restart TrafegoDNS and the theme feature should work.\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nIf you continue to have issues:');
    console.error('1. Stop TrafegoDNS');
    console.error('2. Run this script again');
    console.error('3. Start TrafegoDNS');
    process.exit(1);
  }
}

// Run the update
addThemePreferenceColumn();