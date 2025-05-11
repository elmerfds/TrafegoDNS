#!/bin/bash
# Script to add last_processed and managed columns to dns_records table

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

echo "Checking database schema..."

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "Database file not found at $DB_FILE"
  exit 1
fi

# Check if sqlite3 command is available
if ! command -v sqlite3 &> /dev/null; then
  echo "ERROR: sqlite3 command not found. Please install SQLite."
  echo "On Debian/Ubuntu: apt-get update && apt-get install -y sqlite3"
  echo "On Alpine: apk add --no-cache sqlite"
  echo "On CentOS/RHEL: yum install -y sqlite"
  echo "Migration cannot continue without SQLite. Exiting."
  exit 1
fi

# Initialize migration status
migration_performed=0

# Check if last_processed column already exists
if ! sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "last_processed"; then
  echo "Adding last_processed column to dns_records table..."

  # Add last_processed column
  sqlite3 "$DB_FILE" "ALTER TABLE dns_records ADD COLUMN last_processed TIMESTAMP;"

  # Initialize last_processed with tracked_at value for existing records
  sqlite3 "$DB_FILE" "UPDATE dns_records SET last_processed = tracked_at WHERE last_processed IS NULL;"

  echo "Added last_processed column and initialized with tracked_at values."
  migration_performed=1
else
  echo "last_processed column already exists. Skipping."
fi

# Check if managed column already exists
if ! sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
  echo "Adding managed column to dns_records table..."

  # Add managed column
  sqlite3 "$DB_FILE" "ALTER TABLE dns_records ADD COLUMN managed INTEGER DEFAULT 0;"

  echo "Added managed column with default value of 0."
  migration_performed=1
else
  echo "managed column already exists. Skipping."
fi

# Update schema version in schema_migrations if it exists
if sqlite3 "$DB_FILE" ".tables" | grep -q "schema_migrations"; then
  # Check if version 2 already exists
  if ! sqlite3 "$DB_FILE" "SELECT * FROM schema_migrations WHERE version=2;" | grep -q "2"; then
    echo "Updating schema version to 2 in schema_migrations table..."
    sqlite3 "$DB_FILE" "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'add_last_processed_and_managed_columns', datetime('now'));"
  fi
fi

if [ $migration_performed -eq 1 ]; then
  echo "Migration completed successfully."
else
  echo "No migration needed. Schema is up to date."
fi