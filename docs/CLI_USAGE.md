# TrafegoDNS CLI Usage Guide

TrafegoDNS includes a powerful command-line interface (CLI) that provides direct access to DNS management functions and database operations from the terminal.

## Getting Started

### From Docker Container

The CLI is automatically included in the TrafegoDNS container and can be accessed using:

```bash
docker exec -it trafegodns trafego
```

### Running Locally

If you're running TrafegoDNS locally outside a container:

```bash
npm run cli
```

Or directly:

```bash
node bin/trafego
```

## Command Structure

The CLI uses a hierarchical command structure:

```
trafego <command-group> <command> [options]
```

For example:
```bash
trafego dns process --force
```

## Available Command Groups

### DNS Management

Commands to manage DNS records and operations:

```bash
trafego dns --help
```

#### Available Commands

| Command | Description | Options |
|---------|-------------|---------|
| `trafego dns process` | Process hostnames and update DNS records | `--force, -f`: Force update of all DNS records |
| `trafego dns refresh` | Refresh DNS records from provider | None |

### Database Management

Commands to view and manage the database:

```bash
trafego db --help
```

#### Available Commands

| Command | Description | Options |
|---------|-------------|---------|
| `trafego db status` | Show database status | None |
| `trafego db records` | List DNS records | `--type, -t <type>`: Filter by record type<br>`--orphaned, -o`: Show only orphaned records<br>`--managed, -m`: Show only managed records<br>`--preserve, -p`: Show only preserved records<br>`--limit, -l <number>`: Limit number of records |
| `trafego db cleanup` | Clean up orphaned records | None |
| `trafego db refresh` | Refresh DNS records | None |

### System Commands

Commands to view system status:

```bash
trafego system --help
```

#### Available Commands

| Command | Description | Options |
|---------|-------------|---------|
| `trafego system status` | Show system status | None |

## Examples

### Process DNS Records

Process DNS records, updating any that need changes:

```bash
trafego dns process
```

Force processing of all DNS records, regardless of current status:

```bash
trafego dns process --force
```

### Refresh DNS Records from Provider

Pull the latest records from your DNS provider:

```bash
trafego dns refresh
```

### View Database Status

Display information about the database, including record counts:

```bash
trafego db status
```

Example output:
```
=== Database Status ===
┌──────────────────┬────────────────────────────┐
│ Database Type    │ SQLite                     │
├──────────────────┼────────────────────────────┤
│ Database Path    │ /config/data/trafegodns.db │
├──────────────────┼────────────────────────────┤
│ DNS Records      │ 83                         │
├──────────────────┼────────────────────────────┤
│ Orphaned Records │ 0                          │
├──────────────────┼────────────────────────────┤
│ Users            │ 1                          │
├──────────────────┼────────────────────────────┤
│ Revoked Tokens   │ 0                          │
└──────────────────┴────────────────────────────┘
```

### List DNS Records

Display all DNS records in the database:

```bash
trafego db records
```

Filter by record type:

```bash
trafego db records --type A
```

Show only orphaned records:

```bash
trafego db records --orphaned
```

Example output:
```
┌──────────┬────────┬──────────────────────────────────┬─────────────────────────┬──────────┐
│ ID       │ Type   │ Name                             │ Content                  │ Status   │
├──────────┼────────┼──────────────────────────────────┼─────────────────────────┼──────────┤
│ 123abc.. │ A      │ example.com                      │ 203.0.113.10            │ Managed  │
│ 456def.. │ CNAME  │ www.example.com                  │ example.com             │ Managed  │
│ 789ghi.. │ MX     │ example.com                      │ mail.example.com        │ Managed  │
└──────────┴────────┴──────────────────────────────────┴─────────────────────────┴──────────┘
Total: 3 records
```

### Clean Up Orphaned Records

Remove any orphaned DNS records based on the configured cleanup rules:

```bash
trafego db cleanup
```

## Special Container Commands

When running in a Docker container, TrafegoDNS provides these additional convenience commands:

```bash
# Display DNS records (most reliable direct access method)
trafego-records

# Alternative shorthand commands
db-records
trafego-db-records

# Direct DNS processing command
process-dns

# Force processing with the --force flag
process-dns --force
```

These commands use direct database/service access and are guaranteed to work even if there are API authentication issues. They're particularly useful in automation scripts or when troubleshooting.

## Environment Variables

The CLI respects and uses the same environment variables as the main application, including:
- `LOG_LEVEL`: Controls the CLI's logging verbosity
- `API_URL`: Specifies the API location (when run outside the container)
- `CLI_TOKEN`: Token for API authentication

## Authentication

When run inside the container, the CLI automatically authenticates using direct access to application services.

When run externally, it can connect to the TrafegoDNS API using the CLI token:

```bash
CLI_TOKEN=your_token API_URL=http://your-server:3000 trafego dns process
```

## Advanced Usage

### Automation & Scripting

The CLI is designed to be easily used in scripts and automated workflows. For example:

```bash
#!/bin/bash
# Update DNS records and report results
docker exec -it trafegodns trafego dns process --force > /var/log/dns-updates.log
```

### Incorporating into System Maintenance

You can incorporate CLI commands into system cron jobs:

```crontab
# Force DNS refresh every hour
0 * * * * docker exec trafegodns trafego dns refresh > /dev/null 2>&1

# Process DNS records every 15 minutes
*/15 * * * * docker exec trafegodns trafego dns process > /dev/null 2>&1
```

## Troubleshooting

If you encounter issues with the CLI, try these steps:

1. Ensure the container is running: `docker ps | grep trafegodns`
2. Check CLI access: `docker exec -it trafegodns trafego --help`
3. Verify permissions: The CLI needs to access the Docker socket and config directory
4. Check the API connection (for external use): `curl http://localhost:3000/api/v1/status`
5. Check container logs: `docker logs trafegodns`

If running outside the container, make sure:
1. The API URL is correct: `export API_URL=http://localhost:3000`
2. The CLI token is valid: `export CLI_TOKEN=your-cli-token`
3. The API is accessible from your location