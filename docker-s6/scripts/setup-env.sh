#!/bin/bash
# Setup environment variables for TrafegoDNS CLI

# Ensure SQLite is installed
if ! command -v sqlite3 &> /dev/null; then
  echo "SQLite3 command not found, installing..."
  if command -v apk &> /dev/null; then
    apk add --no-cache sqlite
  elif command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y sqlite3
  elif command -v yum &> /dev/null; then
    yum install -y sqlite
  else
    echo "WARNING: Unable to install SQLite - package manager not found"
  fi
fi

# Create environment file
cat > /etc/profile.d/trafego-env.sh << 'EOF'
# Environment variables for TrafegoDNS
export CLI_TOKEN=trafegodns-cli
export API_URL=http://localhost:3000
export CONTAINER=true
export TRAFEGO_CLI=true
export TRAFEGO_INTERNAL_TOKEN=trafegodns-cli
export LOCAL_AUTH_BYPASS=true
export CONFIG_DIR=/config
EOF

chmod +x /etc/profile.d/trafego-env.sh

# Source the file
source /etc/profile.d/trafego-env.sh

# Set up the environment for all shell sessions
if [ -f "/etc/bash.bashrc" ]; then
  echo "source /etc/profile.d/trafego-env.sh" >> /etc/bash.bashrc
fi

# Set up environment for root
if [ -f "/root/.bashrc" ]; then
  echo "source /etc/profile.d/trafego-env.sh" >> /root/.bashrc
else
  mkdir -p /root
  echo "source /etc/profile.d/trafego-env.sh" > /root/.bashrc
fi

# Export environment variables for current session
export CLI_TOKEN=trafegodns-cli
export API_URL=http://localhost:3000
export CONTAINER=true
export TRAFEGO_CLI=true
export TRAFEGO_INTERNAL_TOKEN=trafegodns-cli
export LOCAL_AUTH_BYPASS=true
export CONFIG_DIR=/config

echo "Environment variables set up for CLI"