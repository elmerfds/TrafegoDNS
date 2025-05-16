#!/bin/bash
set -e

DB_PATH="/config/data/trafegodns.db"
echo "Fixing SQLite schema issues in $DB_PATH"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found: $DB_PATH"
  exit 1
fi

# Create a backup
cp "$DB_PATH" "${DB_PATH}.backup"
echo "Created backup: ${DB_PATH}.backup"

# Run SQL fixes
sqlite3 "$DB_PATH" <<EOF
-- Add the missing last_refreshed column if it doesn't exist
PRAGMA table_info(dns_records);
SELECT 'Adding last_refreshed column to dns_records';
ALTER TABLE dns_records ADD COLUMN last_refreshed TEXT;

-- Insert the migration record to prevent further attempts
INSERT OR IGNORE INTO schema_migrations (version, name) 
VALUES (3, 'add_last_refreshed_column_to_dns_records');

-- Check for records with null provider in dns_tracked_records
SELECT COUNT(*) as null_providers FROM dns_tracked_records WHERE provider IS NULL;

-- Exit transaction mode if it's stuck
COMMIT;
PRAGMA journal_mode=WAL;

-- Show the updated schema
PRAGMA table_info(dns_records);
SELECT 'Schema update completed';
EOF

echo "SQLite schema fixes applied successfully"
echo "Please restart the TrafegoDNS container for changes to take effect"