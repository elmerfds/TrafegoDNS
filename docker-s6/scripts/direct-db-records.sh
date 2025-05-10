#!/bin/bash
# Direct database record access script to bypass API authentication issues

# Set necessary environment variables
export NODE_ENV=production
export CLI_MODE=true
export CLI_TOKEN=trafegodns-cli
export API_URL=http://localhost:3000
export CONTAINER=true
export TRAFEGO_CLI=true

# Execute the script directly accessing the database in the app environment
node -e "
try {
  // Import required modules
  const { DatabaseConnection } = require('/app/src/database/connection');
  const path = require('path');
  const Table = require('cli-table3');
  const chalk = require('chalk');

  // Initialize database connection
  const db = new DatabaseConnection();
  
  // Connect to database
  (async () => {
    try {
      // Initialize and connect to database
      await db.initialize();
      await db.connect();
      console.log('Successfully connected to database');

      // Get DNS records
      const query = 'SELECT * FROM dns_records ORDER BY tracked_at DESC LIMIT 100';
      const records = await db.db.all(query);
      
      if (!records || records.length === 0) {
        console.log('No DNS records found in database');
        process.exit(0);
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
      console.log(table.toString());
      console.log(\`Total: \${records.length} records\`);
      
      process.exit(0);
    } catch (err) {
      console.error(\`Error accessing database: \${err.message}\`);
      process.exit(1);
    }
  })();
} catch (err) {
  console.error(\`Failed to load database: \${err.message}\`);
  process.exit(1);
}
"