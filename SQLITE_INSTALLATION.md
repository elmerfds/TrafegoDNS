# SQLite Installation and Troubleshooting

## Overview

TrafegoDNS uses SQLite as its primary database storage. This document explains how the SQLite integration works and how to troubleshoot common issues.

## Requirements

For SQLite to work properly, the application requires:

1. The `better-sqlite3` Node.js package
2. SQLite system libraries (`sqlite` and `sqlite-dev` in Alpine Linux)
3. Python with setuptools (for building native modules)
4. C/C++ compilation tools (make, g++)
5. Proper database directory permissions

## Common Issues

### Common Errors

#### Missing Package Error

If you see this error in the logs, it means the `better-sqlite3` package is not installed:

```
Could not import better-sqlite3: Cannot find package 'better-sqlite3' imported from /app/src/database/sqlite-core.js
```

This occurs when:
- The package was not installed during the container build
- The package is listed as an optional dependency but was not installed

#### Native Module Build Failure

If you see errors related to node-gyp or Python's distutils module:

```
ModuleNotFoundError: No module named 'distutils'
```

This means the build environment lacks the necessary tools to compile the native SQLite module. Ensure you have:
- Python 3 with pip installed
- Python setuptools (py3-setuptools in Alpine Linux)
- C/C++ build tools (make, g++, etc.)
- SQLite development libraries (sqlite-dev in Alpine Linux)

### Restart Loop

If TrafegoDNS is stuck in a restart loop with SQLite errors, the issue is likely related to one of the following:

1. Missing `better-sqlite3` package
2. Database directory permission issues
3. Corrupted database file

## Fixed Implementation

The latest Docker image includes these improvements:

1. `better-sqlite3` is now a required dependency in `package.json`
2. The Dockerfile explicitly installs `better-sqlite3` during the build
3. The container initialization script runs a SQLite fix script to ensure proper setup

## Manual Fix for Existing Installations

If you're experiencing SQLite issues with an existing installation:

1. Run the fix script inside the container:
   ```bash
   docker exec -it trafegodns /app/docker-s6/scripts/fix-sqlite.sh
   ```

2. Restart the container after the fix:
   ```bash
   docker restart trafegodns
   ```

## Database Directory Permissions

TrafegoDNS stores its SQLite database at `/config/data/trafegodns.db`. Ensure this directory:

1. Is mounted as a persistent volume
2. Has the proper ownership (uid 1001, gid 1001 for the `abc` user)
3. Has write permissions (755 for directory, 644 for database file)

## Complete Reset

If your database is corrupted or you want to start fresh:

1. Run the reset script:
   ```bash
   docker exec -it trafegodns /app/docker-s6/scripts/reset-sqlite.sh
   ```

   **Warning**: This will delete all database records!

2. Restart the container:
   ```bash
   docker restart trafegodns
   ```

## Built-in Database Maintenance

The application now includes automatic database maintenance features:

1. Automatic WAL journal mode configuration
2. Transaction handling improvements
3. File-based locking to prevent concurrent access issues
4. Automatic stale lock detection and cleanup