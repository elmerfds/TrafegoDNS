#!/bin/bash
# Script to manage JSON files after migration to SQLite
# This script now forcibly removes all JSON files since we're using SQLite exclusively

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

echo "====================================="
echo "TrafegoDNS SQLite Enforcer"
echo "====================================="
echo "🔒 JSON storage is permanently disabled - SQLite is the only storage method"

# Check if migration has been completed
if [ -f "$DATA_DIR/.json_migration_complete" ]; then
  MIGRATION_DATE=$(cat "$DATA_DIR/.json_migration_complete")
  echo "✅ JSON migration completed on: $MIGRATION_DATE"
  
  # Force removal of all JSON files
  echo "🔍 Checking for and removing all JSON files..."
  JSON_FILES_REMOVED=false
    
  # Check and forcibly remove all JSON data files
  
  # Check users.json
  if [ -f "$DATA_DIR/users.json" ]; then
    echo "Backing up and removing users.json"
    mv "$DATA_DIR/users.json" "$DATA_DIR/users.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  # Check revoked-tokens.json
  if [ -f "$DATA_DIR/revoked-tokens.json" ]; then
    echo "Backing up and removing revoked-tokens.json"
    mv "$DATA_DIR/revoked-tokens.json" "$DATA_DIR/revoked-tokens.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  # Check dns-records.json in all possible locations
  if [ -f "$DATA_DIR/dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from data directory"
    mv "$DATA_DIR/dns-records.json" "$DATA_DIR/dns-records.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "/app/dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from app directory"
    mv "/app/dns-records.json" "$DATA_DIR/dns-records.json.app.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "./dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from current directory"
    mv "./dns-records.json" "$DATA_DIR/dns-records.json.cwd.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  # Check for migrated files that should be removed too
  if [ -f "$DATA_DIR/users.json.migrated" ]; then
    echo "Backing up and removing users.json.migrated"
    mv "$DATA_DIR/users.json.migrated" "$DATA_DIR/users.json.migrated.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "$DATA_DIR/revoked-tokens.json.migrated" ]; then
    echo "Backing up and removing revoked-tokens.json.migrated"
    mv "$DATA_DIR/revoked-tokens.json.migrated" "$DATA_DIR/revoked-tokens.json.migrated.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "$DATA_DIR/dns-records.json.migrated" ]; then
    echo "Backing up and removing dns-records.json.migrated"
    mv "$DATA_DIR/dns-records.json.migrated" "$DATA_DIR/dns-records.json.migrated.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ "$JSON_FILES_REMOVED" = "true" ]; then
    echo "✅ All JSON files have been backed up and removed - SQLite is the only storage"
  else
    echo "✅ No JSON files found - SQLite is the only storage method"
  fi
else
  echo "⚠️ JSON migration has not been completed yet - forcing migration now"
  
  # Force removal of all JSON files regardless of migration status
  echo "🔍 Checking for and removing all JSON files..."
  JSON_FILES_REMOVED=false
  
  # Check and forcibly remove all JSON data files
  
  # Check users.json
  if [ -f "$DATA_DIR/users.json" ]; then
    echo "Backing up and removing users.json"
    mv "$DATA_DIR/users.json" "$DATA_DIR/users.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  # Check revoked-tokens.json
  if [ -f "$DATA_DIR/revoked-tokens.json" ]; then
    echo "Backing up and removing revoked-tokens.json"
    mv "$DATA_DIR/revoked-tokens.json" "$DATA_DIR/revoked-tokens.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  # Check dns-records.json in all possible locations
  if [ -f "$DATA_DIR/dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from data directory"
    mv "$DATA_DIR/dns-records.json" "$DATA_DIR/dns-records.json.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "/app/dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from app directory"
    mv "/app/dns-records.json" "$DATA_DIR/dns-records.json.app.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ -f "./dns-records.json" ]; then
    echo "Backing up and removing dns-records.json from current directory"
    mv "./dns-records.json" "$DATA_DIR/dns-records.json.cwd.bak.$(date +%s)"
    JSON_FILES_REMOVED=true
  fi
  
  if [ "$JSON_FILES_REMOVED" = "true" ]; then
    echo "✅ All JSON files have been backed up and removed - SQLite will be used exclusively"
    
    # Force mark migration as complete so we never try to use JSON again
    CURRENT_DATE=$(date)
    echo "$CURRENT_DATE" > "$DATA_DIR/.json_migration_complete"
    echo "true" > "$DATA_DIR/.users_migrated"
    echo "true" > "$DATA_DIR/.tokens_migrated"
    echo "true" > "$DATA_DIR/.dns_records_migrated"
    
    echo "✅ Marked migration as complete on: $CURRENT_DATE"
  else
    echo "✅ No JSON files found - SQLite will be used exclusively"
    
    # Still mark migration as complete to prevent any attempts to use JSON
    CURRENT_DATE=$(date)
    echo "$CURRENT_DATE" > "$DATA_DIR/.json_migration_complete"
    echo "true" > "$DATA_DIR/.users_migrated"
    echo "true" > "$DATA_DIR/.tokens_migrated"
    echo "true" > "$DATA_DIR/.dns_records_migrated"
    
    echo "✅ Marked migration as complete on: $CURRENT_DATE"
  fi
  
  # Check if SQLite database exists
  if [ -f "$DB_FILE" ]; then
    echo "✅ SQLite database exists and will be used"
  else
    echo "⚠️ SQLite database does not exist yet - it will be created when TrafegoDNS starts"
    echo "⚠️ Any data from JSON files has been backed up but will need manual migration"
  fi
fi

echo "====================================="