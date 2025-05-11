#!/bin/bash
# Script to add last_processed column to dns_records table

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
  echo "sqlite3 command not found. Please install SQLite."
  exit 1
fi

# Check if last_processed column already exists
if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "last_processed"; then
  echo "last_processed column already exists in dns_records table."
  exit 0
fi

echo "Adding last_processed column to dns_records table..."

# Add last_processed column
sqlite3 "$DB_FILE" "ALTER TABLE dns_records ADD COLUMN last_processed TIMESTAMP;"

# Initialize last_processed with tracked_at value for existing records
sqlite3 "$DB_FILE" "UPDATE dns_records SET last_processed = tracked_at WHERE last_processed IS NULL;"

echo "Migration completed successfully."
echo "Added last_processed column to dns_records table and initialized with tracked_at values."