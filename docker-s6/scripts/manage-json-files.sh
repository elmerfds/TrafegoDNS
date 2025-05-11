#!/bin/bash
# Script to manage JSON files after migration to SQLite

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

echo "====================================="
echo "TrafegoDNS JSON File Manager"
echo "====================================="

# Check if migration has been completed
if [ -f "$DATA_DIR/.json_migration_complete" ]; then
  MIGRATION_DATE=$(cat "$DATA_DIR/.json_migration_complete")
  echo "✅ JSON migration completed on: $MIGRATION_DATE"
  
  # Check what to do with JSON files now
  if [ "$1" = "cleanup" ]; then
    echo "Removing original JSON files that have been migrated..."
    
    # Check users.json
    if [ -f "$DATA_DIR/.users_migrated" ] && [ -f "$DATA_DIR/users.json" ]; then
      echo "Moving users.json to users.json.migrated"
      mv "$DATA_DIR/users.json" "$DATA_DIR/users.json.migrated"
    fi
    
    # Check revoked-tokens.json
    if [ -f "$DATA_DIR/.tokens_migrated" ] && [ -f "$DATA_DIR/revoked-tokens.json" ]; then
      echo "Moving revoked-tokens.json to revoked-tokens.json.migrated"
      mv "$DATA_DIR/revoked-tokens.json" "$DATA_DIR/revoked-tokens.json.migrated"
    fi
    
    # Check dns-records.json
    if [ -f "$DATA_DIR/.dns_records_migrated" ]; then
      if [ -f "$DATA_DIR/dns-records.json" ]; then
        echo "Moving dns-records.json to dns-records.json.migrated"
        mv "$DATA_DIR/dns-records.json" "$DATA_DIR/dns-records.json.migrated"
      elif [ -f "/app/dns-records.json" ]; then
        echo "Moving app/dns-records.json to data/dns-records.json.migrated"
        mv "/app/dns-records.json" "$DATA_DIR/dns-records.json.migrated"
      fi
    fi
    
    echo "✅ JSON files have been moved to .migrated files"
    echo "They are still available for reference but will no longer be used"
  elif [ "$1" = "restore" ]; then
    echo "Restoring JSON files from backups..."
    
    # Find newest backup for each file
    USERS_BACKUP=$(ls -t "$DATA_DIR"/users.json.bak.* 2>/dev/null | head -1)
    TOKENS_BACKUP=$(ls -t "$DATA_DIR"/revoked-tokens.json.bak.* 2>/dev/null | head -1)
    DNS_BACKUP=$(ls -t "$DATA_DIR"/dns-records.json.bak.* 2>/dev/null | head -1)
    
    if [ -n "$USERS_BACKUP" ]; then
      echo "Restoring users.json from $USERS_BACKUP"
      cp "$USERS_BACKUP" "$DATA_DIR/users.json"
    fi
    
    if [ -n "$TOKENS_BACKUP" ]; then
      echo "Restoring revoked-tokens.json from $TOKENS_BACKUP"
      cp "$TOKENS_BACKUP" "$DATA_DIR/revoked-tokens.json"
    fi
    
    if [ -n "$DNS_BACKUP" ]; then
      echo "Restoring dns-records.json from $DNS_BACKUP"
      cp "$DNS_BACKUP" "$DATA_DIR/dns-records.json"
    fi
    
    echo "✅ JSON files have been restored from backups"
    echo "Note: This doesn't affect SQLite data, which is still the primary source"
  else
    echo "⚠️ JSON files have been migrated to SQLite but are still present"
    echo "Run this script with 'cleanup' to safely move them to .migrated files"
    echo "Run this script with 'restore' to restore backups if needed"
  fi
else
  echo "⚠️ JSON migration has not been completed yet"
  
  # Check if SQLite database exists and has data
  if [ -f "$DB_FILE" ]; then
    if command -v sqlite3 &> /dev/null; then
      TABLES=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table';")
      if [ "$TABLES" -gt 0 ]; then
        echo "💡 SQLite database exists with $TABLES tables"
        
        # Check for JSON files that need migration
        JSON_FILES_FOUND=0
        
        if [ -f "$DATA_DIR/users.json" ]; then
          echo "- users.json found (needs migration)"
          JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
        fi
        
        if [ -f "$DATA_DIR/revoked-tokens.json" ]; then
          echo "- revoked-tokens.json found (needs migration)"
          JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
        fi
        
        if [ -f "$DATA_DIR/dns-records.json" ] || [ -f "/app/dns-records.json" ]; then
          echo "- dns-records.json found (needs migration)"
          JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
        fi
        
        if [ "$JSON_FILES_FOUND" -gt 0 ]; then
          echo "⚠️ Found $JSON_FILES_FOUND JSON files that need migration"
          echo "Migration will happen automatically when TrafegoDNS starts"
        else
          echo "✅ No JSON files found for migration"
        fi
      else
        echo "⚠️ SQLite database exists but has no tables"
        echo "It may be corrupted or newly created"
      fi
    else
      echo "❌ SQLite3 command not available, cannot check database"
    fi
  else
    echo "⚠️ SQLite database does not exist yet"
    echo "It will be created when TrafegoDNS starts"
    
    # Check for JSON files that will be migrated
    JSON_FILES_FOUND=0
    
    if [ -f "$DATA_DIR/users.json" ]; then
      echo "- users.json found (will be migrated)"
      JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
    fi
    
    if [ -f "$DATA_DIR/revoked-tokens.json" ]; then
      echo "- revoked-tokens.json found (will be migrated)"
      JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
    fi
    
    if [ -f "$DATA_DIR/dns-records.json" ] || [ -f "/app/dns-records.json" ]; then
      echo "- dns-records.json found (will be migrated)"
      JSON_FILES_FOUND=$((JSON_FILES_FOUND + 1))
    fi
    
    if [ "$JSON_FILES_FOUND" -gt 0 ]; then
      echo "⚠️ Found $JSON_FILES_FOUND JSON files that will be migrated on first run"
    else
      echo "✅ No JSON files found, clean SQLite setup"
    fi
  fi
fi

echo "====================================="