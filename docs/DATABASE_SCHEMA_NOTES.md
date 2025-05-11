# Database Schema Notes

This document provides information about the TrafegoDNS database schema and important notes about schema changes and migrations.

## Schema Evolution

The TrafegoDNS database schema has evolved over time with newer versions adding additional columns to support new features. The application is designed to be backward compatible with older schema versions.

## DNS Records Table

The `dns_records` table is the primary table storing DNS record information. The schema includes:

### Core Fields (Present in All Versions)
- `id`: Integer primary key
- `record_id`: External record identifier
- `provider`: DNS provider name
- `type`: DNS record type (A, CNAME, etc.)
- `name`: DNS record name/hostname
- `content`: Record content/value
- `ttl`: Time to live
- `is_orphaned`: Flag for orphaned records
- `tracked_at`: When the record was first tracked

### Additional Fields in Newer Versions
- `last_processed`: When the record was last processed (added to track record freshness)
- `managed`: Flag indicating if the record is actively managed by TrafegoDNS
- `fingerprint`: Hash to detect content changes
- `orphaned_at`: When the record became orphaned

## Schema Migration

For existing installations, TrafegoDNS will automatically handle schema differences:

1. The CLI tools check for column existence before using them
2. On container startup, a schema migration script runs to add the `last_processed` column if missing
3. The core application components adapt to the available schema

## Manual Schema Updates

If you need to manually update your schema, you can run the migration script:

```bash
# Inside the TrafegoDNS container
/app/docker-s6/scripts/add-last-processed.sh
```

This script:
- Checks if the `last_processed` column exists
- Adds it if missing
- Initializes it with values from the `tracked_at` column

## Schema Compatibility

The application guarantees compatibility with all schema versions through:

1. Runtime schema detection
2. Adaptive SQL queries based on available columns
3. Default values for missing columns
4. Graceful fallbacks to alternative data sources

This ensures that TrafegoDNS continues to work during schema transitions and with databases created by different versions of the application.