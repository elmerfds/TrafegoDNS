#!/usr/bin/env node

/**
 * Direct database access for TrafegoDNS
 * This script directly reads DNS records without going through the API
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const Table = require('cli-table3');

// Simple logging function
function log(message) {
  console.log(message);
}

// Simple error logging
function error(message) {
  console.error(chalk.red(message));
}

// Get config directory
const configDir = process.env.CONFIG_DIR || '/config';
const dataDir = path.join(configDir, 'data');
const dbPath = path.join(dataDir, 'trafegodns.db');

// First check if SQLite database exists
if (fs.existsSync(dbPath)) {
  try {
    // Try to load sqlite3
    let sqlite;
    try {
      sqlite = require('sqlite3').verbose();
    } catch (err) {
      try {
        // Try better-sqlite3 as fallback
        const betterSqlite = require('better-sqlite3');
        const db = betterSqlite(dbPath);
        displayRecordsWithBetterSqlite(db);
        process.exit(0);
      } catch (err2) {
        error(`Cannot load SQLite libraries: ${err.message}`);
        fallbackToJson();
      }
    }

    if (sqlite) {
      // Use sqlite3
      const db = new sqlite.Database(dbPath);
      displayRecordsWithSqlite3(db);
    }
  } catch (err) {
    error(`Error connecting to database: ${err.message}`);
    fallbackToJson();
  }
} else {
  log(chalk.yellow(`SQLite database not found at ${dbPath}`));
  fallbackToJson();
}

// Display records using sqlite3
function displayRecordsWithSqlite3(db) {
  db.all('SELECT * FROM dns_records ORDER BY id', [], (err, records) => {
    if (err) {
      error(`Database query error: ${err.message}`);
      db.close();
      fallbackToJson();
      return;
    }
    
    displayRecords(records);
    db.close();
  });
}

// Display records using better-sqlite3
function displayRecordsWithBetterSqlite(db) {
  try {
    const records = db.prepare('SELECT * FROM dns_records ORDER BY id').all();
    displayRecords(records);
    db.close();
  } catch (err) {
    error(`Database query error: ${err.message}`);
    fallbackToJson();
  }
}

// Fallback to JSON file if database access fails
function fallbackToJson() {
  log(chalk.yellow('Falling back to JSON records file'));
  
  const recordsPath = path.join(dataDir, 'dns-records.json');
  
  if (!fs.existsSync(recordsPath)) {
    error(`No records file found at ${recordsPath}`);
    process.exit(1);
  }
  
  try {
    const content = fs.readFileSync(recordsPath, 'utf8');
    const data = JSON.parse(content);
    const records = data.records || [];
    
    displayRecords(records);
  } catch (err) {
    error(`Error reading DNS records file: ${err.message}`);
    process.exit(1);
  }
}

// Common function to display records
function displayRecords(records) {
  if (!records || records.length === 0) {
    log('No DNS records found');
    return;
  }
  
  // Create table for display
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
  
  // Display results
  log(table.toString());
  log(`Total: ${records.length} records`);
}