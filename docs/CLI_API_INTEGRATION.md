# CLI to API Integration

This document describes how TrafegoDNS integrates its Command-Line Interface (CLI) with the API server, allowing for secure local operations.

## Architecture Overview

TrafegoDNS follows a multi-tier architecture:

1. **API Server**: The core backend that provides REST endpoints for all operations
2. **CLI Client**: A command-line interface that can use the API or direct service access
3. **State Management**: Central store and action broker for managing application state

This architecture brings several benefits:
- Consistent behavior between CLI and web UI interactions
- Centralized security and validation at the API layer
- Flexible access patterns (API, direct, or hybrid)
- Multi-mode operation with graceful fallbacks

## Communication Patterns

The CLI can communicate with the backend using several patterns:

1. **API Communication**: Standard HTTP requests to the API server
2. **Direct Service Access**: In-memory access to application services when running inside the container
3. **Action Broker**: Dispatch events to the central state management system
4. **Fallback Chain**: Cascading attempts from API → Action Broker → Direct Access

This flexible approach ensures the CLI works in various contexts:
- Inside Docker container with API access
- Inside Docker container without API (direct mode)
- External to the container with API access
- In development environment with live reloading

## Authentication Methods

### API Authentication

For API communication, the CLI uses these authentication mechanisms:

1. **Bearer Token**: Standard JWT authentication with Bearer token
2. **Special Headers**: Custom X-Trafego-CLI header with the CLI token
3. **Local Authentication Bypass**: Special middleware that grants admin privileges to local CLI requests

### Local Auth Bypass

For local operations (CLI commands), TrafegoDNS implements a secure local authentication bypass:

1. When the CLI runs commands, it sends requests to the API server with special authorization headers
2. The `localAuthBypassMiddleware` detects these requests and grants them administrative privileges
3. This allows CLI operations to bypass authentication while still using the API endpoints

The local auth bypass is:
- Only active for localhost connections and CLI clients with the proper security token
- Configurable via environment variables
- Secured with a token that's shared between the CLI and API server

## Container Integration

Inside the Docker container, the CLI is:

1. Automatically installed in standard PATH locations (`/usr/local/bin/trafego`)
2. Pre-configured with the correct environment variables
3. Provided with specialized wrappers that load the application context
4. Set up with appropriate permissions to access config files

This enables seamless usage with:
```bash
docker exec -it trafegodns trafego dns process
```

Without requiring any additional setup or configuration.

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
| `API_URL` | `http://localhost:3000` | URL for API communication |
| `CLI_TOKEN` | `trafegodns-cli` | Token for CLI authentication |
| `USE_API_MODE` | `true` | Enable/disable API mode |
| `API_PORT` | `3000` | Port for the API server |
| `LOCAL_AUTH_BYPASS` | `true` | Enable/disable local auth bypass |
| `TRAFEGO_INTERNAL_TOKEN` | `random` | Security token for internal requests |
| `API_ONLY` | `false` | Run in API-only mode without CLI |
| `DISABLE_CLI` | `false` | Disable interactive CLI when running in API mode |
| `CONTAINER` | `true` | Indicates running in a container environment |
| `TRAFEGO_CLI` | `true` | Identifies CLI-specific environment |

## Command Structure

The CLI uses a hierarchical command structure:

```
trafego <command-group> <command> [options]
```

### Command Groups

- `dns`: DNS record management commands
- `db`: Database management commands
- `system`: System status and management commands

Each group contains multiple commands with their own options and parameters.

## Implementation Notes

### API Client

The CLI's API client (`src/cli/apiClient.js`) includes:

1. Environment detection to determine if running in a container
2. Direct service access when available inside the container
3. Authentication header handling for different scenarios
4. Graceful fallback between API and direct access methods
5. Automatic error recovery and retry logic

### Command Handlers

Command handlers (`src/cli/commands/`) follow these patterns:

1. Attempt API access first (most reliable)
2. Fall back to action broker if available
3. Use direct service access as a last resort
4. Provide detailed error messages when all methods fail
5. Format output consistently regardless of data source

### Security Considerations

- The local auth bypass only works for localhost connections and authenticated CLI clients
- The bypass token is randomly generated at startup or can be set via environment variables
- External API requests still require proper authentication via JWT
- The API server implements rate limiting, CORS protection, and other security measures
- Direct service access is only available inside the container