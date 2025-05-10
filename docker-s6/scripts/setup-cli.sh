#!/bin/sh
# Setup script for TrafegoDNS CLI
set -e

echo "Setting up TrafegoDNS CLI tool..."

# Create symlink in /usr/bin for compatibility
ln -sf /usr/local/bin/trafego /usr/bin/trafego

# Install required dependencies if not already installed
cd /app
echo "Installing CLI dependencies..."
npm list commander || npm install --no-save commander@11.1.0
npm list chalk || npm install --no-save chalk@4.1.2
npm list cli-table3 || npm install --no-save cli-table3@0.6.3
npm list inquirer || npm install --no-save inquirer@8.2.6

# Ensure script permissions
chmod +x /app/bin/trafego
chmod +x /usr/local/bin/trafego
chmod +x /usr/bin/trafego

echo "TrafegoDNS CLI setup complete! You can now use 'trafego' command."