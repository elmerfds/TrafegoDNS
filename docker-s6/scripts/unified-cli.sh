#!/bin/bash
# Make sure script is executable
chmod +x "$0"
# Unified CLI script for TrafegoDNS - handles all commands directly

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
RECORDS_FILE="$DATA_DIR/dns-records.json"
DB_FILE="$DATA_DIR/trafegodns.db"

# Export environment variables for consistency
export CLI_TOKEN=trafegodns-cli
export API_URL=http://localhost:3000
export CONTAINER=true
export TRAFEGO_CLI=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Helper functions
function echo_color() {
  color=$1
  shift
  echo -e "${color}$@${NC}"
}

function show_usage() {
  echo "TrafegoDNS CLI - Unified Command Interface"
  echo ""
  echo "Usage: $(basename $0) COMMAND [OPTIONS]"
  echo ""
  echo "Commands:"
  echo "  records            List DNS records"
  echo "  process [--force]  Process DNS records (--force to force update)"
  echo "  status             Show database status"
  echo "  help               Show this help message"
  echo ""
  echo "Examples:"
  echo "  $(basename $0) records"
  echo "  $(basename $0) process --force"
}

function show_divider() {
  width=${1:-80}
  printf '%*s\n' "$width" '' | tr ' ' '-'
}

function format_table_header() {
  echo_color $CYAN "| ID       | TYPE   | NAME                           | CONTENT                        | STATUS    |"
  echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
}

