/**
 * Web Server for TráfegoDNS API
 */
const express = require('express');
const path = require('path');
const fsSync = require('fs'); // Use fsSync for synchronous operations
const fs = require('fs').promises; // Use fs for async operations
const logger = require('../utils/logger');

// Create Express application
const app = express();

// ... existing code ...

// Start the server
async function startServer(config) {
  try {
    // ... existing code ...
    
    // Example of a corrected check that might have been using fs.existsSync:
    const configPath = path.join(__dirname, '../config/api-config.json');
    if (fsSync.existsSync(configPath)) {
      const configData = await fs.readFile(configPath, 'utf8');
      // ... process config ...
    }
    
    // ... rest of startup code ...
    
  } catch (error) {
    logger.error(`Failed to start web server: ${error.message}`);
    throw error;
  }
}

module.exports = { app, startServer };
