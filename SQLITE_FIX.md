# TrafegoDNS SQLite Fix

This document outlines the changes made to fix SQLite database issues in TrafegoDNS.

## Overview of Changes

1. **Fixed Database Initialization Process**:
   - Made database initialization more robust with better error handling
   - Added proper detection of database file permissions
   - Added automatic permission fixing when needed
   - Improved database connection management

2. **Fixed User Model**:
   - Updated User.js to gracefully handle the absence of SQLite
   - Implemented JSON fallback only when absolutely necessary
   - Fixed initialization and repository reference issues
   - Added more comprehensive error handling

3. **Fixed Transaction Management**:
   - Resolved nested transaction errors (`cannot start a transaction within a transaction`)
   - Added proper transaction state tracking
   - Fixed migration process to avoid transaction conflicts
   - Improved error handling for transaction operations

4. **Added Diagnostic and Fix Scripts**:
   - `debug-sqlite.sh`: Detects SQLite issues and displays detailed information
   - `fix-sqlite.sh`: Fixes common SQLite issues by reinstalling packages and applying fixes
   - `fix-sqlite-records.js` and `fix-sqlite-records.sh`: Clean up invalid records in the database
   - `manage-json-files.sh`: Better management of JSON files during migration

5. **Added CLI Commands for Database Management**:
   - `dbstatus`: Shows database status and statistics
   - `checkinvalid`: Checks for invalid SQLite records (UNKNOWN types, etc.)
   - `fixinvalid`: Fixes invalid SQLite records by removing them

## Core Issues Fixed

1. **Missing SQLite Package**:
   - Fixed by adding script to install the required SQLite Node.js driver
   - Added fallback from better-sqlite3 to sqlite3 if needed

2. **Permissions Issues**:
   - Fixed file permissions for the database file and data directory
   - Added code to ensure proper permissions on startup

3. **Initialization Errors**:
   - Fixed circular dependencies in initialization process
   - Added proper handling of database initialization failures
   - Ensured repositories are properly created and accessible
   - Fixed nested transaction errors during initialization

4. **JSON File Management**:
   - Improved the migration process from JSON to SQLite
   - Better handling of existing JSON files with backups
   - Added marker files to track migration status
   - Improved validation when importing records from JSON

5. **Transaction Management**:
   - Fixed issues where nested transactions were being attempted
   - Added transaction state tracking to prevent nested transactions
   - Improved logging for transaction operations
   - Enhanced error handling for transaction failures

6. **Invalid Records**:
   - Added validation for record types and names during migration
   - Created tools to identify and clean up invalid records
   - Prevent migration of invalid records (UNKNOWN types, empty content)

## How to Apply the Fix

1. **Run the Fix Script**:
   ```bash
   chmod +x /app/docker-s6/scripts/fix-sqlite.sh
   /app/docker-s6/scripts/fix-sqlite.sh
   ```

2. **Clean Up Invalid Records** (if needed):
   ```bash
   # Inside a container:
   /app/docker-s6/scripts/fix-sqlite-records.sh

   # Outside a container:
   node scripts/fix-sqlite-records.js
   ```

3. **Restart TrafegoDNS**:
   The application should now start successfully and properly use the SQLite database.

4. **Verify the Fix**:
   ```bash
   # Using bash script:
   /app/docker-s6/scripts/debug-sqlite.sh

   # Using CLI:
   dbstatus
   checkinvalid
   ```

## Manual Fix Options

If the fix script doesn't work, you can try these manual steps:

1. **Install SQLite Packages**:
   ```bash
   cd /app
   npm install better-sqlite3 --save
   # OR
   npm install sqlite3 --save
   ```

2. **Fix Permissions**:
   ```bash
   chmod 755 /config/data
   chmod 644 /config/data/trafegodns.db
   chown -R abc:abc /config/data
   ```

3. **Replace Problem Files**:
   ```bash
   cp /app/src/api/v1/models/User.js.fix /app/src/api/v1/models/User.js
   cp /app/src/database/index.js.fix /app/src/database/index.js
   ```

4. **Use the CLI to Fix Invalid Records**:
   ```bash
   # Check for invalid records
   checkinvalid

   # Fix invalid records
   fixinvalid
   ```

## Fallback Strategy

If SQLite continues to be problematic, the fixed code includes a fallback strategy that will:

1. Use JSON storage for user authentication when SQLite is not available
2. Log clear warnings about the limited functionality
3. Continue to function with core features rather than crashing

This ensures the application can still operate even if SQLite installation issues persist.

## Database Issues Fixed

Two key SQLite issues were fixed in this update:

### 1. Nested Transaction Errors

The error `SQLITE_ERROR: cannot start a transaction within a transaction` occurs when the code attempts to start a new transaction while already inside a transaction. Multiple parts of the application were trying to initialize the database simultaneously, causing these nested transaction attempts.

The fix involves:

1. Tracking the transaction state with the `inTransaction` flag
2. Skipping `beginTransaction` calls when already in a transaction
3. Passing transaction state to nested function calls
4. Adding proper error handling for transaction operations
5. Implementing an OS-level file locking mechanism to prevent concurrent migrations
6. Adding special handling for transaction-related errors
7. Ensuring `createTables` methods respect existing transaction state
8. Using process IDs (PIDs) to track lock ownership across processes

Implementation details:
- Added `inTransaction` flag to track transaction state
- Modified `beginTransaction`, `commit`, and `rollback` methods to check and update transaction state
- Added transaction state awareness to `createTables` and `runMigrations` methods
- Implemented proper error handling for transaction errors
- Created a dedicated LockManager module with PID-based locking for cross-process coordination
- Added robust locking with timeouts and lock ownership verification

### 2. Database Lock Contention

The error `SQLITE_BUSY: database is locked` occurs when multiple parts of the application try to access the database simultaneously, and one operation has locked the database while another tries to access it.

The fix involves:

1. Adding automatic retries for database operations when locks are encountered
2. Implementing backoff strategies with delays between retries
3. Gracefully handling "database is locked" errors
4. Improving transaction management with proper retry logic
5. Adding specific logging for lock-related retries
6. Breaking up large transactions into smaller parts with individual retry capabilities
7. Using WAL journal mode for better concurrency

Implementation details:
- Added retry logic to all database operation methods (`run`, `get`, `all`)
- Added exponential backoff with configurable retry counts
- Enhanced `createTables` method with retry capabilities for each table creation
- Added specific error handling for "database is locked" errors
- Created helper function `execWithRetry` to handle retries for SQL operations
- Added specific database lock detection in error messages
- Set WAL journal mode for better concurrency between readers and writers
- Created robust LockManager with PID-based coordination between processes
- Added app-level coordination to avoid concurrent database initialization
- Implemented "read-only mode" when lock acquisition fails to allow application to continue

These fixes make the database operations more robust and resilient to concurrency issues, which is especially important during initialization when multiple components may be trying to access the database at the same time. The application now gracefully handles transaction and lock errors with appropriate retries, making it more reliable in multi-process environments.