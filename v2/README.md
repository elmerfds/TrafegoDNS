# TrafegoDNS v2

A complete rewrite of TrafegoDNS in TypeScript with a REST API, database persistence, user authentication, and advanced features like Cloudflare Tunnels support.

## What's New in v2

- **TypeScript**: Full TypeScript codebase with strict typing
- **REST API**: Express-based API with authentication, rate limiting, and audit logging
- **Database**: SQLite with Drizzle ORM for persistent storage
- **User Management**: Multi-user support with role-based access control (admin, user, readonly)
- **Cloudflare Tunnels**: Native support for Cloudflare Argo Tunnels management
- **Technitium DNS**: New self-hosted DNS provider support
- **Webhooks**: Event-driven notifications for DNS changes
- **Audit Logging**: Full audit trail of all API operations
- **Settings Service**: Runtime-configurable settings stored in database
- **V1 Migration**: Automatic migration of v1 data to v2 schema

## Architecture

```
src/
├── api/                  # REST API
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Auth, rate limiting, audit
│   └── routes/           # Route definitions
├── config/               # Configuration management
│   ├── ConfigManager.ts  # Environment-based config
│   └── schema.ts         # Zod validation schemas
├── core/                 # Core infrastructure
│   ├── Application.ts    # Main orchestrator
│   ├── EventBus.ts       # Pub/sub event system
│   ├── Logger.ts         # Pino-based logging
│   └── ServiceContainer.ts # Dependency injection
├── database/             # Database layer
│   ├── connection.ts     # SQLite connection
│   └── schema/           # Drizzle table definitions
├── monitors/             # Container monitoring
│   ├── DockerMonitor.ts  # Docker event watching
│   ├── TraefikMonitor.ts # Traefik API polling
│   └── DirectMonitor.ts  # Direct label mode
├── providers/            # DNS providers
│   ├── base/             # Abstract provider class
│   ├── cloudflare/       # Cloudflare + Tunnels
│   ├── digitalocean/     # DigitalOcean DNS
│   ├── route53/          # AWS Route53
│   └── technitium/       # Technitium DNS
├── services/             # Business logic
│   ├── DNSManager.ts     # DNS orchestration
│   ├── TunnelManager.ts  # Cloudflare Tunnels
│   ├── WebhookService.ts # Webhook delivery
│   └── SettingsService.ts # Runtime settings
└── migration/            # V1 to V2 migration
```

## Quick Start

### Development

```bash
cd v2

# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with username/password |
| POST | `/api/auth/logout` | Logout current session |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/api-keys` | Create API key |
| GET | `/api/auth/api-keys` | List user's API keys |
| DELETE | `/api/auth/api-keys/:id` | Revoke API key |

### DNS Records

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dns/records` | List all DNS records |
| GET | `/api/dns/records/:id` | Get specific record |
| POST | `/api/dns/records` | Create DNS record |
| PUT | `/api/dns/records/:id` | Update DNS record |
| DELETE | `/api/dns/records/:id` | Delete DNS record |
| POST | `/api/dns/records/sync` | Force sync with provider |

### Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/providers` | List configured providers |
| GET | `/api/providers/:id` | Get provider details |
| POST | `/api/providers` | Add new provider (admin) |
| PUT | `/api/providers/:id` | Update provider (admin) |
| DELETE | `/api/providers/:id` | Remove provider (admin) |
| POST | `/api/providers/:id/test` | Test provider connection |

### Tunnels (Cloudflare)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tunnels` | List tunnels |
| GET | `/api/tunnels/:id` | Get tunnel details |
| POST | `/api/tunnels` | Create tunnel |
| DELETE | `/api/tunnels/:id` | Delete tunnel |
| GET | `/api/tunnels/:id/ingress` | List ingress rules |
| POST | `/api/tunnels/:id/ingress` | Add ingress rule |
| DELETE | `/api/tunnels/:id/ingress/:hostname` | Remove ingress rule |
| POST | `/api/tunnels/:id/deploy` | Deploy tunnel config |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Create webhook |
| PUT | `/api/webhooks/:id` | Update webhook |
| DELETE | `/api/webhooks/:id` | Delete webhook |
| POST | `/api/webhooks/:id/test` | Test webhook delivery |
| GET | `/api/webhooks/:id/deliveries` | Get delivery history |

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | List all settings |
| GET | `/api/settings/schema` | Get settings schema |
| PUT | `/api/settings/:key` | Update setting (admin) |
| POST | `/api/settings/:key/reset` | Reset to default (admin) |

