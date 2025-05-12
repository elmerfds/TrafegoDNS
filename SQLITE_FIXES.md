# SQLite Transaction Issues - Fixes Summary

This document explains ongoing work to solve SQLite transaction issues in TrafegoDNS.

## Current Status

Despite our fixes, we're still seeing some nested transaction errors. The logs show:

1. Errors: "SQLITE_ERROR: cannot start a transaction within a transaction"
2. Errors: "SQLITE_ERROR: cannot rollback - no transaction is active" 
3. Errors: "SQLITE_BUSY: database is locked"

However, the application is eventually succeeding in initialization after multiple retries.

## Recommended Fixes

The most reliable fix for these issues is to reset the database when transaction problems occur. This is especially helpful for fresh installations.

1. **Use the reset script for new installations**:
   ```bash
   /app/docker-s6/scripts/reset-sqlite.sh
   ```
   This will delete any problematic database and let the application create a fresh one.

2. **Break each migration step into its own transaction**:
   Instead of having one large transaction for all migrations, each step should have its own independent transaction.

3. **Add a global lock mechanism**:
   Implement a class-level static migration flag to prevent multiple instances from running migrations concurrently.

## Technical Implementation

The technical implementation should focus on:

1. Better transaction state checking using `PRAGMA transaction_status`
2. More aggressive rollback attempts when errors occur
3. Split larger transactions into smaller independent ones
4. Use IMMEDIATE transactions for better locking
5. Add timeouts and recovery mechanisms

## Workaround for Users

If users experience persistent database issues, they can:

1. Run the reset script to start fresh
2. Delete the database file manually and restart
3. Use JSON-only mode with environment variables (temporary solution)

## Future Work

Future improvements should include:

1. Better SQLite connection pooling
2. More robust locking mechanisms
3. Event-based initialization sequencing
4. More reliable transaction status tracking
