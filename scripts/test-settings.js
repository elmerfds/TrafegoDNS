#!/usr/bin/env node
/**
 * Test script for database-backed settings system
 */
const path = require('path');
const logger = require('../src/utils/logger');

// Set config directory
process.env.CONFIG_DIR = process.env.CONFIG_DIR || '/config';

async function testSettingsSystem() {
  try {
    logger.info('Testing database-backed settings system...');
    
    // Initialize database
    const database = require('../src/database');
    logger.info('Initializing database...');
    const dbInitialized = await database.initialize();
    
    if (!dbInitialized) {
      logger.error('Failed to initialize database');
      process.exit(1);
    }
    
    logger.info('Database initialized successfully');
    
    // Wait for database to be ready
    const startTime = Date.now();
    while (!database.isInitialized() && Date.now() - startTime < 5000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Create ConfigManager instance
    const { ConfigManager } = require('../src/config');
    const config = new ConfigManager();
    
    logger.info('Loading configuration from database...');
    await config.loadFromDatabase();
    
    // Display current configuration
    logger.info('Current configuration:');
    const currentConfig = config.toJSON();
    console.log(JSON.stringify(currentConfig, null, 2));
    
    // Test updating a setting
    logger.info('\nTesting configuration update...');
    const testUpdate = {
      pollInterval: 30000,
      cleanupGracePeriod: 30
    };
    
    const updateResult = await config.updateConfig(testUpdate);
    
    if (updateResult.success) {
      logger.info('Configuration updated successfully');
      logger.info(`Previous poll interval: ${updateResult.previousConfig.pollInterval}`);
      logger.info(`New poll interval: ${config.pollInterval}`);
      logger.info(`Restart required: ${updateResult.requiresRestart}`);
    } else {
      logger.error(`Failed to update configuration: ${updateResult.error}`);
    }
    
    // Verify settings were saved to database
    logger.info('\nVerifying settings in database...');
    if (database.repositories && database.repositories.setting) {
      const dbSettings = await database.repositories.setting.getAll();
      logger.info(`Found ${Object.keys(dbSettings).length} settings in database`);
      
      // Show a few key settings
      logger.info('Sample settings from database:');
      const sampleKeys = ['operationMode', 'pollInterval', 'dnsProvider', 'cleanupGracePeriod'];
      sampleKeys.forEach(key => {
        if (dbSettings[key] !== undefined) {
          logger.info(`  ${key}: ${dbSettings[key]}`);
        }
      });
    } else {
      logger.error('Settings repository not available');
    }
    
    logger.info('\n✅ Settings system test completed successfully');
    
  } catch (error) {
    logger.error(`❌ Settings system test failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testSettingsSystem();