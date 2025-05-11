#!/bin/bash
# Script to fix SQLite issues

echo "====================================="
echo "TrafegoDNS SQLite Fix Script"
echo "====================================="

# Set directory paths
APP_DIR="/app"
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

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

# 3. Install SQLite packages
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

# 4. Apply the fixed files
echo "Applying fixed User.js and database/index.js files..."

if [ -f "$APP_DIR/src/api/v1/models/User.js.fix" ]; then
  echo "- Backing up and replacing User.js..."
  cp "$APP_DIR/src/api/v1/models/User.js" "$APP_DIR/src/api/v1/models/User.js.bak"
  cp "$APP_DIR/src/api/v1/models/User.js.fix" "$APP_DIR/src/api/v1/models/User.js"
  echo "✅ User.js replaced"
else
  echo "❌ User.js.fix not found, fix was not applied"
fi

if [ -f "$APP_DIR/src/database/index.js.fix" ]; then
  echo "- Backing up and replacing database/index.js..."
  cp "$APP_DIR/src/database/index.js" "$APP_DIR/src/database/index.js.bak"
  cp "$APP_DIR/src/database/index.js.fix" "$APP_DIR/src/database/index.js"
  echo "✅ database/index.js replaced"
else
  echo "❌ database/index.js.fix not found, fix was not applied"
fi

echo "====================================="
echo "Fix completed. Restart TrafegoDNS to apply changes."
echo "====================================="