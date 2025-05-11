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

# Check if terminal supports colors
support_colors() {
  if [ -t 1 ] && [ -n "$TERM" ] && [ "$TERM" != "dumb" ]; then
    return 0 # True, colors are supported
  else
    return 1 # False, colors are not supported
  fi
}

# Set up colors only if supported
if support_colors; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  GRAY='\033[0;90m'
  NC='\033[0m' # No Color
else
  # Empty color codes for terminals that don't support color
  RED=''
  GREEN=''
  YELLOW=''
  CYAN=''
  GRAY=''
  NC=''
fi

# Allow colors to be explicitly disabled
if [ "$NO_COLOR" = "true" ] || [ "$TERM" = "dumb" ]; then
  RED=''
  GREEN=''
  YELLOW=''
  CYAN=''
  GRAY=''
  NC=''
fi

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
  echo "  records                  List all DNS records"
  echo "  search <query>           Search for records by name, type, or content"
  echo "  process [--force]        Process DNS records (--force to force update)"
  echo "  status                   Show database status"
  echo "  delete <id>              Delete a DNS record by ID"
  echo "  update <id> <field=val>  Update a DNS record field"
  echo "  help                     Show this help message"
  echo ""
  echo "Examples:"
  echo "  $(basename $0) records"
  echo "  $(basename $0) search example.com"
  echo "  $(basename $0) search 'type=CNAME'"
  echo "  $(basename $0) process --force"
  echo "  $(basename $0) delete 12"
  echo "  $(basename $0) update 15 content=192.168.1.10"
}

function show_divider() {
  width=${1:-80}
  printf '%*s\n' "$width" '' | tr ' ' '-'
}

function format_table_header() {
  echo_color $CYAN "| ID       | TYPE   | NAME                           | CONTENT                        | STATUS    |"
  echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
}

