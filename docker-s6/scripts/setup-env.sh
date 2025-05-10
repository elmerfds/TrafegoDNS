#!/bin/bash
# Setup environment variables for TrafegoDNS CLI

# Create environment file 
cat > /etc/profile.d/trafego-env.sh << 'EOF'
# Environment variables for TrafegoDNS
export CLI_TOKEN=trafegodns-cli
export API_URL=http://localhost:3000
export CONTAINER=true
export TRAFEGO_CLI=true
export TRAFEGO_INTERNAL_TOKEN=trafegodns-cli
export LOCAL_AUTH_BYPASS=true
EOF

chmod +x /etc/profile.d/trafego-env.sh

# Source the file
source /etc/profile.d/trafego-env.sh

# Set up the environment for all shell sessions
echo "source /etc/profile.d/trafego-env.sh" >> /etc/bash.bashrc

echo "Environment variables set up for CLI"