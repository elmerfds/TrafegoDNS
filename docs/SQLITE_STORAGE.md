# SQLite Storage in TrafegoDNS

TrafegoDNS has transitioned to using SQLite exclusively for data storage. This document explains the change, benefits, and migration process.

## Storage Architecture

### Previous Architecture (Legacy)
TrafegoDNS originally used a dual-storage approach:
- JSON files for record storage
- SQLite for database capabilities (with JSON as fallback)

This approach had benefits during the transition period but created consistency issues when records were modified in one storage system but not the other.

### Current Architecture
TrafegoDNS now uses:
- SQLite as the exclusive storage solution
- One-time migration from JSON to SQLite if JSON files exist
- No fallbacks to JSON storage after migration

## Benefits of SQLite-Only Storage

1. **Data Integrity**: SQLite provides ACID transactions, ensuring database consistency
2. **Performance**: Faster queries and data operations, especially with large datasets
3. **Reduced Complexity**: Simplified codebase without dual-write logic
4. **Reliability**: No risk of data inconsistency between multiple storage formats
5. **Better Querying**: Full SQL capabilities for complex data operations
6. **Smaller Footprint**: More efficient storage compared to JSON files

## Migration Process

When TrafegoDNS starts:
1. The application initializes the SQLite database
2. If JSON files exist and haven't been migrated, it performs a one-time migration to SQLite
3. Once migrated, the application only uses SQLite for all operations
4. Original JSON files remain as backups but are not updated

## CLI Commands

All TrafegoDNS CLI commands now work exclusively with SQLite:

```bash
# List records
trafegodns records

# Search for records
trafegodns search 'type=CNAME'

# Process DNS records
trafegodns process

# Show database status
trafegodns status

# Delete a record
trafegodns delete 123

# Update a record
trafegodns update 15 content=192.168.1.10

# Mark a record as managed
trafegodns update 8 managed=1
```

## Schema Features

The SQLite database includes several important columns:

- `id`: Primary key for database operations
- `record_id`: External record identifier
- `provider`: DNS provider name
- `type`: DNS record type (A, CNAME, etc.)
- `name`: DNS record name/hostname
- `content`: Record content/value
- `ttl`: Time to live
- `is_orphaned`: Flag for orphaned records
- `tracked_at`: When the record was updated
- `last_processed`: When the record was last processed
- `managed`: Flag indicating if the record is actively managed by TrafegoDNS
- `orphaned_at`: When the record became orphaned
- `fingerprint`: Hash to detect content changes

## Requirements

SQLite is now a required dependency for TrafegoDNS. The application will:
- Check for SQLite during startup
- Exit with an error if SQLite is not available or cannot be initialized
- Provide clear error messages about required dependencies

The CLI tools also require the `sqlite3` command-line utility to function properly.