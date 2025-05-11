# TrafegoDNS CLI Guide

TrafegoDNS provides a simple command-line interface (CLI) for managing DNS records directly from the terminal. This guide explains how to use the CLI commands.

## Available Commands

The CLI is available as a single, unified command tool with multiple aliases:

```bash
# Main command
trafegodns [command]

# Aliases for specific operations
trafego-records  # Same as 'trafegodns records'
db-records       # Same as 'trafegodns records'
process-dns      # Same as 'trafegodns process'
dns-status       # Same as 'trafegodns status'
view-dns         # Same as 'trafegodns records'
```

### Command Options

The following commands are available:

```bash
# List all DNS records
trafegodns records

# Process DNS records (normal mode)
trafegodns process

# Process DNS records (force update)
trafegodns process --force

# Show database status and statistics
trafegodns status

# Show help information
trafegodns help
```

## Using the CLI

### From Inside the Container

When inside the container, simply run the commands directly:

```bash
# List DNS records
trafegodns records

# Process DNS records with force update
trafegodns process --force
```

### From Docker Host

To execute commands from outside the container:

```bash
# List DNS records
docker exec -it trafegodns trafegodns records

# Process DNS records with force update
docker exec -it trafegodns trafegodns process --force

# Show database status
docker exec -it trafegodns trafegodns status
```

You can also use the shorter alias commands:

```bash
docker exec -it trafegodns trafego-records
docker exec -it trafegodns process-dns --force
```

## Why This Approach?

The TrafegoDNS CLI is designed to:

1. **Work without dependencies**: The commands will work even if Node.js modules are missing
2. **Provide graceful fallbacks**: Uses SQLite if available, falls back to JSON files if needed, and adapts to different database schemas
3. **Support both bash and Node.js environments**: Works in any container environment
4. **Avoid authentication issues**: Direct file access bypasses API authentication requirements
5. **Keep it simple**: One command with multiple aliases for different operations

This approach ensures the CLI works reliably regardless of how TrafegoDNS is installed or configured.