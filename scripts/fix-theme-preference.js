#!/usr/bin/env node

/**
 * Script to add theme_preference column to users table
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join('/config', 'db', 'trafegodns.db');

console.log(`Adding theme_preference column to database at: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  
  // Check if column already exists
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all();
  const hasThemeColumn = tableInfo.some(column => column.name === 'theme_preference');

  if (!hasThemeColumn) {
    console.log('Adding theme_preference column...');
    
    // Add the column
    db.prepare(`
      ALTER TABLE users 
      ADD COLUMN theme_preference TEXT DEFAULT 'teal'
    `).run();
    
    console.log('✅ Successfully added theme_preference column to users table');
  } else {
    console.log('✅ theme_preference column already exists');
  }
  
  // Verify the change
  const newTableInfo = db.prepare(`PRAGMA table_info(users)`).all();
  console.log('\nCurrent users table structure:');
  newTableInfo.forEach(col => {
    console.log(`  ${col.name} - ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });
  
  db.close();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

console.log('\n✅ Database update complete!');