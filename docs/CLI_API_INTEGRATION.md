# CLI to API Integration

This document describes how TrafegoDNS integrates its Command-Line Interface (CLI) with the API server, allowing for secure local operations.

## Architecture Overview

TrafegoDNS now follows a client-server architecture:

1. **API Server**: The core backend that provides REST endpoints for all operations
2. **CLI Client**: A command-line interface that communicates with the API server

This architecture brings several benefits:
- Consistent behavior between CLI and web UI interactions
- Centralized security and validation at the API layer
- Simplified testing and maintenance

## Local Auth Bypass

For local operations (CLI commands), TrafegoDNS implements a secure local authentication bypass:

1. When the CLI runs commands, it sends requests to the API server with special authorization headers
2. The `localAuthBypassMiddleware` detects these requests and grants them administrative privileges
3. This allows CLI operations to bypass authentication while still using the API endpoints

The local auth bypass is:
- Only active for localhost connections and CLI clients with the proper security token
- Configurable via environment variables (`LOCAL_AUTH_BYPASS`, `TRAFEGO_INTERNAL_TOKEN`)
- Secured with a randomly generated token that's shared between the CLI and API server

## Operation Modes

TrafegoDNS can operate in several modes:

1. **Full Mode** (default): Both API server and CLI are active
   ```
   npm start
   ```

2. **API-Only Mode**: Only the API server runs (good for headless servers)
   ```
   npm run start:api
   ```

3. **CLI-Only Mode**: Uses direct service calls without the API server (legacy mode)
   ```
   npm run start:cli
   ```

4. **Development Mode**: Includes additional logging and debugging
   ```
   npm run dev
   ```

## Environment Variables

The following environment variables control the API/CLI integration:

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_API_MODE` | `true` | Enable/disable API mode |
| `API_PORT` | `3000` | Port for the API server |
| `LOCAL_AUTH_BYPASS` | `true` | Enable/disable local auth bypass |
| `TRAFEGO_INTERNAL_TOKEN` | `random` | Security token for internal requests |
| `CLI_TOKEN` | `trafegodns-cli` | Token for CLI authentication |
| `API_ONLY` | `false` | Run in API-only mode without CLI |
| `DISABLE_CLI` | `false` | Disable interactive CLI when running in API mode |

## CLI Commands

The CLI provides an interactive shell interface with these commands:

- `help` - Show available commands
- `status` - Show system status
- `records` or `dns` - List all DNS records
- `config` - Show current configuration
- `hostnames` - List managed hostnames
- `containers` - List Docker containers
- `refresh` - Force DNS refresh 
- `add <name> <type> <content> [ttl] [proxied]` - Add a new DNS record
- `delete` or `del <id>` - Delete a DNS record
- `exit` or `quit` - Exit the CLI (server continues running)

## Security Considerations

- The local auth bypass only works for localhost connections and authenticated CLI clients
- The bypass token is randomly generated at startup or can be set via environment variables
- External API requests still require proper authentication via JWT
- The API server implements rate limiting, CORS protection, and other security measures