# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrafegoDNS is a Node.js service that automatically manages DNS records based on Docker container configuration. It supports two operation modes:
- **Traefik mode**: Monitors Traefik API to detect hostnames from router rules
- **Direct mode**: Reads hostnames directly from container labels (works with any reverse proxy or none)

Supports Cloudflare, DigitalOcean, and AWS Route53 DNS providers.

## Build and Run Commands

```bash
# Install dependencies
npm install

# Run the application
npm start

# Build Docker image
docker build -f docker-s6/Dockerfile -t trafegodns .

# Run with Docker Compose (typical development)
docker compose up -d
```

## Architecture

### Entry Point and Service Wiring
`src/app.js` bootstraps the application by:
1. Creating the EventBus for decoupled communication
2. Initializing ConfigManager
3. Choosing between TraefikMonitor or DirectDNSManager based on OPERATION_MODE
4. Starting DockerMonitor for container event watching
5. Starting the appropriate monitor's polling loop

### Core Components

**Event-Driven Architecture** (`src/events/`)
- `EventBus.js`: Pub/sub implementation for decoupled component communication
- `EventTypes.js`: Constants for all event types (TRAEFIK_ROUTERS_UPDATED, DNS_RECORDS_UPDATED, etc.)
- Components publish events rather than calling each other directly

**DNS Providers** (`src/providers/`)
- `base.js`: Abstract DNSProvider class defining the interface
- `factory.js`: Creates provider instances based on DNS_PROVIDER env var
- Each provider (cloudflare/, digitalocean/, route53/) has:
  - `provider.js`: Main implementation extending DNSProvider
  - `converter.js`: Format conversion to provider API
  - `validator.js`: Record validation logic

**Services** (`src/services/`)
- `DNSManager.js`: Central DNS record orchestration, subscribes to TRAEFIK_ROUTERS_UPDATED events
- `DirectDNSManager.js`: Extracts hostnames from container labels (dns.hostname, dns.domain, etc.)
- `TraefikMonitor.js`: Polls Traefik API for router hostnames
- `DockerMonitor.js`: Watches Docker events and maintains container label cache
- `StatusReporter.js`: Displays configuration on startup

**Configuration** (`src/config/`)
- `ConfigManager.js`: Loads all settings from environment, validates provider config, manages IP cache
- `EnvironmentLoader.js`: Helper for reading env vars with type coercion and Docker secrets support

**Utilities** (`src/utils/`)
- `recordTracker.js`: Persists managed DNS records to `/config/data/dns-records.json` for cleanup tracking
- `dns.js`: Extracts DNS config from container labels with precedence (provider-specific > generic > defaults)
- `logger.js`: Configurable logging (ERROR, WARN, INFO, DEBUG, TRACE)

### Data Flow

1. DockerMonitor watches container events and publishes DOCKER_LABELS_UPDATED
2. TraefikMonitor/DirectDNSManager polls periodically and extracts hostnames
3. On hostname changes, publishes TRAEFIK_ROUTERS_UPDATED with hostnames and labels
4. DNSManager receives event, processes each hostname:
   - Extracts DNS config from labels (type, content, ttl, proxied)
   - Calls provider.batchEnsureRecords() to create/update records
   - Tracks records in RecordTracker for cleanup
5. If CLEANUP_ORPHANED=true, removes records no longer in active hostnames (with grace period)

### Label System

Labels follow precedence: `dns.<provider>.<setting>` > `dns.<setting>` > defaults

Key labels:
- `dns.hostname`: Comma-separated hostnames (direct mode)
- `dns.type`: Record type (A, AAAA, CNAME, MX, TXT, SRV, CAA)
- `dns.content`: Record value
- `dns.proxied`: Cloudflare proxy setting
- `dns.skip` / `dns.manage`: Control whether to manage DNS

### Docker Image

Uses s6-overlay for process supervision. The Dockerfile (`docker-s6/Dockerfile`) is a multi-stage build:
1. Dependencies stage: generates package-lock.json and installs deps
2. Build stage: copies source
3. Production stage: adds s6-overlay, creates abc user for PUID/PGID support

Configuration persists to `/config` volume.

## Key Environment Variables

- `OPERATION_MODE`: traefik (default) or direct
- `DNS_PROVIDER`: cloudflare, digitalocean, or route53
- `CLOUDFLARE_TOKEN`, `CLOUDFLARE_ZONE`: Cloudflare credentials
- `DO_TOKEN`, `DO_DOMAIN`: DigitalOcean credentials
- `ROUTE53_ACCESS_KEY`, `ROUTE53_SECRET_KEY`, `ROUTE53_ZONE`: AWS credentials
- `CLEANUP_ORPHANED`: Enable automatic removal of orphaned DNS records
- `CLEANUP_GRACE_PERIOD`: Minutes to wait before deleting orphaned records (default: 15)
- `LOG_LEVEL`: ERROR, WARN, INFO, DEBUG, TRACE

---

## TrafegoDNS v2 (TypeScript Rewrite)

The `v2/` directory contains a complete rewrite with TypeScript, REST API, SQLite database, and React web UI.

### v2 Technology Stack

| Component | Technology |
|-----------|------------|
| Backend Runtime | Node.js 20+ LTS |
| Language | TypeScript 5.3+ |
| HTTP Framework | Express 5 |
| Database | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| Validation | Zod |
| Logging | Pino |
| Frontend | React 18 + Vite + TailwindCSS |
| State Management | Zustand + TanStack Query |

### v2 Build Commands

