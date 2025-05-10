#!/bin/bash
# Script for running CLI commands with direct service access
# Used inside container to avoid authentication issues

set -e

# First load the application (minimally)
NODE_ENV=production CLI_MODE=true node -e "
  try {
    console.log('Loading application environment...');
    
    // Load app configuration
    const config = require('/app/src/config');
    
    // Set up localAuthBypass for CLI
    if (!config.localAuthBypass) {
      config.localAuthBypass = {
        enabled: true,
        cliToken: 'trafegodns-cli'
      };
    } else {
      config.localAuthBypass.enabled = true;
      config.localAuthBypass.cliToken = 'trafegodns-cli';
    }
    
    // Export the updated config
    global.config = config;
    
    console.log('Application environment loaded');
  } catch (err) {
    console.error('Failed to load application environment:', err.message);
  }
  process.exit(0);"

# Then run the CLI command with direct access
exec node /app/bin/trafego "$@"