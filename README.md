# TrafegoDNS

<div align="center">
  <img src="https://raw.githubusercontent.com/elmerfds/TrafegoDNS/main/logo/logo.png" alt="TrafegoDNS Logo" width="200" height="200">

  **Automatic DNS record management for Docker containers**

  [![Docker Pulls](https://img.shields.io/docker/pulls/eafxx/trafegodns)](https://hub.docker.com/r/eafxx/trafegodns)
  [![GitHub Release](https://img.shields.io/github/v/release/elmerfds/TrafegoDNS)](https://github.com/elmerfds/TrafegoDNS/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
</div>

TrafegoDNS automatically manages DNS records based on your Docker container configuration. It monitors containers via Traefik integration or direct Docker labels and keeps your DNS providers in sync — with a full Web UI, REST API, and support for 6 DNS providers.

## Table of Contents

- [What's New in v2](#whats-new-in-v2)
- [Features](#features)
- [Quick Start](#quick-start)
- [Web UI](#web-ui)
- [Operation Modes](#operation-modes)
- [Supported DNS Providers](#supported-dns-providers)
- [REST API](#rest-api)
- [Authentication](#authentication)
- [Container Labels](#container-labels)
- [Environment Variables](#environment-variables)
- [Orphaned Record Cleanup](#orphaned-record-cleanup)
- [Cloudflare Tunnels](#cloudflare-tunnels)
- [Webhooks](#webhooks)
- [Migration from v1](#migration-from-v1)
- [Supported Architectures](#supported-architectures)
- [Container Registries](#container-registries)
- [Docker Secrets](#docker-secrets)
- [Building from Source](#building-from-source)
- [Development](#development)
- [Licence](#licence)

## What's New in v2

TrafegoDNS v2 is a complete rewrite in TypeScript with significant new capabilities:

- **Web UI** — Full-featured React dashboard for managing DNS records, providers, tunnels, webhooks, and settings
- **REST API** — Comprehensive API with 80+ endpoints for complete programmatic control
- **SQLite Database** — Persistent storage replacing the JSON file tracking system
- **Multi-Provider** — Support for 6 DNS providers simultaneously (up from 3), including self-hosted options
- **Authentication** — JWT-based auth with user management, roles, and API keys
- **Cloudflare Tunnels** — Create and manage Zero Trust tunnels directly from the UI
- **Webhooks** — Event-driven notifications for DNS changes, sync events, and errors
- **Audit Logging** — Full audit trail of all mutations with user tracking
- **Hostname Overrides** — Override DNS settings per hostname via the UI
- **Preserved Hostnames** — Manage protected hostnames via the UI instead of environment variables

## Features

- Automatic DNS record management based on container configuration
- Support for Traefik integration and direct container label mode (works with any reverse proxy)
- Real-time monitoring of Docker container events
- Support for multiple DNS record types (A, AAAA, CNAME, MX, TXT, SRV, CAA, NS)
- 6 DNS providers: Cloudflare, DigitalOcean, Route 53, Technitium, AdGuard Home, Pi-hole
- Full Web UI with dark mode for managing all aspects of DNS
- REST API with JWT authentication and API key support
- Cloudflare Tunnel management (Zero Trust)
- Webhook notifications with configurable events and retry logic
- Automatic public IP detection for apex domains
- Orphaned record cleanup with configurable grace period
- Audit logging for all changes
- Multi-architecture Docker images (amd64, arm64, armv7)
- PUID/PGID support for proper file permissions
- Docker Secrets support for sensitive credentials

## Quick Start

### Docker Compose

```yaml
services:
  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    container_name: trafegodns
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Operation mode
      - OPERATION_MODE=traefik        # Options: traefik, direct

      # Traefik API (for traefik mode)
      - TRAEFIK_API_URL=http://traefik:8080/api

      # Authentication
      - DEFAULT_ADMIN_USERNAME=admin
      - DEFAULT_ADMIN_PASSWORD=changeme
      - JWT_SECRET=your-secret-key    # Auto-generated if not set

      # Application settings
      - LOG_LEVEL=info
      - CLEANUP_ORPHANED=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/config
```

After starting, open `http://localhost:3000` to access the Web UI. Login with your admin credentials, then add DNS providers via the **Providers** page.

> **Note**: In v2, DNS providers are configured through the Web UI or REST API — not environment variables. The Quick Start above only sets the operation mode and auth; you'll add your Cloudflare/DigitalOcean/Route53/etc. credentials through the Providers page.

### Direct Mode Example

```yaml
services:
  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    container_name: trafegodns
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - OPERATION_MODE=direct
      - DEFAULT_ADMIN_PASSWORD=changeme
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/config

  example-app:
    image: nginx
    labels:
      - "dns.hostname=app.example.com"
      - "dns.type=A"
      - "dns.content=203.0.113.10"
```

## Web UI

TrafegoDNS v2 includes a full-featured web interface at `http://<host>:3000`:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview of DNS records, providers, and system status |
| **DNS Records** | View, search, filter, create, edit, and delete DNS records |
| **Providers** | Add and manage DNS providers, test connections |
| **Tunnels** | Create and manage Cloudflare Zero Trust tunnels |
| **Webhooks** | Configure webhook endpoints for event notifications |
| **Users** | Manage users, roles, and permissions (admin only) |
| **Settings** | Configure application settings (polling, cleanup, defaults) |
| **Logs** | Real-time application log viewer |
| **API Docs** | Interactive API reference documentation |
| **Profile** | Update your password and preferences |

## Operation Modes

### Traefik Mode (Default)

Monitors the Traefik API to detect hostnames from router rules:

```yaml
environment:
  - OPERATION_MODE=traefik
  - TRAEFIK_API_URL=http://traefik:8080/api
```

Hostnames are defined using standard Traefik Host rules:

```yaml
services:
  my-app:
    image: my-image
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.my-app.rule=Host(`app.example.com`)"
      - "dns.proxied=false"
```

### Direct Mode

Reads hostnames directly from container labels. Works with any reverse proxy (NGINX, Apache, HAProxy, Caddy) or no reverse proxy at all:

```yaml
environment:
  - OPERATION_MODE=direct
```

Hostname formats supported:

**Comma-separated hostnames:**
```yaml
labels:
  - "dns.hostname=app.example.com,api.example.com"
```

**Domain + subdomain combination:**
```yaml
labels:
  - "dns.domain=example.com"
  - "dns.subdomain=app,api,admin"
```

**Apex domain:**
```yaml
labels:
  - "dns.domain=example.com"
  - "dns.use_apex=true"
```

**Individual host labels:**
```yaml
labels:
  - "dns.host.1=app.example.com"
  - "dns.host.2=api.example.com"
```

## Supported DNS Providers

Providers are added and managed via the Web UI or REST API.

| Provider | Record Types | Features |
|----------|-------------|----------|
| **Cloudflare** | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Proxy (orange cloud), tunnels, batch operations |
| **DigitalOcean** | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Full DNS management |
| **AWS Route 53** | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Batch operations, hosted zones |
| **Technitium DNS** | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Self-hosted, token or username/password auth |
| **AdGuard Home** | A, AAAA, CNAME | Self-hosted, DNS rewrites |
| **Pi-hole** | A, AAAA, CNAME | Self-hosted, local DNS records |

### Provider Credentials

Each provider requires specific credentials when adding via the UI:

| Provider | Required Fields |
|----------|----------------|
| **Cloudflare** | API Token, Zone Name |
| **DigitalOcean** | API Token, Domain |
| **Route 53** | Access Key ID, Secret Access Key, Hosted Zone ID, Region |
| **Technitium** | Server URL, Zone, Token *or* Username + Password |
| **AdGuard Home** | Server URL, Username, Password |
| **Pi-hole** | Server URL, Web Password |

## REST API

TrafegoDNS exposes a comprehensive REST API at `/api/v1/`. Full interactive documentation is available in the Web UI at the **API Docs** page.

### Endpoint Groups

| Group | Base Path | Description |
|-------|-----------|-------------|
| **Auth** | `/api/v1/auth` | Login, logout, API keys, profile |
| **DNS Records** | `/api/v1/dns/records` | CRUD, bulk operations, sync, import/export |
| **Providers** | `/api/v1/providers` | Provider management, connection testing, record discovery |
| **Tunnels** | `/api/v1/tunnels` | Cloudflare Tunnel management and deployment |
| **Webhooks** | `/api/v1/webhooks` | Webhook configuration, testing, delivery history |
| **Users** | `/api/v1/users` | User management (admin only) |
| **Settings** | `/api/v1/settings` | Application settings |
| **Audit** | `/api/v1/audit` | Audit log access (admin only) |
| **Health** | `/api/v1/health` | Health, readiness, and liveness probes |
| **Preserved Hostnames** | `/api/v1/preserved-hostnames` | Hostnames protected from cleanup |
| **Overrides** | `/api/v1/overrides` | Per-hostname DNS setting overrides |
| **Preferences** | `/api/v1/preferences` | User UI preferences |

### Example: Create a DNS Record

```bash
# Login
TOKEN=$(curl -s http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r '.token')

# Create an A record
curl -X POST http://localhost:3000/api/v1/dns/records \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "A",
    "name": "app.example.com",
    "content": "203.0.113.10",
    "ttl": 3600,
    "providerId": "your-provider-uuid"
  }'
```

## Authentication

TrafegoDNS uses JWT-based authentication:

- **Login**: `POST /api/v1/auth/login` with `username` and `password`
- **Token**: Include in requests as `Authorization: Bearer <token>`
- **API Keys**: Create long-lived API keys via the Web UI or API for automation
- **Roles**: `admin` (full access), `user` (manage DNS), `readonly` (view only)

### Default Credentials

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| Username | `admin` | `DEFAULT_ADMIN_USERNAME` |
| Password | `admin` | `DEFAULT_ADMIN_PASSWORD` |
| Email | `admin@localhost` | `DEFAULT_ADMIN_EMAIL` |

> **Important**: Change the default admin password after first login, or set it via environment variable before first start.

## Container Labels

Container labels control how TrafegoDNS creates DNS records. These work in both Traefik and Direct modes.

### Basic Labels

| Label | Description | Default |
|-------|-------------|---------|
| `dns.skip` | Skip DNS management for this container | `false` |
| `dns.manage` | Explicitly enable DNS management | Depends on `DNS_DEFAULT_MANAGE` |
| `dns.type` | Record type (A, AAAA, CNAME, MX, TXT, SRV, CAA) | `CNAME` (or `A` for apex) |
| `dns.content` | Record value (IP, hostname, etc.) | Auto-detected |
| `dns.ttl` | TTL in seconds | Provider default |
| `dns.proxied` | Cloudflare proxy (orange cloud) | `true` |
| `dns.priority` | Priority (MX, SRV) | - |
| `dns.weight` | Weight (SRV) | - |
| `dns.port` | Port (SRV) | - |
| `dns.flags` | Flags (CAA) | - |
| `dns.tag` | Tag (CAA) | - |

### Direct Mode Labels

| Label | Description |
|-------|-------------|
| `dns.hostname` | Comma-separated hostnames |
| `dns.domain` | Base domain |
| `dns.subdomain` | Comma-separated subdomains |
| `dns.use_apex` | Use apex domain (`true`/`false`) |
| `dns.host.N` | Individual hostnames (1, 2, 3...) |

### Label Precedence

1. Provider-specific labels (e.g., `dns.cloudflare.type`)
2. Generic DNS labels (e.g., `dns.type`)
3. Default values from settings

Provider-specific labels follow the pattern `dns.<provider>.<setting>`, e.g., `dns.cloudflare.proxied=false` or `dns.route53.ttl=300`.

## Environment Variables

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `OPERATION_MODE` | `traefik` or `direct` | `traefik` |
| `LOG_LEVEL` | `error`, `warn`, `info`, `debug`, `trace` | `info` |
| `API_PORT` | Web UI and API port | `3000` |
| `API_HOST` | Bind address | `0.0.0.0` |
| `DATA_DIR` | Data directory path | `/config/data` |
| `DATABASE_PATH` | SQLite database path | `{DATA_DIR}/trafegodns.db` |
| `POLL_INTERVAL` | Monitor poll interval (ms) | `60000` |

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | JWT signing secret | Auto-generated |
| `JWT_EXPIRES_IN` | JWT token expiry | `24h` |
| `ENCRYPTION_KEY` | Credential encryption key | Auto-generated |
| `DEFAULT_ADMIN_USERNAME` | Initial admin username | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password | `admin` |
| `DEFAULT_ADMIN_EMAIL` | Initial admin email | `admin@localhost` |

### Docker

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `WATCH_DOCKER_EVENTS` | Watch container events | `true` |
| `DNS_LABEL_PREFIX` | Label prefix for DNS config | `dns.` |

### Traefik

| Variable | Description | Default |
|----------|-------------|---------|
| `TRAEFIK_API_URL` | Traefik API endpoint | `http://traefik:8080/api` |
| `TRAEFIK_API_USERNAME` | Basic auth username | - |
| `TRAEFIK_API_PASSWORD` | Basic auth password | - |

### DNS Defaults

| Variable | Description | Default |
|----------|-------------|---------|
| `DNS_DEFAULT_TYPE` | Default record type | `CNAME` |
| `DNS_DEFAULT_TTL` | Default TTL (seconds) | `1` |
| `DNS_DEFAULT_PROXIED` | Cloudflare proxy default | `true` |
| `DNS_DEFAULT_MANAGE` | Auto-manage containers | `true` |

### IP Address

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_IP` | Manual public IPv4 | Auto-detected |
| `PUBLIC_IPV6` | Manual public IPv6 | Auto-detected |
| `IP_REFRESH_INTERVAL` | IP refresh interval (ms) | `3600000` |

### Cleanup

| Variable | Description | Default |
|----------|-------------|---------|
| `CLEANUP_ORPHANED` | Auto-remove orphaned records | `false` |
| `CLEANUP_GRACE_PERIOD` | Grace period (minutes) | `15` |

### DNS Routing

| Variable | Description | Default |
|----------|-------------|---------|
| `DNS_ROUTING_MODE` | `auto-with-fallback`, `primary-only`, `round-robin` | `auto-with-fallback` |
| `DNS_MULTI_PROVIDER_SAME_ZONE` | Allow multiple providers per zone | `true` |

### Webhooks

| Variable | Description | Default |
|----------|-------------|---------|
| `WEBHOOK_RETRY_ATTEMPTS` | Retry count on failure | `3` |
| `WEBHOOK_RETRY_DELAY` | Delay between retries (ms) | `5000` |

### User/Group Permissions

| Variable | Description | Default |
|----------|-------------|---------|
| `PUID` | User ID to run as | `1001` |
| `PGID` | Group ID to run as | `1001` |

## Orphaned Record Cleanup

When containers are removed, their DNS records can be automatically cleaned up:

```yaml
environment:
  - CLEANUP_ORPHANED=true
  - CLEANUP_GRACE_PERIOD=15  # Minutes before deletion
```

### How It Works

1. When a hostname is no longer associated with an active container, it's **marked as orphaned** but not immediately removed
2. After the grace period elapses, the record is deleted from both the DNS provider and the database
3. If the container comes back within the grace period, the record is automatically restored to active

### Managing via Web UI

In v2, you can also:
- View orphaned records with their remaining grace period on the **DNS Records** page (filter by status: "orphaned")
- Extend the grace period for specific records
- Manage **Preserved Hostnames** — hostnames protected from cleanup — via the dedicated UI page instead of environment variables

## Cloudflare Tunnels

TrafegoDNS v2 can create and manage Cloudflare Zero Trust tunnels:

- **Create tunnels** from the Web UI's Tunnels page
- **Configure ingress rules** to route traffic to your services
- **Deploy tunnel configuration** to Cloudflare with one click
- **View tunnel status** and manage connections

Tunnels require a Cloudflare provider with an API token that has the `Cloudflare Tunnel` permission.

## Webhooks

Configure webhooks to receive notifications when DNS events occur:

### Supported Events

| Event | Description |
|-------|-------------|
| `dns.record.created` | A new DNS record was created |
| `dns.record.updated` | An existing record was modified |
| `dns.record.deleted` | A record was removed |
| `dns.record.orphaned` | A record was marked as orphaned |
| `tunnel.created` | A Cloudflare tunnel was created |
| `tunnel.deployed` | A tunnel configuration was deployed |
| `tunnel.deleted` | A tunnel was removed |
| `system.sync.completed` | A DNS sync cycle completed |
| `system.error` | A system error occurred |

Webhooks include a configurable secret for payload verification and automatic retry on delivery failure.

## Migration from v1

TrafegoDNS v2 automatically migrates data from v1:

- **DNS record tracking** (`dns-records.json`) is imported into the SQLite database on first start
- **Container labels** are fully backwards-compatible — no changes needed
- **Operation modes** (traefik/direct) work the same way

### Breaking Changes

| Change | v1 | v2 |
|--------|----|----|
| **Port** | Not fixed (user-configured) | `3000` (configurable via `API_PORT`) |
| **Provider config** | Environment variables (`DNS_PROVIDER`, `CLOUDFLARE_TOKEN`, etc.) | Web UI / REST API |
| **Data storage** | JSON file (`dns-records.json`) | SQLite database |
| **Configuration** | Environment variables only | Web UI Settings page + environment variables |

> **Note**: While v1 environment variables for providers (like `CLOUDFLARE_TOKEN`) are no longer used for provider configuration, the application settings (like `OPERATION_MODE`, `LOG_LEVEL`, `CLEANUP_ORPHANED`) still work as environment variables.

## Supported Architectures

Multi-arch Docker images are published for:

- **amd64** — Standard 64-bit PCs and servers
- **arm64** — 64-bit ARM (Raspberry Pi 4/5, ARM servers)
- **armv7** — 32-bit ARM (Raspberry Pi 3 and older)

Docker automatically selects the correct architecture when pulling.

## Container Registries

Images are available from both Docker Hub and GitHub Container Registry:

### Docker Hub
```yaml
image: eafxx/trafegodns:latest
```

### GitHub Container Registry
```yaml
image: ghcr.io/elmerfds/trafegodns:latest
```

Both registries receive simultaneous updates and are functionally identical.

## Docker Secrets

Environment variables containing sensitive values (those ending in `_TOKEN`, `_KEY`, or `_PASSWORD`) support Docker Secrets. Append `_FILE` to the variable name and point to the secret file:

```yaml
secrets:
  jwt_secret:
    file: ./secrets/jwt_secret

services:
  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    secrets:
      - jwt_secret
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
```

## Building from Source

```bash
# Clone the repository
git clone https://github.com/elmerfds/TrafegoDNS.git
cd TrafegoDNS

# Install dependencies
cd v2 && npm install

# Build TypeScript backend
npm run build

# Build React frontend
cd web && npm install && npm run build

# Build Docker image
cd ../..
docker build -f v2/Dockerfile -t trafegodns:v2 .
```

## Development

### Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js 20+ / TypeScript 5 / Express 5 |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Validation | Zod |
| Logging | Pino |
| Frontend | React 18 + Vite + TailwindCSS |
| State | Zustand + TanStack Query |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Docker | Dockerode |
| Process Supervisor | s6-overlay |

### Approach
- Core concept, architecture, and management by the project author
- Implementation assistance from Claude AI
- A collaborative blend of human domain expertise with AI capabilities

### Inspiration
- [cloudflare-dns-swarm](https://github.com/MarlBurroW/cloudflare-dns-swarm)
- [docker-traefik-cloudflare-companion](https://github.com/tiredofit/docker-traefik-cloudflare-companion/)

## Licence

MIT
