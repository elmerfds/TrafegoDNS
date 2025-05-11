#!/bin/bash
# Script to debug SQLite issues

echo "====================================="
echo "TrafegoDNS SQLite Debug Script"
echo "====================================="

# Check if SQLite command-line utility is installed
echo "Checking for SQLite command-line utility:"
if command -v sqlite3 &> /dev/null; then
    SQLITE3_VERSION=$(sqlite3 --version)
    echo "✅ SQLite3 command-line utility is installed: $SQLITE3_VERSION"
else
    echo "❌ SQLite3 command-line utility is NOT installed"
fi

# Check for Node.js SQLite driver packages
echo -e "\nChecking for Node.js SQLite driver packages:"

# Check for better-sqlite3
if [ -d "/app/node_modules/better-sqlite3" ]; then
    BS3_VERSION=$(cat /app/node_modules/better-sqlite3/package.json | grep '"version"' | head -1)
    echo "✅ better-sqlite3 is installed: $BS3_VERSION"
else
    echo "❌ better-sqlite3 is NOT installed"
fi

# Check for sqlite3
if [ -d "/app/node_modules/sqlite3" ]; then
    S3_VERSION=$(cat /app/node_modules/sqlite3/package.json | grep '"version"' | head -1)
    echo "✅ sqlite3 is installed: $S3_VERSION"
else
    echo "❌ sqlite3 is NOT installed"
fi

# Test SQLite database access
echo -e "\nTesting SQLite database access:"
DB_FILE="/config/data/trafegodns.db"

if [ -f "$DB_FILE" ]; then
    echo "✅ SQLite database file exists at $DB_FILE"
    
    # Check file permissions
    PERMS=$(ls -la "$DB_FILE" | awk '{print $1 " " $3 ":" $4}')
    echo "📄 File permissions: $PERMS"
    
    # Check if database is readable
    if [ -r "$DB_FILE" ]; then
        echo "✅ Database file is readable"
    else
        echo "❌ Database file is NOT readable by current user"
    fi
    
    # Check if database is writable
    if [ -w "$DB_FILE" ]; then
        echo "✅ Database file is writable"
    else
        echo "❌ Database file is NOT writable by current user"
    fi
    
    # Try to query the database
    if command -v sqlite3 &> /dev/null; then
        echo -e "\nAttempting to query the database:"
        echo "- Tables in the database:"
        sqlite3 "$DB_FILE" ".tables" || echo "❌ Failed to query tables"
        
        echo "- Database schema:"
        sqlite3 "$DB_FILE" ".schema" || echo "❌ Failed to query schema"
    fi
else
    echo "❌ SQLite database file does NOT exist at $DB_FILE"
fi

# Check install issue
echo -e "\nAttempting to install SQLite packages:"
cd /app
echo "- Installing better-sqlite3..."
npm install better-sqlite3 --no-save

echo "====================================="
echo "Debug information collection complete"
echo "====================================="