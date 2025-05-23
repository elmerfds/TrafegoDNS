#!/usr/bin/with-contenv bash

# Database Integrity Check Script for Docker Container

echo "🔍 TrafegoDNS Database Integrity Check"
echo "====================================="
echo ""

# Run the Node.js integrity check script
cd /app && node scripts/check-database-integrity.js