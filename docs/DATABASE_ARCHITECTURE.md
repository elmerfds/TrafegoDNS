# TrafegoDNS Database Architecture

This document explains the database architecture of TrafegoDNS, specifically focusing on how DNS records are stored and managed.

## Dual-Table Architecture

TrafegoDNS uses a dual-table approach for DNS record management:

### 1. Provider Cache (`dns_records` table)

This table serves as a cache of ALL records from the DNS provider, regardless of whether they are managed by TrafegoDNS.

**Purpose:**
- Provides a local cache of the current state of the DNS provider
- Minimizes API calls to the provider by caching results
- Enables comparison between what exists on the provider and what the app manages
- Supports TTL-based refreshing to balance freshness with performance

**Key Characteristics:**
- Refreshed periodically based on cache TTL
- Completely replaced during refresh (not incrementally updated)
- Contains ALL records from the provider
- Includes last_refreshed timestamp for cache management

### 2. Managed Records (`dns_tracked_records` table)

This table tracks only the records that TrafegoDNS has created or is managing.

**Purpose:**
- Maintains a record of which DNS records TrafegoDNS is responsible for
- Tracks metadata like whether records are app-managed or orphaned
- Provides a consistent view of app-managed records even when provider cache is stale
- Stores historical information about records (like when they were first seen)

**Key Characteristics:**
- Records are only added/removed when explicitly tracked/untracked
- Contains rich metadata about each record
- May include records that no longer exist on the provider (orphaned)
- Supports tracking whether records were created by the app or just being tracked

## Repository Pattern

The architecture uses a clean repository pattern for data access:

1. **ProviderCacheRepository**: Handles all operations on the provider cache (dns_records)
2. **ManagedRecordsRepository**: Handles all operations on the managed records (dns_tracked_records)
3. **DNSRepositoryManager**: Coordinates between the two repositories and provides a unified interface

## Synchronization

The dual-table approach requires careful synchronization:

1. **Provider Cache Refresh**:
   - Fetches all records from the DNS provider
   - Clears and repopulates the dns_records table
   - Runs based on cache TTL (configurable)
   - Triggered by manual refresh or automatic schedules

2. **Orphaned Record Detection**:
   - Compares managed records against provider cache
   - Marks records as orphaned when they exist in managed records but not in provider cache
   - Unmarks orphaned status when records reappear in provider cache

3. **Initial Startup Synchronization**:
   - During app startup, both tables are synchronized
   - Pre-existing records are marked as not app-managed for safety
   - Ensures consistent state between app restart

## Data Model

### Provider Cache (`dns_records`)

| Field           | Type      | Description                                  |
|-----------------|-----------|----------------------------------------------|
| id              | INTEGER   | Primary key                                  |
| provider        | TEXT      | DNS provider name (cloudflare, etc.)         |
| record_id       | TEXT      | ID from the provider                         |
| type            | TEXT      | Record type (A, CNAME, etc.)                 |
| name            | TEXT      | Record name (hostname)                       |
| content         | TEXT      | Record content (IP, domain, etc.)            |
| ttl             | INTEGER   | Time to live                                 |
| proxied         | INTEGER   | Whether the record is proxied (boolean)      |
| is_orphaned     | INTEGER   | Whether the record is orphaned (boolean)     |
| orphaned_at     | TEXT      | When the record was marked orphaned          |
| tracked_at      | TEXT      | When the record was first tracked            |
| updated_at      | TEXT      | When the record was last updated             |
| fingerprint     | TEXT      | Unique hash of record properties for change detection |
| last_refreshed  | TEXT      | When the record was last refreshed from provider |

### Managed Records (`dns_tracked_records`)

| Field           | Type      | Description                                  |
|-----------------|-----------|----------------------------------------------|
| id              | INTEGER   | Primary key                                  |
| provider        | TEXT      | DNS provider name (cloudflare, etc.)         |
| record_id       | TEXT      | ID from the provider                         |
| type            | TEXT      | Record type (A, CNAME, etc.)                 |
| name            | TEXT      | Record name (hostname)                       |
| content         | TEXT      | Record content (IP, domain, etc.)            |
| ttl             | INTEGER   | Time to live                                 |
| proxied         | INTEGER   | Whether the record is proxied (boolean)      |
| is_orphaned     | INTEGER   | Whether the record is orphaned (boolean)     |
| orphaned_at     | TEXT      | When the record was marked orphaned          |
| tracked_at      | TEXT      | When the record was first tracked            |
| updated_at      | TEXT      | When the record was last updated             |
| first_seen      | TEXT      | When the record was first seen               |
| metadata        | TEXT      | JSON metadata about the record               |

## Working with the Architecture

### Retrieving Records

When retrieving DNS records, the system follows these priorities:

1. For app-managed records: Query the `dns_tracked_records` table
2. For all provider records: Query the `dns_records` table
3. If provider cache is empty or stale: Refresh from provider API

### Adding New Records

When adding new DNS records:

1. Create record through DNS provider API
2. Add successful records to both:
   - `dns_tracked_records` with app-managed=true
   - Update `dns_records` during next cache refresh

### Updating Records

When updating DNS records:

1. Update through DNS provider API
2. Update record in `dns_tracked_records`
3. Update `dns_records` during next cache refresh

### Orphaned Record Management

When containers/hostnames are removed:

1. Detect records no longer associated with any hostname
2. Mark these records as orphaned in `dns_tracked_records`
3. After grace period, delete from provider and untrack

## Best Practices

1. **Always use the repository manager** for interacting with DNS records
2. **Respect cache TTL** to prevent excessive API calls
3. **Maintain record metadata** to track app-managed status
4. **Use transactions** when updating multiple records
5. **Add appropriate indexes** for query performance

## Future Improvements

Potential improvements to the architecture:

1. **Event-driven sync**: Use events to trigger targeted cache updates
2. **Partial cache refresh**: Update only changed records
3. **Conflict resolution**: Better handling of records modified outside the app
4. **Query optimization**: Additional indexes and query strategies
5. **Schema versioning**: Support for schema migrations across versions