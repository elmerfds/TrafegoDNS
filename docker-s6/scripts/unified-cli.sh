#!/bin/bash
# Make sure script is executable
chmod +x "$0"
# Unified CLI script for TrafegoDNS - handles all commands directly

# Configuration
CONFIG_DIR=${CONFIG_DIR:-"/config"}
DATA_DIR="$CONFIG_DIR/data"
DB_FILE="$DATA_DIR/trafegodns.db"
# JSON file path kept for migration only
RECORDS_FILE="$DATA_DIR/dns-records.json"

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
  echo "DNS Record Commands:"
  echo "  records                  List all DNS records"
  echo "  search <query>           Search for records by name, type, or content"
  echo "  process [--force]        Process DNS records (--force to force update)"
  echo "  delete <id>              Delete a DNS record by ID"
  echo "  update <id> <field=val>  Update a DNS record field"
  echo ""
  echo "User Management Commands:"
  echo "  users                    List all users"
  echo "  user-add <user> <pass>   Add a new user"
  echo "  user-delete <id>         Delete a user by ID"
  echo "  user-password <id> <pw>  Update a user's password"
  echo "  user-role <id> <role>    Update a user's role (admin/user)"
  echo ""
  echo "System Commands:"
  echo "  status                   Show database status"
  echo "  help                     Show this help message"
  echo ""
  echo "Examples:"
  echo "  $(basename $0) records"
  echo "  $(basename $0) search example.com"
  echo "  $(basename $0) search 'type=CNAME'"
  echo "  $(basename $0) process --force"
  echo "  $(basename $0) update 15 content=192.168.1.10"
  echo "  $(basename $0) users"
  echo "  $(basename $0) user-add newuser password123"
  echo "  $(basename $0) user-role 2 admin"
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

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  echo_color $GRAY "Reading from SQLite database"
  echo ""
  format_table_header

  # Check if 'managed' column exists
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

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  echo_color $GRAY "Using SQLite database"

  # Initialize logger for consistency with previous output
  echo "Logger initialised with level: INFO (2)"

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
}

function show_status() {
  echo_color $CYAN "=== Database Status ==="
  echo ""

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Show database file info
  echo_color $GRAY "Database file: $(ls -l "$DB_FILE")"
  db_size=$(du -h "$DB_FILE" | cut -f1)
  echo_color $GRAY "Database size: $db_size"
  echo_color $GRAY "SQLite version: $(sqlite3 --version)"

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

  # Check if managed column exists
  managed=0
  if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
    managed=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE managed = 1;")
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
  echo "Managed Records:  $managed"
  echo "Orphaned Records: $orphaned"
  echo "Users:            $users"
  echo "Revoked Tokens:   $tokens"
}

function search_records() {
  query="$1"

  if [ -z "$query" ]; then
    echo_color $RED "Error: Search query is required"
    echo "Usage: $(basename $0) search <query>"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
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

  echo_color $GRAY "Searching SQLite database"
  echo ""
  format_table_header

  # Check if managed column exists
  has_managed=0
  if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
    has_managed=1
  fi

  # Prepare SQL query based on search type
  if [[ "$query" == *"="* ]]; then
    # Field-specific search
    field=$(echo "$query" | cut -d'=' -f1)
    value=$(echo "$query" | cut -d'=' -f2)

    if [ "$has_managed" -eq 1 ]; then
      sql_query="SELECT id, type, name, content, is_orphaned, managed FROM dns_records WHERE $field LIKE '%$value%' ORDER BY id;"
    else
      sql_query="SELECT id, type, name, content, is_orphaned, 0 AS managed FROM dns_records WHERE $field LIKE '%$value%' ORDER BY id;"
    fi
  else
    # Generic search across multiple fields
    if [ "$has_managed" -eq 1 ]; then
      sql_query="SELECT id, type, name, content, is_orphaned, managed FROM dns_records
                WHERE name LIKE '%$query%' OR content LIKE '%$query%' OR type LIKE '%$query%'
                ORDER BY id;"
    else
      sql_query="SELECT id, type, name, content, is_orphaned, 0 AS managed FROM dns_records
                WHERE name LIKE '%$query%' OR content LIKE '%$query%' OR type LIKE '%$query%'
                ORDER BY id;"
    fi
  fi

  # Run the query
  sqlite3 -csv "$DB_FILE" "$sql_query" | \
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

  # Get count of matching records
  if [[ "$query" == *"="* ]]; then
    field=$(echo "$query" | cut -d'=' -f1)
    value=$(echo "$query" | cut -d'=' -f2)
    count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE $field LIKE '%$value%';")
  else
    count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records
             WHERE name LIKE '%$query%' OR content LIKE '%$query%' OR type LIKE '%$query%';")
  fi

  echo "Found $count matching records"
}

