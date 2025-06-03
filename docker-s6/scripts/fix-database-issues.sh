#!/bin/bash
# Fix database issues - add missing theme_preference column

echo "🔧 Fixing database issues..."

# Function to check if sqlite3 is available
check_sqlite() {
    if ! command -v sqlite3 &> /dev/null; then
        echo "❌ sqlite3 command not found. Installing..."
        apk add --no-cache sqlite
    fi
}

# Function to add theme_preference column
fix_theme_preference() {
    local db_path="${DATABASE_PATH:-/config/db/trafegodns.db}"
    
    echo "📋 Checking database at: $db_path"
    
    if [ ! -f "$db_path" ]; then
        echo "❌ Database file not found at $db_path"
        return 1
    fi
    
    # Check if column exists
    if sqlite3 "$db_path" "PRAGMA table_info(users);" | grep -q "theme_preference"; then
        echo "✅ theme_preference column already exists"
    else
        echo "➕ Adding theme_preference column..."
        sqlite3 "$db_path" "ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT 'teal';" || {
            echo "❌ Failed to add theme_preference column"
            return 1
        }
        echo "✅ Successfully added theme_preference column"
    fi
    
    # Show current table structure
    echo ""
    echo "📊 Current users table structure:"
    sqlite3 "$db_path" ".schema users"
}

# Main execution
check_sqlite
fix_theme_preference

echo ""
echo "✅ Database fixes complete!"
echo ""
echo "📌 Note: The crypto encryption issue has been fixed in the code."
echo "   You'll need to rebuild the Docker image or wait for the next release."