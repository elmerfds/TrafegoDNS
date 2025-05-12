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

## Transaction Issues Explained

One of the key issues fixed in this update is related to nested transactions in SQLite. The error `SQLITE_ERROR: cannot start a transaction within a transaction` occurs when the code attempts to start a new transaction while already inside a transaction.

The fix involves:

1. Tracking the transaction state with the `inTransaction` flag
2. Skipping `beginTransaction` calls when already in a transaction
3. Passing transaction state to nested function calls
4. Adding proper error handling for transaction operations

This prevents the database initialization errors and makes the migration process more robust.