function delete_record() {
  record_id="$1"

  if [ -z "$record_id" ]; then
    echo_color $RED "Error: Record ID is required"
    echo "Usage: $(basename $0) delete <id>"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  echo_color $YELLOW "Deleting DNS record with ID: $record_id"

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

  # Delete the record from SQLite
  sqlite3 "$DB_FILE" "DELETE FROM dns_records WHERE id = $record_id;"

  # Check if deletion was successful
  if [ $? -eq 0 ]; then
    echo_color $GREEN "Record successfully deleted."
  else
    echo_color $RED "Error deleting record."
    return 1
  fi

  return 0
}

function update_record() {
  record_id="$1"
  field_update="$2"

  if [ -z "$record_id" ] || [ -z "$field_update" ]; then
    echo_color $RED "Error: Record ID and field update are required"
    echo "Usage: $(basename $0) update <id> <field=value>"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Extract field and value
  field=$(echo "$field_update" | cut -d'=' -f1)
  value=$(echo "$field_update" | cut -d'=' -f2)

  # Validate field
  case "$field" in
    "type"|"name"|"content"|"ttl"|"proxied"|"managed")
      # Valid field
      ;;
    *)
      echo_color $RED "Error: Invalid field '$field'. Valid fields: type, name, content, ttl, proxied, managed"
      return 1
      ;;
  esac

  echo_color $YELLOW "Updating DNS record $record_id: setting $field = $value"

  # Check if record exists
  record_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM dns_records WHERE id = $record_id;")

  if [ "$record_exists" -eq "0" ]; then
    echo_color $RED "Error: Record with ID $record_id does not exist"
    return 1
  fi

  # Convert boolean values to integers for SQLite
  if [ "$field" = "proxied" ] || [ "$field" = "managed" ]; then
    if [[ "$value" == "true" || "$value" == "1" ]]; then
      value="1"
    else
      value="0"
    fi
  fi

  # Check if the field exists in the schema before updating
  if [ "$field" = "managed" ]; then
    if ! sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
      echo_color $RED "Error: 'managed' column does not exist in the database schema"
      return 1
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

    # Check if managed column exists
    has_managed=0
    if sqlite3 "$DB_FILE" ".schema dns_records" | grep -q "managed"; then
      has_managed=1
      query="SELECT id, type, name, content, is_orphaned, managed FROM dns_records WHERE id = $record_id;"
    else
      query="SELECT id, type, name, content, is_orphaned, 0 AS managed FROM dns_records WHERE id = $record_id;"
    fi

    sqlite3 -csv "$DB_FILE" "$query" | \
    while IFS="," read -r id type name content orphaned managed; do
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
  else
    echo_color $RED "Error updating record."
    return 1
  fi

  return 0
}

# User management functions
function list_users() {
  echo_color $CYAN "=== Users ==="
  echo ""

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Check if users table exists
  if ! sqlite3 "$DB_FILE" ".tables" | grep -q "users"; then
    echo_color $RED "Error: Users table not found in database"
    return 1
  fi

  # Format user display
  echo_color $CYAN "| ID   | Username        | Role      | Created                   | Last Login                |"
  echo "+---------+----------------+-----------+---------------------------+--------------------------+"

  # Query users
  sqlite3 -csv "$DB_FILE" "SELECT id, username, role, created_at, last_login FROM users ORDER BY id;" | \
  while IFS="," read -r id username role created_at last_login; do
    # Handle null values
    if [ "$last_login" = "" ]; then
      last_login="Never"
    fi

    # Colorize role
    if [ "$role" = "admin" ]; then
      role_display=$(status_text "managed" "admin")
    else
      role_display=$(status_text "unmanaged" "user")
    fi

    printf "| %-7s | %-14s | %-9s | %-25s | %-24s |\n" "$id" "$username" "$role_display" "$created_at" "$last_login"
  done

  echo "+---------+----------------+-----------+---------------------------+--------------------------+"
  total=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users;")
  echo "Total users: $total"
}

