#!/usr/bin/env node

/**
 * Script to fix corrupted metadata in dns_tracked_records table
 * This fixes two issues:
 * 1. Metadata that was triple-stringified resulting in character-by-character storage
 * 2. MX, TXT and other non-A/CNAME records incorrectly marked as app-managed
 */

const Database = require('better-sqlite3');
const path = require('path');

// Database path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'trafegodns.db');

console.log(`Connecting to database at: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Get all records with metadata
  const records = db.prepare(`
    SELECT id, provider, record_id, type, name, metadata 
    FROM dns_tracked_records 
    WHERE metadata IS NOT NULL
  `).all();
  
  console.log(`Found ${records.length} records with metadata`);
  
  let fixedCount = 0;
  let nonAppManagedCount = 0;
  
  for (const record of records) {
    let needsUpdate = false;
    let newMetadata = null;
    
    try {
      // Check if metadata is corrupted (has character indices)
      if (record.metadata && record.metadata.includes('"0":')) {
        console.log(`\nFixing corrupted metadata for record ${record.id} (${record.type} ${record.name})`);
        
        // Extract the actual JSON from the corrupted format
        // The pattern is usually at the end after all the character indices
        const match = record.metadata.match(/,"appManaged":([^,}]+).*?"trackedAt":"([^"]+)"/);
        if (match) {
          newMetadata = {
            appManaged: match[1] === 'true',
            trackedAt: match[2]
          };
          
          // Add updatedAt if it exists
          const updatedMatch = record.metadata.match(/"updatedAt":"([^"]+)"/);
          if (updatedMatch) {
            newMetadata.updatedAt = updatedMatch[1];
          }
        } else {
          // If we can't extract, create default metadata
          newMetadata = {
            appManaged: false,
            trackedAt: new Date().toISOString()
          };
        }
        
        needsUpdate = true;
        fixedCount++;
      } else {
        // Try to parse existing metadata
        try {
          newMetadata = JSON.parse(record.metadata);
        } catch (e) {
          console.log(`\nCannot parse metadata for record ${record.id}, creating new`);
          newMetadata = {
            appManaged: false,
            trackedAt: new Date().toISOString()
          };
          needsUpdate = true;
          fixedCount++;
        }
      }
      
      // Fix incorrect appManaged status for non-A/CNAME records
      if (newMetadata && newMetadata.appManaged === true && 
          record.type !== 'A' && record.type !== 'CNAME') {
        console.log(`\nFixing incorrect appManaged=true for ${record.type} record: ${record.name}`);
        newMetadata.appManaged = false;
        needsUpdate = true;
        nonAppManagedCount++;
      }
      
      // Also fix apex domain records (where name equals provider domain)
      // Get provider domain from environment or use the TLD of the record
      const providerDomain = process.env.DNS_PROVIDER_ZONE || record.name.split('.').slice(-2).join('.');
      if (newMetadata && newMetadata.appManaged === true && 
          record.name === providerDomain) {
        console.log(`\nFixing incorrect appManaged=true for apex domain record: ${record.name} (${record.type})`);
        newMetadata.appManaged = false;
        needsUpdate = true;
        nonAppManagedCount++;
      }
      
      // Update the record if needed
      if (needsUpdate && newMetadata) {
        const metadataStr = JSON.stringify(newMetadata);
        db.prepare(`
          UPDATE dns_tracked_records 
          SET metadata = ?, updated_at = ?
          WHERE id = ?
        `).run(metadataStr, new Date().toISOString(), record.id);
        
        console.log(`Updated metadata: ${metadataStr}`);
      }
      
    } catch (error) {
      console.error(`Error processing record ${record.id}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Fixed ${fixedCount} corrupted metadata entries`);
  console.log(`✅ Fixed ${nonAppManagedCount} incorrectly app-managed records`);
  
  // Close the database
  db.close();
  
} catch (error) {
  console.error(`Database error: ${error.message}`);
  process.exit(1);
}