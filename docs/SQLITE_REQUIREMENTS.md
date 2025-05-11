# SQLite Requirements for TrafegoDNS

TrafegoDNS requires SQLite to function properly. This document outlines the requirements and troubleshooting steps for SQLite database issues.

## Requirements

1. **SQLite Node.js Driver**  
   One of the following Node.js drivers must be installed:
   - `better-sqlite3` (preferred)
   - `sqlite3`

   Install using npm:
   ```bash
   npm install better-sqlite3 --save
   # OR
   npm install sqlite3 --save
   ```

2. **SQLite Command Line Tools**  
   For Docker installations, the SQLite command line tools are required for migrations and the CLI:
   - `sqlite3` command should be available in the path

   In the Docker container, this is installed by default. If you're running outside of Docker, you need to install it:
   ```bash
   # Debian/Ubuntu
   apt-get update && apt-get install -y sqlite3
   
   # Alpine
   apk add --no-cache sqlite
   
   # CentOS/RHEL
   yum install -y sqlite
   ```

## Database Location

The SQLite database is stored at:
```
${CONFIG_DIR}/data/trafegodns.db
```

Where `CONFIG_DIR` defaults to `/config` in the Docker container or can be set via the environment variable.

## Permissions

For proper operation, ensure the database file and directory have correct permissions:

1. The data directory should be writable by the user running TrafegoDNS
2. The database file should be both readable and writable
3. In Docker, the `abc` user (UID 1000) needs read/write access

Recommended permissions:
- Data directory: `755`
- Database file: `644`

Set permissions manually if needed:
```bash
# Set permissions for data directory
chmod 755 /config/data
chown -R 1000:1000 /config/data

# Set permissions for database file
chmod 644 /config/data/trafegodns.db
chown 1000:1000 /config/data/trafegodns.db
```

## Troubleshooting

If you encounter database issues, run the database check script:
```bash
./docker-s6/scripts/check-db.sh
```

Common issues and solutions:

1. **"SQLite database initialization failed" error**
   - Check if the SQLite Node.js driver is installed
   - Check database file permissions
   - Ensure data directory exists and is writable

2. **"Database file is not readable/writable" error**
   - Fix file permissions as outlined above
   - Check if the user running TrafegoDNS has access to the file

3. **"Failed to run migrations" error**
   - Ensure the sqlite3 command line tool is installed
   - Check if the database file is not corrupted (try backing up and starting fresh)

4. **Missing columns in tables**
   - Run the migration script manually:
     ```bash
     ./docker-s6/scripts/add-last-processed.sh
     ```

## Important Notes

1. TrafegoDNS **requires** SQLite. No JSON fallback is available.
2. If SQLite is not properly configured, the application will exit.
3. Database migrations are performed automatically during container startup.
4. When mounting volumes in Docker, ensure the data directory persists to keep your database.