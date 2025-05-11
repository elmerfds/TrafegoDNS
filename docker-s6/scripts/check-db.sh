#!/bin/bash
# Script to check SQLite database status and permissions

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

echo "====================================="
echo "TrafegoDNS Database Check Utility"
echo "====================================="

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
  echo "❌ Data directory not found: $DATA_DIR"
  echo "Creating data directory..."
  mkdir -p "$DATA_DIR"
  if [ $? -eq 0 ]; then
    echo "✅ Created data directory: $DATA_DIR"
  else
    echo "❌ Failed to create data directory, check permissions"
    exit 1
  fi
else
  echo "✅ Data directory exists: $DATA_DIR"
fi

# Check data directory permissions
DATA_DIR_PERMS=$(stat -c "%a %U:%G" "$DATA_DIR" 2>/dev/null || ls -la "$DATA_DIR" | grep -E "^d")
echo "📄 Data directory permissions: $DATA_DIR_PERMS"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "❌ Database file not found: $DB_FILE"
  echo "The database will be created when TrafegoDNS starts for the first time."
else
  echo "✅ Database file exists: $DB_FILE"
  
  # Check database file permissions
  DB_FILE_PERMS=$(stat -c "%a %U:%G" "$DB_FILE" 2>/dev/null || ls -la "$DB_FILE")
  echo "📄 Database file permissions: $DB_FILE_PERMS"
  
  # Check if database is readable
  if [ -r "$DB_FILE" ]; then
    echo "✅ Database file is readable"
  else
    echo "❌ Database file is not readable, check permissions"
  fi
  
  # Check if database is writable
  if [ -w "$DB_FILE" ]; then
    echo "✅ Database file is writable"
  else
    echo "❌ Database file is not writable, check permissions"
  fi
  
  # Check if SQLite3 is installed
  if command -v sqlite3 &> /dev/null; then
    echo "✅ SQLite3 command is available"
    
    # Check if the database can be opened and has the proper schema
    echo "📊 Checking database schema..."
    
    # Try to query the database
    TABLES=$(sqlite3 "$DB_FILE" ".tables" 2>&1)
    if [[ "$TABLES" == *"Error"* ]]; then
      echo "❌ Failed to query database: $TABLES"
    else
      echo "✅ Database can be opened and queried"
      echo "📋 Database tables: $TABLES"
      
      # Check for required tables
      if [[ "$TABLES" == *"dns_records"* ]]; then
        echo "✅ dns_records table exists"
        
        # Check for required columns
        COLUMNS=$(sqlite3 "$DB_FILE" "PRAGMA table_info(dns_records);" 2>&1)
        if [[ "$COLUMNS" == *"last_processed"* ]]; then
          echo "✅ last_processed column exists"
        else
          echo "❌ last_processed column missing! Run migrations."
        fi
        
        if [[ "$COLUMNS" == *"managed"* ]]; then
          echo "✅ managed column exists"
        else
          echo "❌ managed column missing! Run migrations."
        fi
      else
        echo "❌ dns_records table missing! Database may be new or corrupted."
      fi
      
      # Check for users table
      if [[ "$TABLES" == *"users"* ]]; then
        echo "✅ users table exists"
        
        # Count users
        USER_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users;" 2>&1)
        if [[ "$USER_COUNT" =~ ^[0-9]+$ ]]; then
          echo "✅ Users table has $USER_COUNT users"
          if [ "$USER_COUNT" -eq 0 ]; then
            echo "⚠️ No users found in database. Default admin user will be created on startup."
          fi
        else
          echo "❌ Failed to count users: $USER_COUNT"
        fi
      else
        echo "❌ users table missing! Database may be new or corrupted."
      fi
    fi
  else
    echo "❌ SQLite3 command not found. Install sqlite3 for better diagnostics."
  fi
fi

echo "====================================="
echo "Database check complete"
echo "====================================="