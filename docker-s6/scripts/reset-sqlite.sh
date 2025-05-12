#!/bin/bash
# Script to reset SQLite database and fix transaction issues

echo "====================================="
echo "TrafegoDNS SQLite Reset Script"
echo "====================================="

# Set directory paths
APP_DIR="/app"
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"
LOCK_FILE="$DATA_DIR/.migration.lock"
WAL_FILE="$DATA_DIR/trafegodns.db-wal"
SHM_FILE="$DATA_DIR/trafegodns.db-shm"

# Check if running as root
if [ "$(id -u)" != "0" ]; then
  echo "⚠️ This script should be run as root"
  echo "Try again with sudo or as root user"
  exit 1
fi

echo "This script will completely reset your SQLite database."
echo "All DNS records will need to be re-synchronized from the DNS provider."
echo "User accounts will be reset to default."
echo ""
read -p "Are you sure you want to continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Operation cancelled."
  exit 0
fi

# Stop the service if running
echo "Checking if TrafegoDNS service is running..."
if pgrep -f "node.*app.js" > /dev/null; then
  echo "Stopping TrafegoDNS service..."
  pkill -f "node.*app.js"
  # Give it a moment to stop
  sleep 2
fi

# Remove any lock files
echo "Removing lock files..."
rm -f "$LOCK_FILE"
echo "✅ Lock files removed"

# Check if database file exists
if [ -f "$DB_FILE" ]; then
  echo "Backing up existing database..."
  BACKUP_FILE="$DATA_DIR/trafegodns_backup_$(date +%Y%m%d_%H%M%S).db"
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "✅ Database backed up to $BACKUP_FILE"
  
  echo "Removing database files..."
  rm -f "$DB_FILE" "$WAL_FILE" "$SHM_FILE"
  echo "✅ Database files removed"
else
  echo "No database file found at $DB_FILE"
fi

# Check for JSON files to preserve
echo "Checking for JSON files that would be migrated..."
JSON_FILES=("$DATA_DIR/dns-records.json" "$DATA_DIR/users.json" "$PWD/dns-records.json")
JSON_FOUND=false

for file in "${JSON_FILES[@]}"; do
  if [ -f "$file" ]; then
    JSON_FOUND=true
    echo "Found JSON file: $file"
    BACKUP_JSON="${file}.backup_$(date +%Y%m%d_%H%M%S)"
    cp "$file" "$BACKUP_JSON"
    echo "✅ Backed up to $BACKUP_JSON"
  fi
done

if [ "$JSON_FOUND" = false ]; then
  echo "No JSON files found for migration"
fi

# Fix permissions for data directory
echo "Setting correct permissions for data directory..."
chmod -R 755 "$DATA_DIR"
if id -u abc > /dev/null 2>&1; then
  chown -R abc:abc "$DATA_DIR"
  echo "✅ Permissions set to abc:abc"
else
  echo "⚠️ User 'abc' not found, couldn't change ownership"
  echo "   This is normal if not running in the official container"
fi

echo ""
echo "====================================="
echo "Database reset complete."
echo "TrafegoDNS will create a new database on next start."
echo "====================================="