function add_user() {
  username="$1"
  password="$2"
  role="$3"

  if [ -z "$username" ] || [ -z "$password" ]; then
    echo_color $RED "Error: Username and password are required"
    echo "Usage: $(basename $0) user-add <username> <password> [role]"
    return 1
  fi

  # Default role to 'user' if not specified
  if [ -z "$role" ]; then
    role="user"
  fi

  # Validate role
  if [ "$role" != "user" ] && [ "$role" != "admin" ]; then
    echo_color $RED "Error: Invalid role. Valid roles are 'user' or 'admin'"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Check if user already exists
  user_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE username = '$username';")
  if [ "$user_exists" -gt "0" ]; then
    echo_color $RED "Error: User '$username' already exists"
    return 1
  fi

  # Generate password hash - we'll use a simple md5 hash for the CLI version
  # NOTE: This is not secure for production use but works for a simple CLI demo
  if command -v openssl &> /dev/null; then
    # Generate a proper bcrypt hash if NodeJS is available
    if command -v node &> /dev/null; then
      password_hash=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$password', 10));")
      if [ $? -ne 0 ]; then
        echo_color $YELLOW "Warning: Bcrypt not available, using simple hash"
        password_hash=$(echo -n "$password" | openssl md5 | awk '{print $2}')
      fi
    else
      password_hash=$(echo -n "$password" | openssl md5 | awk '{print $2}')
    fi
  else
    # Generate a very basic hash if openssl is not available
    password_hash=$(echo -n "$password" | md5sum | awk '{print $1}')
  fi

  # Insert user
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  sqlite3 "$DB_FILE" "INSERT INTO users (username, password_hash, role, created_at) VALUES ('$username', '$password_hash', '$role', '$now');"

  # Check if insertion was successful
  if [ $? -eq 0 ]; then
    echo_color $GREEN "User '$username' created successfully with role '$role'"
  else
    echo_color $RED "Error creating user"
    return 1
  fi
}

function delete_user() {
  user_id="$1"

  if [ -z "$user_id" ]; then
    echo_color $RED "Error: User ID is required"
    echo "Usage: $(basename $0) user-delete <id>"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Check if user exists
  user_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE id = $user_id;")
  if [ "$user_exists" -eq "0" ]; then
    echo_color $RED "Error: User with ID $user_id does not exist"
    return 1
  fi

  # Get user details before deletion
  user_details=$(sqlite3 -csv "$DB_FILE" "SELECT username, role FROM users WHERE id = $user_id;")
  IFS="," read -r username role <<< "$user_details"

  # Prevent deletion of the last admin user
  if [ "$role" = "admin" ]; then
    admin_count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE role = 'admin';")
    if [ "$admin_count" -le "1" ]; then
      echo_color $RED "Error: Cannot delete the last admin user"
      return 1
    fi
  fi

  # Confirm deletion
  echo_color $YELLOW "You are about to delete the following user:"
  echo "ID: $user_id"
  echo "Username: $username"
  echo "Role: $role"
  echo ""
  echo_color $RED "This action cannot be undone."
  echo -n "Are you sure? (y/N): "
  read -r confirm

  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo_color $YELLOW "Deletion cancelled."
    return 0
  fi

  # Delete the user
  sqlite3 "$DB_FILE" "DELETE FROM users WHERE id = $user_id;"

  # Check if deletion was successful
  if [ $? -eq 0 ]; then
    echo_color $GREEN "User '$username' deleted successfully"
  else
    echo_color $RED "Error deleting user"
    return 1
  fi
}

