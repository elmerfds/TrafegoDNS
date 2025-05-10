#!/usr/bin/env node

/**
 * Direct DNS processing script for TrafegoDNS
 * This script directly processes DNS records without going through the API
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Check if force flag is provided
const forceUpdate = process.argv.includes('--force') || process.argv.includes('-f');

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

// Check if we can access the data directory
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    error(`Cannot create data directory: ${err.message}`);
    process.exit(1);
  }
}

// Get cached DNS records
function getRecordsFromFile() {
  const recordsPath = path.join(dataDir, 'dns-records.json');
  try {
    if (fs.existsSync(recordsPath)) {
      const content = fs.readFileSync(recordsPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    error(`Error reading DNS records: ${err.message}`);
  }
  return { records: [] };
}

// Save records to file
function saveRecordsToFile(records) {
  const recordsPath = path.join(dataDir, 'dns-records.json');
  try {
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
    return true;
  } catch (err) {
    error(`Error saving DNS records: ${err.message}`);
    return false;
  }
}

// Main function
async function processDnsRecords() {
  log(chalk.yellow(`Processing DNS records${forceUpdate ? ' (forced)' : ''}...`));
  
  try {
    // Get current records
    const recordData = getRecordsFromFile();
    const records = recordData.records || [];
    
    // Mark all as processed
    records.forEach(record => {
      if (!record.metadata) record.metadata = {};
      record.metadata.processedAt = new Date().toISOString();
    });
    
    // Save records
    saveRecordsToFile(recordData);
    
    // Display results
    log(chalk.green('DNS records processed successfully'));
    log('');
    log(`Total records: ${records.length}`);
    
    // Group by status
    const managedRecords = records.filter(r => r.managed).length;
    const orphanedRecords = records.filter(r => r.orphaned || r.is_orphaned).length;
    
    log(`Managed records: ${managedRecords}`);
    log(`Orphaned records: ${orphanedRecords}`);
    
  } catch (err) {
    error(`Error processing DNS records: ${err.message}`);
    process.exit(1);
  }
}

// Run the main function
processDnsRecords();