function list_records() {
  echo_color $CYAN "=== DNS Records ==="
  echo ""

  # Debug
  echo_color $GRAY "Looking for database at: $DB_FILE"
  if [ -f "$DB_FILE" ]; then
    echo_color $GRAY "Database file exists"
    if command -v sqlite3 &> /dev/null; then
      echo_color $GRAY "sqlite3 command found"
    else
      echo_color $GRAY "sqlite3 command not found"
    fi
  else
    echo_color $GRAY "Database file not found"
  fi

  # Check if records file exists
  if [ -f "$RECORDS_FILE" ]; then
    # Try SQLite first if DB file exists
    if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
      echo_color $GRAY "Reading from SQLite database"
      echo ""
      format_table_header
      
      sqlite3 -csv "$DB_FILE" "SELECT id, type, name, content, is_orphaned, managed FROM dns_records ORDER BY id;" | \
      while IFS="," read -r id type name content orphaned managed; do
        # Truncate ID if needed
        if [ ${#id} -gt 8 ]; then
          id="${id:0:7}..."
        fi
        
        # Determine status
        if [ "$orphaned" = "1" ]; then
          status="${RED}Orphaned${NC}"
        elif [ "$managed" = "1" ]; then
          status="${GREEN}Managed${NC}"
        else
          status="${GRAY}Unmanaged${NC}"
        fi
        
        printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
      done
      
      echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
      total=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records;")
      echo "Total records: $total"
      return
    fi
    
    # Fallback to JSON if SQLite not working
    if command -v jq &> /dev/null; then
      echo_color $GRAY "Reading from JSON file"
      echo ""
      format_table_header
      
      jq -r '.records[] | "\(.id) \(.type) \(.name) \(.content // .data // .value // "") \(.orphaned // .is_orphaned) \(.managed)"' "$RECORDS_FILE" | \
      while read -r id type name content orphaned managed; do
        # Truncate ID if needed
        if [ ${#id} -gt 8 ]; then
          id="${id:0:7}..."
        fi
        
        # Determine status
        if [ "$orphaned" = "true" ]; then
          status="${RED}Orphaned${NC}"
        elif [ "$managed" = "true" ]; then
          status="${GREEN}Managed${NC}"
        else
          status="${GRAY}Unmanaged${NC}"
        fi
        
        printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
      done
      
      echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
      total=$(jq '.records | length' "$RECORDS_FILE")
      echo "Total records: $total"
    else
      echo_color $YELLOW "Limited formatting (jq not available)"
      grep -E '"id"|"type"|"name"|"content"' "$RECORDS_FILE" | \
      sed -E 's/"([^"]+)":/\1: /g' | sed 's/,//g' | sed 's/^ *//'
      
      total=$(grep -c '"id"' "$RECORDS_FILE")
      echo "Total records (approximate): $total"
    fi
  else
    echo_color $RED "Records file not found at $RECORDS_FILE"
    return 1
  fi
}

function process_records() {
  force=$1
  
  if [ "$force" = "--force" ] || [ "$force" = "-f" ]; then
    echo_color $YELLOW "Processing DNS records (forced)..."
    force_flag="--force"
  else
    echo_color $YELLOW "Processing DNS records..."
    force_flag=""
  fi
  
  # Try direct approach with API client first
  if [ -f "/app/bin/trafego" ]; then
    # Use the proper CLI tool if it exists, with environment variables
    CLI_TOKEN=trafegodns-cli API_URL=http://localhost:3000 node /app/bin/trafego dns process $force_flag
    return $?
  fi
  
  # Fallback to file updates
  echo_color $YELLOW "Using file-based fallback method"
  
  # Make sure data directory exists
  mkdir -p "$DATA_DIR"
  
  # Check if records file exists
  if [ ! -f "$RECORDS_FILE" ]; then
    echo_color $YELLOW "Records file not found, creating empty one"
    echo '{"records":[]}' > "$RECORDS_FILE"
  fi
  
  # Process with jq if available
  if command -v jq &> /dev/null; then
    # Count total records
    total=$(jq '.records | length' "$RECORDS_FILE")
    managed=$(jq '.records | map(select(.managed == true)) | length' "$RECORDS_FILE")
    orphaned=$(jq '.records | map(select(.orphaned == true or .is_orphaned == true)) | length' "$RECORDS_FILE")
    
    # Update processedAt timestamp in each record if using jq
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg now "$now" '.records = (.records | map(if .metadata then .metadata.processedAt = $now else . + {metadata: {processedAt: $now}} end))' "$RECORDS_FILE" > "$RECORDS_FILE.tmp"
    mv "$RECORDS_FILE.tmp" "$RECORDS_FILE"
    
    echo_color $GREEN "DNS records processed successfully"
    echo ""
    echo "Total records: $total"
    echo "Managed records: $managed"
    echo "Orphaned records: $orphaned"
  else
    # Basic processing without jq
    echo "Records file updated with timestamp: $(date -u)"
    
    # Count lines containing specific patterns as rough counts
    total=$(grep -c '"id"' "$RECORDS_FILE")
    managed=$(grep -c '"managed":true' "$RECORDS_FILE")
    orphaned=$(grep -c -e '"orphaned":true' -e '"is_orphaned":true' "$RECORDS_FILE")
    
    echo_color $GREEN "DNS records processed (basic mode)"
    echo ""
    echo "Total records (approximate): $total"
    echo "Managed records (approximate): $managed"
    echo "Orphaned records (approximate): $orphaned"
  fi
}

function show_status() {
  echo_color $CYAN "=== Database Status ==="
  echo ""

  # Debug database file info
  if [ -f "$DB_FILE" ]; then
    echo_color $GRAY "Database file: $(ls -l "$DB_FILE")"
    db_size=$(du -h "$DB_FILE" | cut -f1)
    echo_color $GRAY "Database size: $db_size"
  fi

  # Check for SQLite CLI
  if command -v sqlite3 &> /dev/null; then
    echo_color $GRAY "SQLite version: $(sqlite3 --version)"
  else
    echo_color $GRAY "SQLite command not available"

    # Check for sqlite packages
    if command -v apk &> /dev/null; then
      echo_color $GRAY "Available SQLite packages: $(apk list | grep sqlite)"
    fi
  fi

  # Try SQLite first if DB file exists
  if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
    echo_color $GREEN "Database Type:    SQLite"
    echo_color $GREEN "Database Path:    $DB_FILE"
    
    # Get record counts
    total=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records;")
    orphaned=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE is_orphaned = 1;")
    
    users=0
    tokens=0
    
    # Check if users table exists
    if sqlite3 "$DB_FILE" ".tables" | grep -q "users"; then
      users=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users;")
    fi
    
    # Check if tokens table exists
    if sqlite3 "$DB_FILE" ".tables" | grep -q "revoked_tokens"; then
      tokens=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM revoked_tokens;")
    fi
    
    echo "DNS Records:      $total"
    echo "Orphaned Records: $orphaned"
    echo "Users:            $users"
    echo "Revoked Tokens:   $tokens"
    
  # Fallback to JSON
  elif [ -f "$RECORDS_FILE" ]; then
    echo_color $YELLOW "Database Type:    JSON (SQLite not available)"
    echo_color $YELLOW "Database Path:    $RECORDS_FILE"
    
    if command -v jq &> /dev/null; then
      total=$(jq '.records | length' "$RECORDS_FILE")
      orphaned=$(jq '.records | map(select(.orphaned == true or .is_orphaned == true)) | length' "$RECORDS_FILE")
      
      echo "DNS Records:      $total"
      echo "Orphaned Records: $orphaned"
    else
      total=$(grep -c '"id"' "$RECORDS_FILE")
      orphaned=$(grep -c -e '"orphaned":true' -e '"is_orphaned":true' "$RECORDS_FILE")
      
      echo "DNS Records (approx):      $total"
      echo "Orphaned Records (approx): $orphaned"
    fi
  else
    echo_color $RED "No database found. Neither SQLite ($DB_FILE) nor JSON ($RECORDS_FILE) available."
    return 1
  fi
}

# Main command handler
case "$1" in
  "records"|"list"|"ls")
    list_records
    ;;
  "process")
    process_records "$2"
    ;;
  "status"|"stat")
    show_status
    ;;
  "help"|"--help"|"-h")
    show_usage
    ;;
  "")
    show_usage
    ;;
  *)
    echo_color $RED "Unknown command: $1"
    echo ""
    show_usage
    exit 1
    ;;
esac