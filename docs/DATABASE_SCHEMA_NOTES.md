# Database Schema Notes

This document provides information about the TrafegoDNS database schema and important notes about schema changes and migrations.

## Schema Evolution

The TrafegoDNS database schema has evolved over time with newer versions adding additional columns and tables to support new features. The application is designed to be backward compatible with older schema versions.

## DNS Records Tables

TrafegoDNS uses two primary tables to store DNS record information:

### 1. DNS Records Table (`dns_records`)

The table storing DNS records managed by the application. The schema includes:

#### Core Fields (Present in All Versions)
- `id`: Integer primary key
- `record_id`: External record identifier
- `provider`: DNS provider name
- `type`: DNS record type (A, CNAME, etc.)
- `name`: DNS record name/hostname
- `content`: Record content/value
- `ttl`: Time to live
- `is_orphaned`: Flag for orphaned records
- `tracked_at`: When the record was first tracked

#### Additional Fields in Newer Versions
- `last_processed`: When the record was last processed (added to track record freshness)
- `managed`: Flag indicating if the record is actively managed by TrafegoDNS
- `fingerprint`: Hash to detect content changes
- `orphaned_at`: When the record became orphaned

### 2. DNS Tracked Records Table (`dns_tracked_records`)

This new table, introduced in the latest version, stores tracking information for DNS records to replace the old JSON file storage. The schema includes:

- `id`: Integer primary key
- `provider`: DNS provider name
- `record_id`: External record identifier
- `type`: DNS record type (A, CNAME, etc.)
- `name`: DNS record name/hostname
- `content`: Record content/value
- `ttl`: Time to live
- `proxied`: Flag for Cloudflare proxied records
- `is_orphaned`: Flag for orphaned records (0/1)
- `orphaned_at`: Timestamp when record was marked orphaned
- `tracked_at`: Timestamp when record was first tracked
- `updated_at`: Timestamp when record was last updated
- `metadata`: JSON field for additional record metadata

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