#!/bin/bash
# Script to fix SQLite issues, including transaction handling and database locks

echo "====================================="
echo "TrafegoDNS SQLite Fix Script"
echo "====================================="

# Set directory paths
APP_DIR="/app"
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"
LOCK_FILE="$DATA_DIR/.migration.lock"

# 1. Create and fix data directory permissions
echo "Fixing data directory permissions..."
mkdir -p "$DATA_DIR"
chmod 755 "$DATA_DIR"
chown -R abc:abc "$DATA_DIR"
echo "✅ Data directory permissions fixed"

# 2. Fix database file permissions if it exists
if [ -f "$DB_FILE" ]; then
  echo "Fixing database file permissions..."
  chmod 644 "$DB_FILE"
  chown abc:abc "$DB_FILE"
  echo "✅ Database file permissions fixed"
else
  echo "ℹ️ Database file does not exist yet, will be created on first run"
fi

# 3. Check and remove migration lock file if it exists
if [ -f "$LOCK_FILE" ]; then
  echo "Found migration lock file, removing to prevent initialization conflicts..."
  rm -f "$LOCK_FILE"
  echo "✅ Migration lock file removed"
fi

# 4. Install SQLite packages
echo "Installing SQLite packages..."
cd "$APP_DIR"

echo "- Installing better-sqlite3 (this may take a moment)..."
npm install better-sqlite3 --save

if [ $? -ne 0 ]; then
  echo "⚠️ Failed to install better-sqlite3, trying sqlite3..."
  npm install sqlite3 --save
  
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install any SQLite package. Please check that dev tools are installed."
    echo "Try: apk add --no-cache python3 make g++ build-base"
  else
    echo "✅ sqlite3 package installed successfully"
  fi
else
  echo "✅ better-sqlite3 package installed successfully"
fi

# 5. Apply the fixed files
echo "Applying fixed database files..."

# 5.1 User.js fix
if [ -f "$APP_DIR/src/api/v1/models/User.js.fix" ]; then
  echo "- Backing up and replacing User.js..."
  cp "$APP_DIR/src/api/v1/models/User.js" "$APP_DIR/src/api/v1/models/User.js.bak"
  cp "$APP_DIR/src/api/v1/models/User.js.fix" "$APP_DIR/src/api/v1/models/User.js"
  echo "✅ User.js replaced"
else
  echo "❌ User.js.fix not found, fix was not applied"
fi

# 5.2 database/index.js fix
if [ -f "$APP_DIR/src/database/index.js.fix" ]; then
  echo "- Backing up and replacing database/index.js..."
  cp "$APP_DIR/src/database/index.js" "$APP_DIR/src/database/index.js.bak"
  cp "$APP_DIR/src/database/index.js.fix" "$APP_DIR/src/database/index.js"
  echo "✅ database/index.js replaced"
else
  echo "❌ database/index.js.fix not found, fix was not applied"
fi

# 5.3 Backup and update better-sqlite.js with transaction fixes
if [ -f "$APP_DIR/src/database/better-sqlite.js" ]; then
  echo "- Backing up current better-sqlite.js..."
  cp "$APP_DIR/src/database/better-sqlite.js" "$APP_DIR/src/database/better-sqlite.js.bak"
  echo "✅ better-sqlite.js backed up"
  
  echo "- Checking for transaction tracking improvements..."
  grep -q "inTransaction" "$APP_DIR/src/database/better-sqlite.js"
  if [ $? -ne 0 ]; then
    echo "⚠️ Transaction tracking not found in better-sqlite.js"
    echo "Please manually update better-sqlite.js with transaction fixes."
    echo "See SQLITE_FIX.md for details on the necessary changes."
  else
    echo "✅ Transaction tracking found in better-sqlite.js"
  fi
fi

# 6. Check for WAL mode in database file
if [ -f "$DB_FILE" ]; then
  echo "Checking if database is in WAL mode..."
  # Create a temp file to run the pragma command
  TEMP_SQL=$(mktemp)
  echo "PRAGMA journal_mode;" > "$TEMP_SQL"
  
  # Check if sqlite3 command is available
  if command -v sqlite3 >/dev/null 2>&1; then
    JOURNAL_MODE=$(sqlite3 "$DB_FILE" < "$TEMP_SQL")
    if [ "$JOURNAL_MODE" != "wal" ]; then
      echo "⚠️ Database is not in WAL mode. Setting WAL mode for better concurrency..."
      echo "PRAGMA journal_mode=WAL;" > "$TEMP_SQL"
      sqlite3 "$DB_FILE" < "$TEMP_SQL"
      echo "✅ Database set to WAL mode"
    else
      echo "✅ Database already in WAL mode"
    fi
  else
    echo "⚠️ sqlite3 command not available, skipping WAL mode check"
  fi
  
  # Clean up temp file
  rm -f "$TEMP_SQL"
fi

echo "====================================="
echo "Fix completed. Restart TrafegoDNS to apply changes."
echo "====================================="