#!/bin/bash
# Script to add last_processed and managed columns to dns_records table
# This version uses transactions properly to avoid conflicts with TrafegoDNS app

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"
TMP_SQL=$(mktemp)
LOG_FILE="$DATA_DIR/last-processed-migration.log"

echo "Checking database schema..."
echo "$(date): Starting schema check" > "$LOG_FILE"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "Database file not found at $DB_FILE"
  echo "$(date): Database file not found at $DB_FILE" >> "$LOG_FILE"
  rm -f "$TMP_SQL"
  exit 1
fi

# Check if sqlite3 command is available
if ! command -v sqlite3 &> /dev/null; then
  echo "ERROR: sqlite3 command not found. Please install SQLite."
  echo "On Debian/Ubuntu: apt-get update && apt-get install -y sqlite3"
  echo "On Alpine: apk add --no-cache sqlite"
  echo "On CentOS/RHEL: yum install -y sqlite"
  echo "Migration cannot continue without SQLite. Exiting."
  echo "$(date): SQLite command not found" >> "$LOG_FILE"
  rm -f "$TMP_SQL"
  exit 1
fi

# Check if database is locked by trying a quick query
echo "Checking database lock status..."
if ! sqlite3 "$DB_FILE" "PRAGMA quick_check;" &> /dev/null; then
  echo "⚠️ Database appears to be locked or corrupted, waiting 10 seconds..."
  echo "$(date): Database appears locked, waiting" >> "$LOG_FILE"
  sleep 10
  
  # Try one more time
  if ! sqlite3 "$DB_FILE" "PRAGMA quick_check;" &> /dev/null; then
    echo "❌ Database is still locked or corrupted. Migration cannot proceed."
    echo "$(date): Database is still locked, exiting" >> "$LOG_FILE"
    rm -f "$TMP_SQL"
    exit 1
  fi
fi

# Initialize migration status
migration_performed=0

# Try to put database in WAL mode for better concurrency
echo "Ensuring database is in WAL mode..."
echo "PRAGMA journal_mode=WAL;" > "$TMP_SQL"
sqlite3 "$DB_FILE" < "$TMP_SQL"

# Create a single transaction for all schema changes
# This is critical to avoid conflicts with the app's own transactions
cat > "$TMP_SQL" << 'EOF'
-- Start a single transaction for all schema changes
BEGIN IMMEDIATE TRANSACTION;

-- Check if last_processed column exists
CREATE TEMP TABLE _column_exists AS
SELECT 1 FROM pragma_table_info('dns_records') WHERE name='last_processed';

-- Add last_processed column if needed
INSERT INTO _column_exists 
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM _column_exists);

-- Add column if needed
UPDATE _column_exists SET rowid = (
  ALTER TABLE dns_records ADD COLUMN last_processed TIMESTAMP
) WHERE (SELECT * FROM _column_exists) = 0;

-- Initialize last_processed with tracked_at value for existing records
UPDATE dns_records SET last_processed = tracked_at WHERE last_processed IS NULL;

-- Check if managed column exists
DROP TABLE _column_exists;
CREATE TEMP TABLE _column_exists AS
SELECT 1 FROM pragma_table_info('dns_records') WHERE name='managed';

-- Add managed column if needed
INSERT INTO _column_exists 
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM _column_exists);

-- Add column if needed
UPDATE _column_exists SET rowid = (
  ALTER TABLE dns_records ADD COLUMN managed INTEGER DEFAULT 0
) WHERE (SELECT * FROM _column_exists) = 0;

-- Update schema version if table exists
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) 
SELECT 2, 'add_last_processed_and_managed_columns', datetime('now')
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')
AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=2);

-- Commit all changes at once
COMMIT;
EOF

echo "Running single transaction for all schema changes..."
echo "$(date): Running schema changes in single transaction" >> "$LOG_FILE"

# Execute the transaction SQL
if sqlite3 "$DB_FILE" < "$TMP_SQL"; then
  echo "$(date): Schema changes completed successfully" >> "$LOG_FILE"
  echo "✅ Schema update transaction completed successfully"
else
  echo "$(date): Schema changes failed: $?" >> "$LOG_FILE"
  echo "❌ Schema update transaction failed. Check log for details."
  
  # Capture any error info
  echo ".schema dns_records" | sqlite3 "$DB_FILE" >> "$LOG_FILE" 2>&1
fi

# Check if changes were made by looking at schema
echo "Verifying schema changes..."
if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "last_processed"; then
  echo "✅ last_processed column exists"
  echo "$(date): last_processed column verified" >> "$LOG_FILE"
else
  echo "⚠️ last_processed column not found in schema"
  echo "$(date): last_processed column not found in schema" >> "$LOG_FILE"
fi

if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
  echo "✅ managed column exists"
  echo "$(date): managed column verified" >> "$LOG_FILE"
else
  echo "⚠️ managed column not found in schema"
  echo "$(date): managed column not found in schema" >> "$LOG_FILE"
fi

# Clean up
rm -f "$TMP_SQL"
echo "$(date): Schema check completed" >> "$LOG_FILE"
echo "Schema check completed. See log at $LOG_FILE for details."