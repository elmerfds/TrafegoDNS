# TrafegoDNS CLI Usage Guide

TrafegoDNS now includes a command-line interface (CLI) tool that allows you to interact with the application from the terminal.

## Installation

The CLI tool is automatically installed with TrafegoDNS. Inside the container, you can access it using:

```bash
trafego [command]
```

Or using npm:

```bash
npm run cli -- [command]
```

## Environment Variables

The CLI tool respects the following environment variables:

- `API_URL`: The URL of the TrafegoDNS API (default: http://localhost:3000)
- `CLI_TOKEN`: The authentication token for the API (default: trafegodns-cli)

## Available Commands

### Database Commands

```bash
# Show database status
trafego db status

# List DNS records
trafego db records

# List DNS records with filtering
trafego db records --type A --limit 10
trafego db records --orphaned
trafego db records --managed

# Run cleanup of orphaned records
trafego db cleanup

# Refresh DNS records from provider
trafego db refresh
```

### DNS Commands

```bash
# Refresh DNS records from provider
trafego dns refresh

# Process hostnames and update DNS records
trafego dns process

# Process hostnames and force update of all records
trafego dns process --force
```

### System Commands

```bash
# Show system status
trafego system status
```

## Command Options

### Records Listing Options

- `-t, --type <type>`: Filter by record type (A, CNAME, etc.)
- `-o, --orphaned`: Show only orphaned records
- `-m, --managed`: Show only managed records
- `-p, --preserve`: Show only preserved records
- `-l, --limit <number>`: Limit number of records (default: 100)

## Examples

```bash
# List all DNS records
trafego db records

# List only A records
trafego db records --type A

# List orphaned records
trafego db records --orphaned

# Clean up orphaned records immediately
trafego db cleanup

# Refresh DNS records from provider
trafego dns refresh
```

## Running CLI Commands from Docker

If you're running TrafegoDNS in Docker, you can execute CLI commands using:

```bash
docker exec -it trafegodns trafego db status
```

## Using in Scripts

You can use the CLI tool in scripts to automate tasks. For example:

```bash
#!/bin/bash
# Refresh DNS records and clean up orphaned records
trafego dns refresh
trafego db cleanup
```

## Troubleshooting

If you're having issues with the CLI tool:

1. Check the API connection:
   ```bash
   curl http://localhost:3000/api/v1/status
   ```

2. Ensure the CLI token is correct:
   ```bash
   export CLI_TOKEN="your-cli-token"
   trafego db status
   ```

3. Run in debug mode:
   ```bash
   DEBUG=true trafego db status
   ```

4. Check the logs:
   ```bash
   docker logs trafegodns
   ```

## Future CLI Features

We plan to add more CLI commands in future releases, including:

- User management commands
- DNS record creation/updating/deletion
- Configuration management
- Advanced filtering and output options