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

  # Check if we have the fixed version available
  if [ -f "$APP_DIR/src/database/better-sqlite.js.fix" ]; then
    echo "- Found better-sqlite.js.fix with improved transaction handling"
    echo "- Applying enhanced transaction fixes..."
    cp "$APP_DIR/src/database/better-sqlite.js.fix" "$APP_DIR/src/database/better-sqlite.js"
    echo "✅ Applied enhanced transaction fixes to better-sqlite.js"
  else
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
fi

# 5.4 Check for lock manager
if [ ! -f "$APP_DIR/src/database/lockManager.js" ]; then
  echo "- Lock manager file not found, creating it..."
  cat > "$APP_DIR/src/database/lockManager.js" << 'EOF'
/**
 * Database lock manager
 * Provides file-based advisory locking to coordinate database operations
 * between multiple processes.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class LockManager {
  constructor() {
    this.dataDir = path.join(process.env.CONFIG_DIR || '/config', 'data');
    this.migrationLockFile = path.join(this.dataDir, '.migration.lock');
    this.lockFileDescriptor = null;
    this.lockOwner = false;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (error) {
        logger.error(`Failed to create data directory: ${error.message}`);
      }
    }
  }

  /**
   * Acquire an exclusive lock for database initialization
   * Uses OS-level file locking for reliability across processes
   * @param {number} timeout - Maximum time to wait for lock in milliseconds
   * @returns {Promise<boolean>} Whether lock was acquired
   */
  async acquireLock(timeout = 10000) {
    if (this.lockOwner) {
      logger.debug('Already own the lock, no need to acquire again');
      return true;
    }

    const startTime = Date.now();

    // First, clear any stale lock files
    try {
      if (fs.existsSync(this.migrationLockFile)) {
        const stats = fs.statSync(this.migrationLockFile);
        const lockAge = Date.now() - stats.mtimeMs;

        // If lock is older than 2 minutes, consider it stale
        if (lockAge > 120000) {
          logger.warn('Removing stale migration lock file');
          fs.unlinkSync(this.migrationLockFile);
        }
      }
    } catch (error) {
      logger.warn(`Error checking stale lock: ${error.message}`);
    }

    // Create lock file if it doesn't exist
    if (!fs.existsSync(this.migrationLockFile)) {
      try {
        // Create an empty file
        fs.writeFileSync(this.migrationLockFile, process.pid.toString(), { flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger.error(`Failed to create lock file: ${error.message}`);
          return false;
        }
        // If EEXIST, file was created by another process, continue to lock attempt
      }
    }

    // Try to open and lock the file
    while (true) {
      try {
        // Open file for read/write with exclusive lock
        this.lockFileDescriptor = fs.openSync(this.migrationLockFile, 'r+');

        // Try to get exclusive lock
        try {
          // For Windows and WSL compatibility, use existence check
          const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();

          // If the file is empty or contains our PID, we can claim it
          if (!lockContent || lockContent === process.pid.toString()) {
            // Write our PID to the file
            fs.writeFileSync(this.migrationLockFile, process.pid.toString());
            this.lockOwner = true;
            logger.debug(`Database lock acquired by process ${process.pid}`);
            return true;
          }

          // If it contains another PID, check if that process still exists
          const otherPid = parseInt(lockContent, 10);
          if (isNaN(otherPid)) {
            // Invalid PID, overwrite with ours
            fs.writeFileSync(this.migrationLockFile, process.pid.toString());
            this.lockOwner = true;
            logger.debug(`Database lock acquired by process ${process.pid} (invalid previous owner)`);
            return true;
          }

          // Check if process exists (can't do this reliably cross-platform)
          // Just assume it does exist and keep trying
          logger.debug(`Lock owned by process ${otherPid}, waiting...`);
        } catch (lockError) {
          logger.warn(`Error during lock attempt: ${lockError.message}`);
        }

        // Close file and try again later
        if (this.lockFileDescriptor !== null) {
          fs.closeSync(this.lockFileDescriptor);
          this.lockFileDescriptor = null;
        }
      } catch (error) {
        logger.warn(`Failed to open lock file: ${error.message}`);
      }

      // Check if we've timed out
      if (Date.now() - startTime > timeout) {
        logger.error(`Failed to acquire lock after ${timeout}ms timeout`);
        return false;
      }

      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  /**
   * Release the lock if we own it
   * @returns {boolean} Whether release was successful
   */
  releaseLock() {
    if (!this.lockOwner) {
      logger.debug('Not the lock owner, nothing to release');
      return true;
    }

    try {
      // Read current lock content to ensure we still own it
      if (fs.existsSync(this.migrationLockFile)) {
        const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
        if (lockContent !== process.pid.toString()) {
          logger.warn(`Lock was stolen by process ${lockContent}, not releasing`);
          this.lockOwner = false;
          return false;
        }

        // Delete the lock file
        fs.unlinkSync(this.migrationLockFile);
      }

      // Close file descriptor if open
      if (this.lockFileDescriptor !== null) {
        fs.closeSync(this.lockFileDescriptor);
        this.lockFileDescriptor = null;
      }

      this.lockOwner = false;
      logger.debug(`Database lock released by process ${process.pid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to release lock: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a lock is currently held by any process
   * @returns {boolean} Whether lock exists
   */
  isLocked() {
    try {
      if (!fs.existsSync(this.migrationLockFile)) {
        return false;
      }

      const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
      return !!lockContent;
    } catch (error) {
      logger.error(`Error checking lock status: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if we are the current lock owner
   * @returns {boolean} Whether we own the lock
   */
  isLockOwner() {
    if (!this.lockOwner) {
      return false;
    }

    try {
      if (!fs.existsSync(this.migrationLockFile)) {
        this.lockOwner = false;
        return false;
      }

      const lockContent = fs.readFileSync(this.migrationLockFile, 'utf8').trim();
      const isOwner = lockContent === process.pid.toString();

      if (!isOwner) {
        this.lockOwner = false;
      }

      return isOwner;
    } catch (error) {
      logger.error(`Error checking lock ownership: ${error.message}`);
      this.lockOwner = false;
      return false;
    }
  }
}

module.exports = new LockManager();
EOF

  echo "✅ Created lockManager.js for better process coordination"
else
  echo "✅ Lock manager file already exists"
fi

# 6. Check if DB is in a broken state
if [ -f "$DB_FILE" ]; then
  # Try to query the database to see if it's functional
  echo "Checking database functionality..."
  sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master;" > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "⚠️ Database appears to be in a broken state."
    echo "Consider running the reset script to create a clean database:"
    echo "   /app/docker-s6/scripts/reset-sqlite.sh"
  else
    echo "✅ Database appears functional"
  fi

  # Check for stuck transaction
  sqlite3 "$DB_FILE" "PRAGMA quick_check;" > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "⚠️ Database integrity check failed. Database may be corrupted."
    echo "Consider running the reset script to create a clean database:"
    echo "   /app/docker-s6/scripts/reset-sqlite.sh"
  fi
fi

# 7. Check for WAL mode in database file
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
echo ""
echo "If you continue to experience database issues after restart:"
echo "  1. Run the database reset script: /app/docker-s6/scripts/reset-sqlite.sh"
echo "  2. This will completely reset your database and start fresh"
echo "====================================="