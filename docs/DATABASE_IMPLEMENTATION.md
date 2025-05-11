# SQLite Database Implementation Plan

This document outlines the plan for integrating SQLite into TrafegoDNS while ensuring a seamless transition for existing users and maintaining compatibility with current architecture.

## Implementation Goals

1. **Zero-config migration** - Existing users shouldn't need to do anything
2. **Performance improvement** - Faster data operations, especially at scale
3. **Data integrity** - Improved reliability through ACID transactions
4. **Architecture consistency** - Work within existing state management
5. **Backward compatibility** - Fallback to JSON if needed

## Architecture Overview

The SQLite implementation will fit into the existing architecture as follows:

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  Controllers │────▶│ ActionBroker │────▶│  StateStore    │
└─────────────┘     └──────┬───────┘     └────────┬───────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐      ┌───────────────┐
                    │  Repository  │◀─────▶│ Event Emitter │
                    └──────┬───────┘      └───────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ SQLite / JSON│
                    └──────────────┘
```

- **Controllers**: Remain unchanged, using ActionBroker
- **ActionBroker**: Updated to use repositories for persistence
- **Repository Layer**: New abstraction for data access
- **SQLite/JSON**: Dual-implementation with automatic selection

## Data Models

We'll implement the following database tables:

1. **dns_records** - Tracks DNS records
   - id, record_id, provider, type, name, content, ttl, proxied, tracked_at, last_processed, is_orphaned, orphaned_at, fingerprint, managed

2. **dns_tracked_records** - Tracks record creation/deletion status
   - id, provider, record_id, type, name, content, ttl, proxied, is_orphaned, orphaned_at, tracked_at, updated_at, metadata

3. **users** - User accounts
   - id, username, password_hash, role, created_at, updated_at, last_login

4. **revoked_tokens** - JWT token blacklist
   - id, token_hash, revoked_at, expires_at

5. **settings** - Application configuration
   - key, value, updated_at

6. **audit_logs** - Track state changes
   - id, action, path, old_value, new_value, user_id, source, timestamp

## Implementation Steps

### 1. Database Infrastructure

1. Add SQLite dependencies to package.json
2. Create database connection manager
3. Implement schema migrations
4. Create repositories for each data type

### DNS Record Tracking Implementation

The DNS record tracking implementation uses the following components:

1. **DatabaseRepository**: Handles database operations for DNS tracked records
   - Creates and manages the `dns_tracked_records` table
   - Provides CRUD operations for tracked records
   - Handles migration from JSON to SQLite

2. **SQLiteRecordManager**: Bridge between RecordTracker and database
   - Provides a clean interface for record tracking operations
   - Handles SQLite database interaction
   - Implements fallback logic for when SQLite is unavailable

3. **RecordTracker**: Main component for DNS record tracking
   - First attempts to use SQLite for all operations
   - Falls back to JSON file storage if SQLite not available
   - Provides backward compatibility with existing code

### 2. Migration Strategy

1. Add automatic migration of existing JSON data:
   - Check if database exists
   - If not, look for JSON files
   - Import JSON data into SQLite tables
   - Validate migration success

2. Implement fallback logic:
   - Try SQLite first
   - If SQLite fails, fall back to JSON mode
   - Log appropriate warnings

### 3. Repository Layer

Implement repository pattern with:
- Base repository with standard CRUD operations
- Specific repositories for each data type
- Both SQLite and JSON implementations
- Automatic selection of implementation based on availability

### 4. Integration with State Management

1. Update ActionBroker to use repositories for persistence
2. Maintain in-memory StateStore as primary interface
3. Use transactions for related changes
4. Add periodic sync between StateStore and database

### 5. Performance Optimizations

1. Configure SQLite for optimal performance:
   - WAL journal mode
   - Appropriate cache size
   - Prepared statements
   - Connection pooling

2. Add indexes for common query patterns:
   - DNS record lookups by name
   - User lookups by username
   - Orphaned record filtering

## Migration Process for Existing Installations

The migration will be automatic and transparent:

1. On first startup with SQLite support:
   - Look for existing JSON files in /config/data/
   - Create SQLite database if not exists
   - Import data from JSON files
   - Verify data integrity after import
   - Keep JSON files as backup

2. During normal operation:
   - Use SQLite for all operations
   - If SQLite errors occur, fall back to JSON
   - Log database errors for troubleshooting

3. Dual-write during transition period:
   - Write to both SQLite and JSON for first few versions
   - Gradually phase out JSON writes in future releases

## Error Handling and Fallbacks

1. **Database connection failures**:
   - Log detailed error
   - Fall back to JSON storage
   - Retry connection periodically

2. **Migration failures**:
   - Log specific error
   - Keep original JSON files intact
   - Fall back to JSON mode

3. **Data integrity issues**:
   - Implement validation before writes
   - Add database consistency checks
   - Provide repair utilities

## Testing Strategy

1. Unit tests for repositories
2. Migration tests with sample JSON data
3. Stress tests for concurrent operations
4. Performance benchmarks
5. Failure scenario testing

## Rollout Plan

1. Implement in development branch
2. Extensive testing in controlled environments
3. Release as opt-in feature for early adopters
4. Make default in future release with JSON fallback
5. Eventually remove JSON persistence in distant future

## Compatibility Considerations

- Ensure SQLite works in all supported environments:
  - Docker container
  - Direct node installation
  - ARM platforms (Raspberry Pi)
  - Windows environments

## Documentation Updates

- Add database section to ARCHITECTURE.md
- Document recovery procedures
- Add database configuration options
- Update troubleshooting guide