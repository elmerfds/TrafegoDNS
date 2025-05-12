#!/bin/bash
# Script to fix invalid SQLite records

echo "====================================="
echo "TrafegoDNS SQLite Record Cleaner"
echo "====================================="

# Set directory paths
APP_DIR="/app"
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
  echo "❌ Database file does not exist at $DB_FILE"
  echo "No action taken."
  exit 1
fi

# Parse arguments
DRY_RUN=false
VERBOSE=false
FORCE=false

for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      ;;
    --verbose)
      VERBOSE=true
      ;;
    --force)
      FORCE=true
      ;;
    -h|--help)
      echo "Usage: $0 [--dry-run] [--verbose] [--force]"
      echo "  --dry-run   Show what would be done without making changes"
      echo "  --verbose   Show detailed output"
      echo "  --force     Skip confirmation prompt"
      echo "  --help      Show this help message"
      exit 0
      ;;
  esac
done

# Build arguments string for the Node.js script
ARGS=""
if [ "$DRY_RUN" = true ]; then
  ARGS="$ARGS --dry-run"
  echo "Running in DRY RUN mode (no changes will be made)"
fi

if [ "$VERBOSE" = true ]; then
  ARGS="$ARGS --verbose"
  echo "Verbose mode enabled"
fi

if [ "$FORCE" = true ]; then
  ARGS="$ARGS --force"
  echo "Force mode enabled (will not prompt for confirmation)"
fi

echo "Database file: $DB_FILE"
echo ""

# Run the Node.js script
cd "$APP_DIR"
exec node "$APP_DIR/scripts/fix-sqlite-records.js" $ARGS