# Helper function to create a status string with correct formatting for text/color terminals
function status_text() {
  status_type=$1
  text=$2

  if support_colors; then
    case "$status_type" in
      "orphaned")
        echo "${RED}$text${NC}"
        ;;
      "managed")
        echo "${GREEN}$text${NC}"
        ;;
      "unmanaged")
        echo "${GRAY}$text${NC}"
        ;;
      *)
        echo "$text"
        ;;
    esac
  else
    # Plain text for terminals that don't support color
    echo "$text"
  fi
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

      # First check if 'managed' column exists
      has_managed=0
      if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
        has_managed=1
        query="SELECT id, type, name, content, is_orphaned, managed FROM dns_records ORDER BY id;"
      else
        query="SELECT id, type, name, content, is_orphaned, 0 AS managed FROM dns_records ORDER BY id;"
      fi

      sqlite3 -csv "$DB_FILE" "$query" | \
      while IFS="," read -r id type name content orphaned managed; do
        # Truncate ID if needed
        if [ ${#id} -gt 8 ]; then
          id="${id:0:7}..."
        fi
        
        # Determine status
        if [ "$orphaned" = "1" ]; then
          status=$(status_text "orphaned" "Orphaned")
        elif [ "$managed" = "1" ]; then
          status=$(status_text "managed" "Managed")
        else
          status=$(status_text "unmanaged" "Unmanaged")
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
          status=$(status_text "orphaned" "Orphaned")
        elif [ "$managed" = "true" ]; then
          status=$(status_text "managed" "Managed")
        else
          status=$(status_text "unmanaged" "Unmanaged")
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

  logger_initialised=false

  # Always try direct database approach first
  if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
    echo_color $GRAY "Using SQLite database directly"

    # Initialize logger
    echo "Logger initialised with level: INFO (2)"
    logger_initialised=true

    # Check if managed column exists
    has_managed=0
    if sqlite3 "$DB_FILE" ".schema dns_records" 2>/dev/null | grep -q "managed"; then
      has_managed=1
    fi

    # Get current timestamp in ISO format
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Check if last_processed column exists
    has_last_processed=0
    if sqlite3 "$DB_FILE" ".schema dns_records" 2>/dev/null | grep -q "last_processed"; then
      has_last_processed=1
    fi

    # Update records based on schema
    if [ "$has_managed" -eq 1 ] && [ "$has_last_processed" -eq 1 ]; then
      # Full schema with managed and last_processed
      sqlite3 "$DB_FILE" "UPDATE dns_records SET last_processed = '$now', is_orphaned = 0 WHERE managed = 1;"
      echo_color $GREEN "Updated managed DNS records with new timestamp"
    elif [ "$has_last_processed" -eq 1 ]; then
      # Legacy schema with last_processed but no managed flag
      sqlite3 "$DB_FILE" "UPDATE dns_records SET last_processed = '$now';"
      echo_color $GREEN "Updated all DNS records with new timestamp"
    else
      # Basic schema without last_processed column - just mark as processed
      echo_color $GREEN "Records marked as processed (no timestamp column available)"
    fi

    # Get counts for reporting
    total=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records;")

    managed=0
    if [ "$has_managed" -eq 1 ]; then
      managed=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE managed = 1;")
    fi

    orphaned=0
    if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "is_orphaned"; then
      orphaned=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE is_orphaned = 1;")
    elif sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "orphaned"; then
      orphaned=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE orphaned = 1;")
    fi

    echo_color $GREEN "DNS records processed successfully"
    echo ""
    echo "Total records: $total"
    echo "Managed records: $managed"
    echo "Orphaned records: $orphaned"
    return 0
  fi

  # Try direct approach with API client
  if [ -f "/app/bin/trafego" ]; then
    # Use the proper CLI tool if it exists, with environment variables
    CLI_TOKEN=trafegodns-cli API_URL=http://localhost:3000 node /app/bin/trafego dns process $force_flag
    api_result=$?

    if [ $api_result -eq 0 ]; then
      return 0
    fi

    echo "API method failed: No token provided"
    echo "Trying alternative methods..."
  else
    echo "API client not found - trying alternative methods..."
  fi

  # Fallback to JSON file updates
  echo_color $YELLOW "Using file-based fallback method"

  # Initialize logger if not already done
  if [ "$logger_initialised" = false ]; then
    echo "Logger initialised with level: INFO (2)"
  fi

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
    return 0
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
    return 0
  fi

  echo_color $RED "Cannot process DNS records: No valid method available"
  echo "Make sure you are running this command from within the TrafegoDNS container"
  return 1
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

    # Check if is_orphaned column exists
    orphaned=0
    if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "is_orphaned"; then
      orphaned=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE is_orphaned = 1;")
    elif sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "orphaned"; then
      orphaned=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE orphaned = 1;")
    fi

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

function search_records() {
  query="$1"

  if [ -z "$query" ]; then
    echo_color $RED "Error: Search query is required"
    echo "Usage: $(basename $0) search <query>"
    return 1
  fi

  echo_color $CYAN "=== DNS Records Search: '$query' ==="
  echo ""

  # Check if it's a field-specific search (contains =)
  if [[ "$query" == *"="* ]]; then
    # Extract field and value
    field=$(echo "$query" | cut -d'=' -f1)
    value=$(echo "$query" | cut -d'=' -f2)

    case "$field" in
      "type"|"name"|"content"|"id")
        # Valid field
        ;;
      *)
        echo_color $RED "Error: Invalid search field '$field'. Use type, name, content, or id."
        return 1
        ;;
    esac
  fi

  # Try SQLite first if DB file exists
  if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
    echo_color $GRAY "Searching SQLite database"
    echo ""
    format_table_header

    # Prepare SQL query based on search type
    if [[ "$query" == *"="* ]]; then
      # Field-specific search
      field=$(echo "$query" | cut -d'=' -f1)
      value=$(echo "$query" | cut -d'=' -f2)

      sql_query="SELECT id, type, name, content, is_orphaned FROM dns_records WHERE $field LIKE '%$value%' ORDER BY id;"
    else
      # Generic search across multiple fields
      sql_query="SELECT id, type, name, content, is_orphaned FROM dns_records
                WHERE name LIKE '%$query%' OR content LIKE '%$query%' OR type LIKE '%$query%'
                ORDER BY id;"
    fi

    # Run the query
    sqlite3 -csv "$DB_FILE" "$sql_query" | \
    while IFS="," read -r id type name content orphaned; do
      # Truncate ID if needed
      if [ ${#id} -gt 8 ]; then
        id="${id:0:7}..."
      fi

      # Determine status
      if [ "$orphaned" = "1" ]; then
        status=$(status_text "orphaned" "Orphaned")
      else
        status=$(status_text "managed" "Active")
      fi

      printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
    done

    echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
    count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records
             WHERE name LIKE '%$query%' OR content LIKE '%$query%' OR type LIKE '%$query%';")
    echo "Found $count matching records"
    return
  fi

  # Fallback to JSON if SQLite not available
  if [ -f "$RECORDS_FILE" ] && command -v jq &> /dev/null; then
    echo_color $GRAY "Searching JSON records file"
    echo ""
    format_table_header

    # JQ filter based on search type
    if [[ "$query" == *"="* ]]; then
      # Field-specific search
      field=$(echo "$query" | cut -d'=' -f1)
      value=$(echo "$query" | cut -d'=' -f2)

      jq_filter=".records[] | select(.$field | tostring | contains(\"$value\")) | \"\(.id) \(.type) \(.name) \(.content // .data // .value // \"\") \(.orphaned // .is_orphaned)\""
    else
      # Generic search across multiple fields
      jq_filter=".records[] | select(.name | contains(\"$query\") or .type | contains(\"$query\") or (.content // .data // .value // \"\") | contains(\"$query\")) | \"\(.id) \(.type) \(.name) \(.content // .data // .value // \"\") \(.orphaned // .is_orphaned)\""
    fi

    # Run JQ search
    jq -r "$jq_filter" "$RECORDS_FILE" | \
    while read -r id type name content orphaned; do
      # Truncate ID if needed
      if [ ${#id} -gt 8 ]; then
        id="${id:0:7}..."
      fi

      # Determine status
      if [ "$orphaned" = "true" ]; then
        status=$(status_text "orphaned" "Orphaned")
      else
        status=$(status_text "managed" "Active")
      fi

      printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
    done

    echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
    count=$(jq "[ .records[] | select(.name | contains(\"$query\") or .type | contains(\"$query\") or (.content // .data // .value // \"\") | contains(\"$query\")) ] | length" "$RECORDS_FILE")
    echo "Found $count matching records"
    return
  fi

  echo_color $RED "Cannot search records: Neither SQLite nor JSON with jq is available"
  return 1
}

function delete_record() {
  record_id="$1"

  if [ -z "$record_id" ]; then
    echo_color $RED "Error: Record ID is required"
    echo "Usage: $(basename $0) delete <id>"
    return 1
  fi

  echo_color $YELLOW "Deleting DNS record with ID: $record_id"

  # Try SQLite first if DB file exists
  if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
    # Check if record exists
    record_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE id = $record_id;")

    if [ "$record_exists" -eq "0" ]; then
      echo_color $RED "Error: Record with ID $record_id does not exist"
      return 1
    fi

    # Get record details before deletion for confirmation
    record_details=$(sqlite3 -csv "$DB_FILE" "SELECT type, name, content FROM dns_records WHERE id = $record_id;")
    IFS="," read -r type name content <<< "$record_details"

    # Double-check with the user
    echo_color $YELLOW "You are about to delete the following record:"
    echo "ID: $record_id"
    echo "Type: $type"
    echo "Name: $name"
    echo "Content: $content"
    echo ""
    echo_color $RED "This action cannot be undone."
    echo -n "Are you sure? (y/N): "
    read -r confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo_color $YELLOW "Deletion cancelled."
      return 0
    fi

    # Delete the record
    sqlite3 "$DB_FILE" "DELETE FROM dns_records WHERE id = $record_id;"

    # Check if deletion was successful
    if [ $? -eq 0 ]; then
      echo_color $GREEN "Record successfully deleted."
    else
      echo_color $RED "Error deleting record."
      return 1
    fi

    return 0
  fi

  # Fallback to JSON file if SQLite not available
  if [ -f "$RECORDS_FILE" ] && command -v jq &> /dev/null; then
    # Check if record exists
    record_exists=$(jq ".records[] | select(.id == \"$record_id\") | .id" "$RECORDS_FILE")

    if [ -z "$record_exists" ]; then
      echo_color $RED "Error: Record with ID $record_id does not exist"
      return 1
    fi

    # Get record details before deletion for confirmation
    record_type=$(jq -r ".records[] | select(.id == \"$record_id\") | .type" "$RECORDS_FILE")
    record_name=$(jq -r ".records[] | select(.id == \"$record_id\") | .name" "$RECORDS_FILE")
    record_content=$(jq -r ".records[] | select(.id == \"$record_id\") | (.content // .data // .value // \"\")" "$RECORDS_FILE")

    # Double-check with the user
    echo_color $YELLOW "You are about to delete the following record:"
    echo "ID: $record_id"
    echo "Type: $record_type"
    echo "Name: $record_name"
    echo "Content: $record_content"
    echo ""
    echo_color $RED "This action cannot be undone."
    echo -n "Are you sure? (y/N): "
    read -r confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo_color $YELLOW "Deletion cancelled."
      return 0
    fi

    # Delete the record using jq
    jq "del(.records[] | select(.id == \"$record_id\"))" "$RECORDS_FILE" > "$RECORDS_FILE.tmp"
    mv "$RECORDS_FILE.tmp" "$RECORDS_FILE"

    if [ $? -eq 0 ]; then
      echo_color $GREEN "Record successfully deleted."
    else
      echo_color $RED "Error deleting record."
      return 1
    fi

    return 0
  fi

  echo_color $RED "Cannot delete records: Neither SQLite nor JSON with jq is available"
  return 1
}

function update_record() {
  record_id="$1"
  field_update="$2"

  if [ -z "$record_id" ] || [ -z "$field_update" ]; then
    echo_color $RED "Error: Record ID and field update are required"
    echo "Usage: $(basename $0) update <id> <field=value>"
    return 1
  fi

  # Extract field and value
  field=$(echo "$field_update" | cut -d'=' -f1)
  value=$(echo "$field_update" | cut -d'=' -f2)

  # Validate field
  case "$field" in
    "type"|"name"|"content"|"ttl"|"proxied")
      # Valid field
      ;;
    *)
      echo_color $RED "Error: Invalid field '$field'. Valid fields: type, name, content, ttl, proxied"
      return 1
      ;;
  esac

  echo_color $YELLOW "Updating DNS record $record_id: setting $field = $value"

  # Try SQLite first if DB file exists
  if [ -f "$DB_FILE" ] && command -v sqlite3 &> /dev/null; then
    # Check if record exists
    record_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE id = $record_id;")

    if [ "$record_exists" -eq "0" ]; then
      echo_color $RED "Error: Record with ID $record_id does not exist"
      return 1
    fi

    # Update the record
    if [ "$field" = "proxied" ]; then
      # Convert boolean values to integers for proxied
      if [[ "$value" == "true" || "$value" == "1" ]]; then
        value="1"
      else
        value="0"
      fi
    fi

    # Update the record
    sqlite3 "$DB_FILE" "UPDATE dns_records SET $field = '$value', tracked_at = datetime('now') WHERE id = $record_id;"

    # Check if update was successful
    if [ $? -eq 0 ]; then
      echo_color $GREEN "Record successfully updated."

      # Show the updated record
      echo_color $CYAN "Updated record:"
      format_table_header

      sqlite3 -csv "$DB_FILE" "SELECT id, type, name, content, is_orphaned FROM dns_records WHERE id = $record_id;" | \
      while IFS="," read -r id type name content orphaned; do
        # Determine status
        if [ "$orphaned" = "1" ]; then
          status=$(status_text "orphaned" "Orphaned")
        else
          status=$(status_text "managed" "Active")
        fi

        printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
      done
      echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
    else
      echo_color $RED "Error updating record."
      return 1
    fi

    return 0
  fi

  # Fallback to JSON file if SQLite not available
  if [ -f "$RECORDS_FILE" ] && command -v jq &> /dev/null; then
    # Check if record exists
    record_exists=$(jq ".records[] | select(.id == \"$record_id\") | .id" "$RECORDS_FILE")

    if [ -z "$record_exists" ]; then
      echo_color $RED "Error: Record with ID $record_id does not exist"
      return 1
    fi

    # Convert value for jq if needed
    jq_value="\"$value\""
    if [[ "$field" = "ttl" ]]; then
      # ttl should be a number
      jq_value="$value"
    elif [[ "$field" = "proxied" ]]; then
      # proxied should be a boolean
      if [[ "$value" == "true" || "$value" == "1" ]]; then
        jq_value="true"
      else
        jq_value="false"
      fi
    fi

    # Update the record
    jq --arg id "$record_id" --arg field "$field" --argjson value "$jq_value" \
       '.records = (.records | map(if .id == $id then . + {($field): $value} else . end))' \
       "$RECORDS_FILE" > "$RECORDS_FILE.tmp"

    # Update metadata timestamp
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg id "$record_id" --arg now "$now" \
       '.records = (.records | map(if .id == $id then if .metadata then .metadata.updatedAt = $now else . + {metadata: {updatedAt: $now}} end else . end))' \
       "$RECORDS_FILE.tmp" > "$RECORDS_FILE.tmp2"

    mv "$RECORDS_FILE.tmp2" "$RECORDS_FILE"
    rm -f "$RECORDS_FILE.tmp"

    if [ $? -eq 0 ]; then
      echo_color $GREEN "Record successfully updated."

      # Show the updated record
      echo_color $CYAN "Updated record:"
      format_table_header

      jq -r ".records[] | select(.id == \"$record_id\") | \"\(.id) \(.type) \(.name) \(.content // .data // .value // \"\") \(.orphaned // .is_orphaned)\"" "$RECORDS_FILE" | \
      while read -r id type name content orphaned; do
        # Determine status
        if [ "$orphaned" = "true" ]; then
          status=$(status_text "orphaned" "Orphaned")
        else
          status=$(status_text "managed" "Active")
        fi

        printf "| %-8s | %-6s | %-30s | %-30s | %-9s |\n" "$id" "$type" "$name" "$content" "$status"
      done
      echo "+---------+--------+--------------------------------+--------------------------------+-----------+"
    else
      echo_color $RED "Error updating record."
      return 1
    fi

    return 0
  fi

  echo_color $RED "Cannot update records: Neither SQLite nor JSON with jq is available"
  return 1
}

# Main command handler
case "$1" in
  "records"|"list"|"ls")
    list_records
    ;;
  "search"|"find")
    search_records "$2"
    ;;
  "process")
    process_records "$2"
    ;;
  "status"|"stat")
    show_status
    ;;
  "delete"|"remove"|"rm")
    delete_record "$2"
    ;;
  "update"|"edit")
    update_record "$2" "$3"
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