```bash
# Install dependencies
cd v2 && npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Build Docker image (v2)
docker build -f v2/Dockerfile -t trafegodns:v2 .

# GitHub Actions: PR Test Build (v2)
gh workflow run "PR Test Build" --repo elmerfds/TrafegoDNS --ref feat/v2-rewrite -f pr_number=<PR_NUM> -f version=v2
```

### v2 Directory Structure

```
v2/
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Express setup
│   ├── core/
│   │   ├── EventBus.ts             # Typed pub/sub events
│   │   ├── ServiceContainer.ts     # Dependency injection
│   │   ├── Logger.ts               # Pino logger setup
│   │   └── Application.ts          # Main orchestrator
│   ├── config/
│   │   └── ConfigManager.ts        # Central configuration
│   ├── database/
│   │   ├── connection.ts           # SQLite connection
│   │   ├── schema/                 # Drizzle table definitions
│   │   └── migrations/             # Schema migrations
│   ├── providers/
│   │   ├── base/DNSProvider.ts     # Abstract provider interface
│   │   ├── cloudflare/             # + Tunnel support
│   │   ├── digitalocean/
│   │   ├── route53/
│   │   └── technitium/             # NEW: Technitium provider
│   ├── services/
│   │   ├── DNSManager.ts           # DNS orchestration
│   │   ├── TunnelManager.ts        # Cloudflare Tunnels
│   │   ├── WebhookService.ts       # Webhook dispatch
│   │   ├── AuditService.ts         # Event audit logging
│   │   └── SettingsService.ts      # Runtime settings
│   ├── monitors/
│   │   ├── TraefikMonitor.ts
│   │   ├── DirectMonitor.ts
│   │   └── DockerMonitor.ts
│   ├── api/
│   │   ├── middleware/             # Auth, rate limit, audit
│   │   ├── routes/                 # API route definitions
│   │   └── controllers/            # Request handlers
│   └── migration/
│       └── V1Migrator.ts           # v1 -> v2 migration
└── web/                            # React SPA
    └── src/
        ├── pages/                  # Dashboard, DNS, Providers, etc.
        ├── components/             # UI components
        ├── api/                    # API client (TanStack Query)
        └── stores/                 # Zustand stores
```

### v2 Key Features

- **REST API**: All operations via `/api/v1/*` endpoints
- **Web UI**: React SPA with dark mode support at root path
- **SQLite Database**: Persistent storage with Drizzle ORM migrations
- **JWT Auth**: Username/password login + API keys
- **Audit Logging**: All mutations logged with user tracking
- **Webhooks**: Event notifications with retry logic
- **Technitium DNS**: New provider support
- **Cloudflare Tunnels**: Zero Trust tunnel management
- **v1 Migration**: Automatic import of existing dns-records.json

### v2 API Endpoints

```
POST   /api/v1/auth/login           # Login (returns JWT)
GET    /api/v1/auth/me              # Current user
POST   /api/v1/auth/api-keys        # Create API key

GET    /api/v1/dns/records          # List records (filterable)
POST   /api/v1/dns/records          # Create record
PUT    /api/v1/dns/records/:id      # Update record
DELETE /api/v1/dns/records/:id      # Delete record
POST   /api/v1/dns/records/sync     # Force sync

GET    /api/v1/providers            # List providers
POST   /api/v1/providers            # Create provider
POST   /api/v1/providers/:id/test   # Test connection

GET    /api/v1/tunnels              # List tunnels
POST   /api/v1/tunnels/:id/deploy   # Deploy tunnel config

GET    /api/v1/webhooks             # List webhooks
POST   /api/v1/webhooks/:id/test    # Test webhook

GET    /api/v1/health               # Health check
GET    /api/v1/health/audit         # Audit logs
GET    /api/v1/settings             # Application settings
```

### v2 Testing Steps

1. **Build and Deploy**
   ```bash
   # Trigger PR Test Build for v2
   gh workflow run "PR Test Build" --repo elmerfds/TrafegoDNS --ref feat/v2-rewrite -f pr_number=363 -f version=v2

   # Deploy via Komodo (if using)
   # Stack: trafegodns-test, Image: ghcr.io/elmerfds/trafegodns:pr-363
   ```

2. **Login to Web UI**
   - Navigate to `http://<host>:3070` (or configured port)
   - Default credentials from env vars or admin/admin

3. **Test Provider Setup**
   - Go to Providers page
   - Add a provider (Cloudflare, etc.)
   - Test connection button should succeed

4. **Test Auto-Discovery**
   - Start a container with labels:
     ```yaml
     labels:
       - "traefik.http.routers.app.rule=Host(`app.example.com`)"
     ```
   - Check DNS Records page for new record
   - Check Notifications bell icon (should show "Created DNS Record")
   - Check Audit page for creation event

5. **Test Search**
   - Go to DNS Records page
   - Use search box to filter by hostname
   - Verify filtering works correctly

6. **Test Settings**
   - Go to Settings page
   - Modify a setting (e.g., polling interval)
   - Verify setting persists after refresh

### v2 Environment Variables

Additional v2-specific variables:
- `AUTH_JWT_SECRET`: Secret for JWT tokens (auto-generated if not set)
- `AUTH_DEFAULT_ADMIN_USERNAME`: Initial admin username (default: admin)
- `AUTH_DEFAULT_ADMIN_PASSWORD`: Initial admin password (default: admin)
- `WEB_PORT`: Web UI port (default: 3070)
- `DATABASE_PATH`: SQLite database path (default: /config/data/trafegodns.db)