### Audit (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit` | List audit logs |
| GET | `/api/audit/stats` | Get audit statistics |
| GET | `/api/audit/:id` | Get specific audit entry |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Basic health check |
| GET | `/api/health/ready` | Readiness probe |
| GET | `/api/health/live` | Liveness probe |

## Environment Variables

### Application

| Variable | Description | Default |
|----------|-------------|---------|
| `OPERATION_MODE` | `traefik` or `direct` | `traefik` |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info` |
| `DATA_DIR` | Data directory path | `/config/data` |
| `API_PORT` | API server port | `3000` |
| `API_HOST` | API server host | `0.0.0.0` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Auto-generated |
| `JWT_EXPIRES_IN` | JWT token expiry | `24h` |
| `POLL_INTERVAL` | Monitor poll interval (ms) | `60000` |
| `CLEANUP_ORPHANED` | Enable orphan cleanup | `false` |
| `CLEANUP_GRACE_PERIOD` | Grace period (minutes) | `15` |

### Docker

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `DOCKER_WATCH_EVENTS` | Watch Docker events | `true` |
| `DOCKER_LABEL_PREFIX` | DNS label prefix | `dns.` |

### Traefik (when OPERATION_MODE=traefik)

| Variable | Description | Default |
|----------|-------------|---------|
| `TRAEFIK_API_URL` | Traefik API URL | `http://traefik:8080/api` |
| `TRAEFIK_API_USERNAME` | Traefik basic auth user | - |
| `TRAEFIK_API_PASSWORD` | Traefik basic auth pass | - |
| `TRAEFIK_LABEL_PREFIX` | Traefik label prefix | `traefik.` |

### DNS Defaults

| Variable | Description | Default |
|----------|-------------|---------|
| `DNS_DEFAULT_TYPE` | Default record type | `CNAME` |
| `DNS_DEFAULT_TTL` | Default TTL | `1` |
| `DNS_DEFAULT_PROXIED` | Default proxied status | `true` |
| `DNS_DEFAULT_MANAGE` | Default manage status | `true` |

### Webhooks

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_RETRY_ATTEMPTS` | Max retry attempts | `3` |
| `WEBHOOK_RETRY_DELAY` | Retry delay (ms) | `5000` |

## DNS Providers

### Cloudflare

```bash
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ZONE_NAME=example.com
CLOUDFLARE_ZONE_ID=optional-zone-id
CLOUDFLARE_ACCOUNT_ID=for-tunnels-support
```

### DigitalOcean

```bash
DO_API_TOKEN=your-api-token
DO_DOMAIN=example.com
```

### Route53

```bash
ROUTE53_ACCESS_KEY_ID=your-access-key
ROUTE53_SECRET_ACCESS_KEY=your-secret-key
ROUTE53_REGION=us-east-1
ROUTE53_ZONE_NAME=example.com
ROUTE53_HOSTED_ZONE_ID=optional-zone-id
```

### Technitium (New in v2)

```bash
TECHNITIUM_URL=http://technitium:5380
TECHNITIUM_AUTH_METHOD=token  # or 'session'
TECHNITIUM_API_TOKEN=your-api-token
# OR for session auth:
TECHNITIUM_USERNAME=admin
TECHNITIUM_PASSWORD=password
TECHNITIUM_ZONE=example.com
```

## Multi-Provider Configuration (New in v2)

v2 supports **automatic multi-provider routing** based on zone matching. Configure multiple providers simultaneously, and TrafegoDNS will automatically route DNS records to the correct provider based on the hostname's domain suffix.

### How It Works

1. Configure all providers you need in your environment variables
2. TrafegoDNS detects all configured providers at startup
3. When processing hostnames, it matches each to the provider that manages its zone
4. Records are created/updated only in the appropriate provider

### Example: Split DNS (Public + Internal)

```yaml
# docker-compose.yml for multi-provider setup
services:
  trafegodns:
    image: trafegodns:v2
    environment:
      # Public domains -> Cloudflare
      - CLOUDFLARE_TOKEN=cf-api-token-here
      - CLOUDFLARE_ZONE=example.com

      # Internal domains -> Technitium (self-hosted DNS)
      - TECHNITIUM_URL=http://technitium:5380
      - TECHNITIUM_API_TOKEN=tech-token-here
      - TECHNITIUM_ZONE=home.lab

      # App settings
      - OPERATION_MODE=traefik
      - TRAEFIK_API_URL=http://traefik:8080/api