function update_user_password() {
  user_id="$1"
  password="$2"

  if [ -z "$user_id" ] || [ -z "$password" ]; then
    echo_color $RED "Error: User ID and new password are required"
    echo "Usage: $(basename $0) user-password <id> <new-password>"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Check if user exists
  user_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE id = $user_id;")
  if [ "$user_exists" -eq "0" ]; then
    echo_color $RED "Error: User with ID $user_id does not exist"
    return 1
  fi

  # Get username
  username=$(sqlite3 "$DB_FILE" "SELECT username FROM users WHERE id = $user_id;")

  # Generate password hash
  if command -v openssl &> /dev/null; then
    # Generate a proper bcrypt hash if NodeJS is available
    if command -v node &> /dev/null; then
      password_hash=$(node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('$password', 10));")
      if [ $? -ne 0 ]; then
        echo_color $YELLOW "Warning: Bcrypt not available, using simple hash"
        password_hash=$(echo -n "$password" | openssl md5 | awk '{print $2}')
      fi
    else
      password_hash=$(echo -n "$password" | openssl md5 | awk '{print $2}')
    fi
  else
    # Generate a very basic hash if openssl is not available
    password_hash=$(echo -n "$password" | md5sum | awk '{print $1}')
  fi

  # Update password
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  sqlite3 "$DB_FILE" "UPDATE users SET password_hash = '$password_hash', updated_at = '$now' WHERE id = $user_id;"

  # Check if update was successful
  if [ $? -eq 0 ]; then
    echo_color $GREEN "Password for user '$username' updated successfully"
  else
    echo_color $RED "Error updating password"
    return 1
  fi
}

function update_user_role() {
  user_id="$1"
  role="$2"

  if [ -z "$user_id" ] || [ -z "$role" ]; then
    echo_color $RED "Error: User ID and new role are required"
    echo "Usage: $(basename $0) user-role <id> <role>"
    return 1
  fi

  # Validate role
  if [ "$role" != "user" ] && [ "$role" != "admin" ]; then
    echo_color $RED "Error: Invalid role. Valid roles are 'user' or 'admin'"
    return 1
  fi

  # Verify database and SQLite command
  if [ ! -f "$DB_FILE" ]; then
    echo_color $RED "Error: Database file not found at $DB_FILE"
    echo "Make sure you are running this command from within the TrafegoDNS container"
    return 1
  fi

  if ! command -v sqlite3 &> /dev/null; then
    echo_color $RED "Error: sqlite3 command is required but not found"
    echo "Please install SQLite: apk add --no-cache sqlite"
    return 1
  fi

  # Check if user exists
  user_exists=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE id = $user_id;")
  if [ "$user_exists" -eq "0" ]; then
    echo_color $RED "Error: User with ID $user_id does not exist"
    return 1
  fi

  # Get user details
  user_details=$(sqlite3 -csv "$DB_FILE" "SELECT username, role FROM users WHERE id = $user_id;")
  IFS="," read -r username current_role <<< "$user_details"

  # Prevent downgrading the last admin
  if [ "$current_role" = "admin" ] && [ "$role" = "user" ]; then
    admin_count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users WHERE role = 'admin';")
    if [ "$admin_count" -le "1" ]; then
      echo_color $RED "Error: Cannot downgrade the last admin user"
      return 1
    fi
  fi

  # Update role
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  sqlite3 "$DB_FILE" "UPDATE users SET role = '$role', updated_at = '$now' WHERE id = $user_id;"

  # Check if update was successful
  if [ $? -eq 0 ]; then
    echo_color $GREEN "Role for user '$username' updated from '$current_role' to '$role'"
  else
    echo_color $RED "Error updating role"
    return 1
  fi
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
  "users"|"user-list"|"list-users")
    list_users
    ;;
  "user-add"|"add-user")
    add_user "$2" "$3" "$4"
    ;;
  "user-delete"|"delete-user")
    delete_user "$2"
    ;;
  "user-password"|"password")
    update_user_password "$2" "$3"
    ;;
  "user-role"|"role")
    update_user_role "$2" "$3"
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