# TrafegoDNS Storage System

TrafegoDNS uses a hybrid storage system with SQLite as the primary storage engine and JSON files as a fallback mechanism when SQLite isn't available.

## Storage Hierarchy

1. **SQLite Database (Recommended)**
   - Primary storage engine
   - Better performance and reliability
   - Support for complex queries and transactions
   - Recommended for production environments

2. **JSON File Storage (Fallback)**
   - Used when SQLite is not available
   - Limited functionality
   - Used primarily for user authentication when SQLite isn't available
   - Not recommended for production environments

## Installation and Requirements

### SQLite Installation

For optimal performance, install one of the following SQLite packages:

```bash
# Preferred implementation
npm install better-sqlite3 --save

# Alternative implementation
npm install sqlite3 --save
```

When SQLite is properly installed, TrafegoDNS will use it as the primary storage engine for all data.

### Fallback Mechanism

If SQLite is not available, TrafegoDNS will:

1. Display warning messages indicating limited functionality
2. Use JSON files for user authentication and token management
3. Continue to operate with reduced capabilities

## Data Storage Locations

All data is stored in the configuration directory, which is determined by:

1. The `CONFIG_DIR` environment variable
2. Default location: `/config`

### SQLite Database Files

- Main database: `$CONFIG_DIR/data/trafegodns.db`

### JSON Fallback Files

- Users: `$CONFIG_DIR/data/users.json`
- Revoked Tokens: `$CONFIG_DIR/data/revoked-tokens.json`
- DNS Tracking Records: `$CONFIG_DIR/data/dns-records.json`

## Migrating Between Storage Systems

TrafegoDNS automatically attempts to migrate data from JSON files to SQLite when:

1. SQLite becomes available after previously using JSON
2. The application starts with SQLite available and finds existing JSON data files

The migration is one-way (JSON → SQLite) and happens automatically when the application starts.

### DNS Record Tracking Migration

Starting with the latest version, DNS record tracking data is also migrated from the `dns-records.json` file to the SQLite database. This provides several advantages:

- Better performance for record lookups
- Improved data integrity through transactions
- Unified storage model with all other application data
- Support for more complex queries and reporting

The DNS tracker component will automatically attempt to use SQLite first and fall back to the JSON file only if necessary. Your existing data is automatically migrated on first startup with the new version.

## Best Practices

1. **Always install SQLite for production use**
   - The JSON fallback is intended for development or emergency situations only

2. **Backup your database regularly**
   - Use SQLite's backup capabilities or simply copy the database file

3. **Monitor database status**
   - Check logs for warnings about SQLite availability
   - Install SQLite if you see warnings about using JSON fallback

## Troubleshooting

If you encounter database-related issues:

1. Verify that SQLite is properly installed
2. Check permissions on the data directory
3. Review logs for specific error messages
4. Ensure the SQLite database file is not corrupted

## CLI Commands for Database Management

TrafegoDNS CLI includes commands for managing the database:

```bash
# Check database status
trafegodns db-status

# Backup the database
trafegodns db-backup

# Migrate from JSON to SQLite (if needed)
trafegodns db-migrate
```