```

With this configuration:
- `app.example.com` → Cloudflare (matches `example.com` zone)
- `api.example.com` → Cloudflare (matches `example.com` zone)
- `nas.home.lab` → Technitium (matches `home.lab` zone)
- `plex.home.lab` → Technitium (matches `home.lab` zone)

### Zone Matching Rules

1. **Exact match**: If hostname equals zone name exactly
2. **Suffix match**: If hostname ends with `.{zone}`
3. **Longest match wins**: If multiple zones match, the longest (most specific) zone is selected
4. **No match = skip**: Hostnames that don't match any configured zone are skipped

### What Happens When a Provider Isn't Configured?

If `nas.home.lab` is detected but no provider manages `home.lab`:

```
[INFO] Skipping hostname - no matching zone configured
       hostname: "nas.home.lab"
       configuredZones: ["elabx.app"]
```

No errors, no failed API calls - the record is simply not created until you configure a provider for that zone.

### Override with Labels

You can override automatic routing using container labels:

```yaml
# Force specific provider by name
labels:
  - "dns.provider=cloudflare"

# Force specific provider by ID
labels:
  - "dns.provider.id=provider-uuid-here"

# Broadcast to multiple providers
labels:
  - "dns.providers=cloudflare,technitium"

# Broadcast to ALL providers
labels:
  - "dns.providers=all"
```

## Security Features

### Authentication

- **JWT Tokens**: Secure session management with configurable expiry
- **API Keys**: For programmatic access with granular permissions
- **Password Hashing**: bcrypt with automatic salt generation

### Authorization

- **Role-Based Access Control (RBAC)**:
  - `admin`: Full access to all resources
  - `user`: Read/write access to DNS, tunnels, webhooks
  - `readonly`: Read-only access

### API Security

- **Rate Limiting**: Configurable rate limits per endpoint
- **Helmet**: Security headers (CSP, HSTS, etc.)
- **CORS**: Configurable cross-origin policies
- **Input Validation**: Zod schemas for all inputs

### Audit Trail

All API operations are logged with:
- User/API key identification
- Action performed
- Resource affected
- Timestamp
- IP address

## Webhook Events

Configure webhooks to receive notifications for:

| Event | Description |
|-------|-------------|
| `dns.record.created` | New DNS record created |
| `dns.record.updated` | DNS record modified |
| `dns.record.deleted` | DNS record removed |
| `dns.record.orphaned` | Record marked as orphaned |
| `tunnel.created` | New tunnel created |
| `tunnel.deployed` | Tunnel config deployed |
| `system.sync.completed` | DNS sync completed |
| `system.error` | System error occurred |

## Database Schema

v2 uses SQLite with the following tables:

- `users`: User accounts
- `api_keys`: API key authentication
- `providers`: DNS provider configurations
- `dns_records`: Tracked DNS records
- `tunnels`: Cloudflare tunnel configs
- `ingress_rules`: Tunnel ingress rules
- `webhooks`: Webhook configurations
- `webhook_deliveries`: Delivery history
- `settings`: Runtime settings
- `audit_logs`: Audit trail

## Migration from v1

v2 automatically detects and migrates v1 data:

1. Reads `/config/data/dns-records.json` (v1 tracked records)
2. Imports records into SQLite database
3. Preserves orphaned status and timestamps
4. Creates backup of original file

No manual intervention required.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/providers/cloudflare
```

### Database Migrations

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio (database browser)
npm run db:studio
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.x
- **Framework**: Express 5
- **Database**: SQLite + Drizzle ORM
- **Validation**: Zod
- **Logging**: Pino
- **Testing**: Vitest
- **Authentication**: JWT + bcrypt
- **DNS SDKs**: Cloudflare, AWS SDK, native APIs
