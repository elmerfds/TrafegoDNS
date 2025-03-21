// src/utils/migrationUtils.js
/**
 * Migration utilities for TráfegoDNS
 * Handles migration from environment variables to file-based configuration
 * and ensures backward compatibility
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class MigrationUtils {
  /**
   * Migrate environment variables to the new configuration system
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} dataStore - DataStore instance
   * @returns {Promise<Object>} Migration results with statistics
   */
  static async migrateFromEnvVars(config, dataStore) {
    logger.info('Starting migration from environment variables to file-based configuration');
    
    const migrationResults = {
      configSettings: 0,
      preservedHostnames: 0,
      managedHostnames: 0,
      totalMigrated: 0,
      errors: []
    };
    
    try {
      // 1. Migrate configuration settings
      await this.migrateConfigSettings(config, migrationResults);
      
      // 2. Migrate preserved hostnames
      await this.migratePreservedHostnames(dataStore, migrationResults);
      
      // 3. Migrate managed hostnames
      await this.migrateManagedHostnames(dataStore, migrationResults);
      
      // 4. Migrate existing DNS records (if any)
      await this.migrateDnsRecords(dataStore, migrationResults);
      
      migrationResults.totalMigrated = 
        migrationResults.configSettings + 
        migrationResults.preservedHostnames + 
        migrationResults.managedHostnames;
      
      logger.success(`Migration completed: ${migrationResults.totalMigrated} items migrated, ${migrationResults.errors.length} errors`);
      
      return migrationResults;
    } catch (error) {
      logger.error(`Migration failed: ${error.message}`);
      migrationResults.errors.push(error.message);
      return migrationResults;
    }
  }
  
  /**
   * Migrate configuration settings from environment variables
   * @param {Object} config - EnhancedConfigManager instance
   * @param {Object} results - Migration results object to update
   */
  static async migrateConfigSettings(config, results) {
    logger.debug('Migrating configuration settings from environment variables');
    
    try {
      // Get current runtime configuration
      const runtimeConfig = { ...config.runtimeConfig };
      let settingsMigrated = 0;
      
      // List of configuration keys to migrate from env vars
      const configKeys = [
        'operationMode',
        'pollInterval',
        'watchDockerEvents',
        'cleanupOrphaned',
        'cacheRefreshInterval',
        'apiTimeout',
        'ipRefreshInterval'
      ];
      
      // Migrate each configuration key
      for (const key of configKeys) {
        // Skip if not set in environment
        if (process.env[this.envVarName(key)] === undefined) {
          continue;
        }
        
        try {
          // Convert environment variable to appropriate type
          const value = this.convertEnvVar(process.env[this.envVarName(key)], typeof runtimeConfig[key]);
          
          // Update configuration if different from default
          if (value !== runtimeConfig[key]) {
            await config.updateConfig(key, value, true);
            settingsMigrated++;
            logger.debug(`Migrated configuration setting: ${key}=${value}`);
          }
        } catch (error) {
          logger.warn(`Error migrating configuration setting ${key}: ${error.message}`);
          results.errors.push(`Failed to migrate ${key}: ${error.message}`);
        }
      }
      
      results.configSettings = settingsMigrated;
      logger.info(`Migrated ${settingsMigrated} configuration settings`);
    } catch (error) {
      logger.error(`Error during configuration migration: ${error.message}`);
      results.errors.push(`Configuration migration failed: ${error.message}`);
    }
  }
  
  /**
   * Migrate preserved hostnames from environment variables
   * @param {Object} dataStore - DataStore instance
   * @param {Object} results - Migration results object to update
   */
  static async migratePreservedHostnames(dataStore, results) {
    logger.debug('Migrating preserved hostnames from environment variables');
    
    try {
      // Check if PRESERVED_HOSTNAMES is set
      if (!process.env.PRESERVED_HOSTNAMES) {
        logger.debug('No preserved hostnames to migrate');
        return;
      }
      
      // Parse preserved hostnames
      const preservedHostnames = process.env.PRESERVED_HOSTNAMES
        .split(',')
        .map(hostname => hostname.trim())
        .filter(hostname => hostname.length > 0);
      
      if (preservedHostnames.length === 0) {
        logger.debug('No valid preserved hostnames found');
        return;
      }
      
      // Get existing preserved hostnames from data store
      const existingHostnames = await dataStore.getPreservedHostnames();
      
      // Identify new hostnames to add
      const newHostnames = preservedHostnames.filter(hostname => 
        !existingHostnames.includes(hostname)
      );
      
      if (newHostnames.length === 0) {
        logger.debug('All preserved hostnames already exist in the data store');
        return;
      }
      
      // Add new hostnames to data store
      const updatedHostnames = [...existingHostnames, ...newHostnames];
      await dataStore.setPreservedHostnames(updatedHostnames);
      
      results.preservedHostnames = newHostnames.length;
      logger.info(`Migrated ${newHostnames.length} preserved hostnames`);
    } catch (error) {
      logger.error(`Error during preserved hostnames migration: ${error.message}`);
      results.errors.push(`Preserved hostnames migration failed: ${error.message}`);
    }
  }
  
  /**
   * Migrate managed hostnames from environment variables
   * @param {Object} dataStore - DataStore instance
   * @param {Object} results - Migration results object to update
   */
  static async migrateManagedHostnames(dataStore, results) {
    logger.debug('Migrating managed hostnames from environment variables');
    
    try {
      // Check if MANAGED_HOSTNAMES is set
      if (!process.env.MANAGED_HOSTNAMES) {
        logger.debug('No managed hostnames to migrate');
        return;
      }
      
      // Parse managed hostnames
      const managedHostnamesStr = process.env.MANAGED_HOSTNAMES;
      const managedHostnames = managedHostnamesStr
        .split(',')
        .map(hostnameConfig => {
          const parts = hostnameConfig.trim().split(':');
          if (parts.length < 1) return null;
          
          const hostname = parts[0];
          
          // Return basic record with defaults if parts are missing
          return {
            hostname: hostname,
            type: parts[1] || 'A',
            content: parts[2] || '',
            ttl: parseInt(parts[3] || '3600', 10),
            proxied: parts[4] ? parts[4].toLowerCase() === 'true' : false
          };
        })
        .filter(config => config && config.hostname && config.hostname.length > 0);
      
      if (managedHostnames.length === 0) {
        logger.debug('No valid managed hostnames found');
        return;
      }
      
      // Get existing managed hostnames from data store
      const existingHostnames = await dataStore.getManagedHostnames();
      
      // Create lookup map for existing hostnames
      const existingMap = new Map();
      for (const hostname of existingHostnames) {
        existingMap.set(`${hostname.hostname}:${hostname.type}`, hostname);
      }
      
      // Identify new hostnames to add
      const newHostnames = managedHostnames.filter(hostname => 
        !existingMap.has(`${hostname.hostname}:${hostname.type}`)
      );
      
      if (newHostnames.length === 0) {
        logger.debug('All managed hostnames already exist in the data store');
        return;
      }
      
      // Add new hostnames to data store
      const updatedHostnames = [...existingHostnames, ...newHostnames];
      await dataStore.setManagedHostnames(updatedHostnames);
      
      results.managedHostnames = newHostnames.length;
      logger.info(`Migrated ${newHostnames.length} managed hostnames`);
    } catch (error) {
      logger.error(`Error during managed hostnames migration: ${error.message}`);
      results.errors.push(`Managed hostnames migration failed: ${error.message}`);
    }
  }
  
  /**
   * Migrate DNS records from legacy file to data store
   * @param {Object} dataStore - DataStore instance
   * @param {Object} results - Migration results object to update
   */
  static async migrateDnsRecords(dataStore, results) {
    logger.debug('Migrating DNS records from legacy file');
    
    try {
      // Look for legacy dns-records.json file in the current directory
      const legacyPath = path.join(process.cwd(), 'dns-records.json');
      
      // Check if the file exists
      try {
        await fs.access(legacyPath);
      } catch (error) {
        logger.debug('No legacy DNS records file found');
        return;
      }
      
      // Read legacy file
      const legacyDataStr = await fs.readFile(legacyPath, 'utf8');
      const legacyData = JSON.parse(legacyDataStr);
      
      if (!Array.isArray(legacyData) || legacyData.length === 0) {
        logger.debug('Legacy DNS records file is empty or invalid');
        return;
      }
      
      // Get existing DNS records from data store
      const existingRecords = await dataStore.getDnsRecords();
      
      // Create a unique identifier for each record
      const getRecordKey = (record) => 
        `${record.provider || ''}:${record.domain || ''}:${record.name || ''}:${record.type || ''}`.toLowerCase();
      
      // Create lookup map for existing records
      const existingMap = new Map();
      for (const record of existingRecords) {
        existingMap.set(getRecordKey(record), record);
      }
      
      // Identify new records to add
      const newRecords = legacyData.filter(record => 
        !existingMap.has(getRecordKey(record))
      );
      
      if (newRecords.length === 0) {
        logger.debug('All DNS records already exist in the data store');
        return;
      }
      
      // Add new records to data store
      const updatedRecords = [...existingRecords, ...newRecords];
      await dataStore.setDnsRecords(updatedRecords);
      
      // Create backup of the legacy file
      const backupPath = `${legacyPath}.backup.${Date.now()}`;
      await fs.copyFile(legacyPath, backupPath);
      
      logger.info(`Migrated ${newRecords.length} DNS records from legacy file`);
      logger.info(`Created backup of legacy DNS records at ${backupPath}`);
    } catch (error) {
      logger.error(`Error during DNS records migration: ${error.message}`);
      results.errors.push(`DNS records migration failed: ${error.message}`);
    }
  }
  
  /**
   * Convert environment variable name from config key
   * @param {string} key - Configuration key
   * @returns {string} - Environment variable name
   */
  static envVarName(key) {
    // Convert camelCase to UPPER_SNAKE_CASE
    return key.replace(/([A-Z])/g, '_$1').toUpperCase();
  }
  
  /**
   * Convert environment variable value to appropriate type
   * @param {string} value - Environment variable value
   * @param {string} targetType - Target type (string, number, boolean)
   * @returns {any} - Converted value
   */
  static convertEnvVar(value, targetType) {
    switch (targetType) {
      case 'number':
        return parseInt(value, 10);
      case 'boolean':
        return value.toLowerCase() !== 'false';
      default:
        return value;
    }
  }
}

module.exports = MigrationUtils;