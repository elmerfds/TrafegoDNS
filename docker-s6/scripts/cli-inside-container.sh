#!/bin/bash
# Script for running CLI commands with direct service access
# Used inside container to avoid authentication issues

set -e

# Set environment variables for CLI
export CLI_TOKEN="trafegodns-cli"
export API_URL="http://localhost:3000"
export CONTAINER="true"
export TRAFEGO_CLI="true"
export TRAFEGO_INTERNAL_TOKEN="trafegodns-cli"
export LOCAL_AUTH_BYPASS="true"

# First load the application (minimally)
NODE_ENV=production CLI_MODE=true node -e "
  try {
    console.log('Loading application environment...');

    // Set environment variables in the script too
    process.env.CLI_TOKEN = 'trafegodns-cli';
    process.env.TRAFEGO_INTERNAL_TOKEN = 'trafegodns-cli';
    process.env.API_URL = 'http://localhost:3000';
    process.env.CONTAINER = 'true';
    process.env.TRAFEGO_CLI = 'true';
    process.env.LOCAL_AUTH_BYPASS = 'true';

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

# Add automatic token configuration to ~/.bashrc for container
if ! grep -q "CLI_TOKEN" /root/.bashrc; then
  echo "export CLI_TOKEN=trafegodns-cli" >> /root/.bashrc
  echo "export API_URL=http://localhost:3000" >> /root/.bashrc
  echo "export CONTAINER=true" >> /root/.bashrc
  echo "export TRAFEGO_CLI=true" >> /root/.bashrc
fi

# Check if we have direct service access
if [ -f "/app/src/services/index.js" ]; then
  # Run with direct service access
  exec node /app/bin/trafego "$@"
else
  # Run through API with token auth
  exec CLI_TOKEN=trafegodns-cli API_URL=http://localhost:3000 node /app/bin/trafego "$@"
fi