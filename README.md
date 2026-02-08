# TrafegoDNS

<div align="center">
  <img src="https://raw.githubusercontent.com/elmerfds/TrafegoDNS/main/logo/logo.png" alt="TrafegoDNS Logo" width="200" height="200">

  **Automatic DNS record management for Docker containers**

  [![Docker Pulls](https://img.shields.io/docker/pulls/eafxx/trafegodns)](https://hub.docker.com/r/eafxx/trafegodns)
  [![GitHub Release](https://img.shields.io/github/v/release/elmerfds/TrafegoDNS)](https://github.com/elmerfds/TrafegoDNS/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
</div>

TrafegoDNS automatically manages DNS records based on your Docker container configuration. It monitors containers via Traefik integration or direct Docker labels and keeps your DNS providers in sync — with a full Web UI, REST API, and support for 7 DNS providers.

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
- [RFC 2136 (Dynamic DNS) Setup](#rfc-2136-dynamic-dns-setup)
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
- **Multi-Provider** — Support for 7 DNS providers simultaneously (up from 3), including self-hosted options
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
- 7 DNS providers: Cloudflare, DigitalOcean, Route 53, Technitium, AdGuard Home, Pi-hole, RFC 2136 (BIND9, PowerDNS, Knot, etc.)
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
| **RFC 2136** | A, AAAA, CNAME, MX, TXT, SRV, CAA, NS | Dynamic DNS updates, TSIG auth, works with BIND9/PowerDNS/Knot/Windows DNS |

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
| **RFC 2136** | DNS Server, Zone, TSIG Key Name + Algorithm + Secret (optional) |

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

TrafegoDNS supports three authentication modes controlled by the `AUTH_MODE` environment variable:

| Mode | Description |
|------|-------------|
| `local` (default) | Username/password login with JWT tokens |
| `oidc` | Single Sign-On via OpenID Connect (Authelia, Keycloak, Authentik, etc.) |
| `none` | Authentication disabled — all users get full admin access |

### Local Authentication

- **Login**: `POST /api/v1/auth/login` with `username` and `password`
- **Token**: Include in requests as `Authorization: Bearer <token>`
- **API Keys**: Create long-lived API keys via the Web UI or API for automation
- **Roles**: `admin` (full access), `user` (manage DNS), `readonly` (view only)

#### Default Credentials

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| Username | `admin` | `DEFAULT_ADMIN_USERNAME` |
| Password | `admin` | `DEFAULT_ADMIN_PASSWORD` |
| Email | `admin@localhost` | `DEFAULT_ADMIN_EMAIL` |

> **Important**: Change the default admin password after first login, or set it via environment variable before first start.

### OpenID Connect (OIDC) / Single Sign-On

TrafegoDNS supports SSO via any standard OpenID Connect provider using the **Backend-for-Frontend (BFF) pattern** — all OIDC logic runs server-side with PKCE for security. No browser-side OIDC library is needed.

**Supported providers**: Authelia, Keycloak, Authentik, Dex, Auth0, Okta, Azure AD/Entra ID, and any OIDC-compliant provider.

#### Quick Setup

1. Register TrafegoDNS as a client/application in your OIDC provider
2. Set the redirect URI to: `https://your-trafegodns-host/api/v1/auth/oidc/callback`
3. Configure the environment variables below

#### Docker Compose Example

```yaml
services:
  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    environment:
      AUTH_MODE: oidc
      OIDC_ISSUER_URL: https://auth.example.com   # Your OIDC provider
      OIDC_CLIENT_ID: trafegodns
      OIDC_CLIENT_SECRET: your-client-secret       # Or use Docker secrets
      OIDC_REDIRECT_URI: https://dns.example.com/api/v1/auth/oidc/callback
      OIDC_ADMIN_GROUPS: admins,dns-admins          # Groups that get admin role
      OIDC_USER_GROUPS: users                       # Groups that get user role
      # OIDC_ALLOW_LOCAL_LOGIN: true                # Show local login alongside SSO
    volumes:
      - ./data:/config/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

#### Authelia Example

In your Authelia `configuration.yml`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: trafegodns
        client_name: TrafegoDNS
        client_secret: '$pbkdf2-sha512$...'  # Generate with authelia crypto hash generate pbkdf2
        redirect_uris:
          - https://dns.example.com/api/v1/auth/oidc/callback
        scopes:
          - openid
          - profile
          - email
          - groups
        authorization_policy: two_factor
```

#### How It Works

1. User clicks **"Sign in with SSO"** on the login page
2. Backend generates a PKCE challenge and redirects to the OIDC provider
3. User authenticates at the provider (Authelia, Keycloak, etc.)
4. Provider redirects back to `/api/v1/auth/oidc/callback`
5. Backend exchanges the code for tokens, fetches user info
6. Backend maps group claims to app roles (admin/user/readonly)
7. Backend issues a TrafegoDNS JWT cookie and redirects to the dashboard

#### Group-to-Role Mapping

Configure which OIDC groups map to which TrafegoDNS roles:

| Variable | Role | Priority |
|----------|------|----------|
| `OIDC_ADMIN_GROUPS` | `admin` | Highest |
| `OIDC_USER_GROUPS` | `user` | Medium |
| `OIDC_READONLY_GROUPS` | `readonly` | Low |
| `OIDC_DEFAULT_ROLE` | Fallback | If no groups match |

Roles are updated on every login to reflect current group membership. If a user belongs to multiple groups, the highest-priority role wins.

#### User Management

- **Auto-creation**: New OIDC users are automatically created in the database on first login (disable with `OIDC_AUTO_CREATE_USERS=false`)
- **Email linking**: If an existing local user has the same email as the OIDC user, the accounts are automatically linked
- **Password**: OIDC users cannot set or change local passwords — they authenticate exclusively through the identity provider
- **Mixed mode**: Set `OIDC_ALLOW_LOCAL_LOGIN=true` to show both SSO and local credential forms on the login page

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
| `AUTH_MODE` | Authentication mode: `local`, `oidc`, or `none` | `local` |
| `AUTH_DISABLED` | Disable authentication (same as `AUTH_MODE=none`) | `false` |
| `JWT_SECRET` | JWT signing secret | Auto-generated |
| `JWT_EXPIRES_IN` | JWT token expiry | `24h` |
| `ENCRYPTION_KEY` | Credential encryption key | Auto-generated |
| `DEFAULT_ADMIN_USERNAME` | Initial admin username | `admin` |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password | `admin` |
| `DEFAULT_ADMIN_EMAIL` | Initial admin email | `admin@localhost` |
| `GLOBAL_API_KEY` | Master API key for programmatic access (min 32 chars) | - |

### OIDC / SSO (when `AUTH_MODE=oidc`)

| Variable | Description | Default |
|----------|-------------|---------|
| `OIDC_ISSUER_URL` | **Required.** OIDC provider's issuer URL | - |
| `OIDC_CLIENT_ID` | **Required.** OAuth2 client ID | - |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret (supports Docker secrets) | - |
| `OIDC_REDIRECT_URI` | **Required.** Callback URL (`https://host/api/v1/auth/oidc/callback`) | - |
| `OIDC_SCOPES` | Space-separated OIDC scopes | `openid profile email groups` |
| `OIDC_ALLOW_LOCAL_LOGIN` | Show local login form alongside SSO | `false` |
| `OIDC_AUTO_CREATE_USERS` | Create user in DB on first OIDC login | `true` |
| `OIDC_DEFAULT_ROLE` | Default role when no group mapping matches | `user` |
| `OIDC_GROUP_CLAIM` | Claim name for group membership | `groups` |
| `OIDC_ADMIN_GROUPS` | Comma-separated groups → admin role | - |
| `OIDC_USER_GROUPS` | Comma-separated groups → user role | - |
| `OIDC_READONLY_GROUPS` | Comma-separated groups → readonly role | - |
| `OIDC_LOGOUT_URL` | RP-initiated logout URL | - |

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

TrafegoDNS v2 includes full Cloudflare Zero Trust tunnel management — create tunnels, manage ingress routes, and optionally auto-manage tunnel routes from your container lifecycle, just like DNS records.

### Requirements

- A **Cloudflare provider** configured in TrafegoDNS
- The API token must have the **Cloudflare Tunnel** permission (and **Account ID** set in the provider config)

### Manual Tunnel Management

From the **Tunnels** page in the Web UI:

1. **Create a tunnel** — after creation, the connector token and `docker run` / `docker-compose` commands are displayed for running `cloudflared`
2. **Add ingress rules** — route hostnames to backend services (e.g., `app.example.com` → `http://traefik:80`)
3. **Edit / delete rules** — modify or remove routes as needed
4. **Deploy** — push the current configuration to Cloudflare

You can also retrieve the connector token at any time from the tunnel detail view.

### Tunnel Auto-Management

TrafegoDNS can automatically create and remove tunnel ingress rules based on your running containers — the same lifecycle as DNS records. When a container starts, its hostname gets a tunnel route; when it stops, the route is removed after the grace period.

#### Global Settings

Configure auto-management from the **Settings** page under the **Tunnels** tab:

| Setting | Options | Description |
|---------|---------|-------------|
| **Tunnel Mode** | `off`, `all`, `labeled` | Controls auto-management behavior |
| **Default Tunnel** | *(tunnel name)* | Which tunnel to route hostnames through |
| **Default Service URL** | *(URL)* | Backend service for tunnel routes (e.g., `http://traefik:80`) |

#### Tunnel Modes

**`off`** (default) — No auto-management. Tunnels and routes are manual only.

**`all`** — Every hostname discovered by TrafegoDNS is automatically routed through the tunnel. This is the easiest setup for a typical Traefik configuration — set the three settings and every container gets a tunnel route with zero labels:

```yaml
# Settings page configuration:
# Tunnel Mode: all
# Default Tunnel: my-tunnel
# Default Service URL: http://traefik:80
#
# That's it — every Traefik-discovered hostname gets a tunnel route automatically.
```

To **opt out** a specific container from tunnel routing in `all` mode:

```yaml
labels:
  - "dns.tunnel=false"
```

**`labeled`** — Only containers with the `dns.tunnel` label are routed through the tunnel. All other containers use normal DNS:

```yaml
# Only this container gets a tunnel route:
labels:
  - "dns.tunnel=true"
```

#### Per-Container Label Overrides

These labels override the global settings for individual containers:

| Label | Description | Example |
|-------|-------------|---------|
| `dns.tunnel=false` | Opt out of tunnel routing (in `all` mode) | Skip this container |
| `dns.tunnel=true` | Opt in to tunnel routing (in `labeled` mode) | Use default tunnel |
| `dns.tunnel=<name>` | Use a specific tunnel instead of the default | `dns.tunnel=staging-tunnel` |
| `dns.tunnel.service=<url>` | Override the backend service URL | `dns.tunnel.service=http://app:8080` |
| `dns.tunnel.path=<path>` | Route only a specific path | `dns.tunnel.path=/api` |
| `dns.tunnel.notlsverify=true` | Skip TLS verification to origin | For self-signed certs |
| `dns.tunnel.httphostheader=<host>` | Override the Host header | Custom host routing |

#### How Auto-Management Works

1. On each sync cycle, TrafegoDNS checks the `tunnel_mode` setting
2. For each hostname, it resolves the tunnel config from global settings + container labels
3. If a tunnel route should exist, `ensureIngressRule()` creates it (with `source: auto`) or reactivates it if orphaned
4. If a hostname is no longer active, its rule is marked as **orphaned**
5. After the **cleanup grace period** (same setting as DNS records), the orphaned rule and its CNAME record are removed from Cloudflare
6. If the container restarts within the grace period, the route is automatically restored

Auto-managed rules are shown with an **Auto** badge in the UI. Manual rules (`source: api`) are never automatically removed.

#### Example: Full Traefik + Tunnel Setup

```yaml
services:
  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - OPERATION_MODE=traefik
      - TRAEFIK_API_URL=http://traefik:8080/api
      - CLEANUP_ORPHANED=true
      - DEFAULT_ADMIN_PASSWORD=changeme
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/config

  # After starting:
  # 1. Add your Cloudflare provider (with Account ID) via the Providers page
  # 2. Create a tunnel via the Tunnels page
  # 3. Start cloudflared using the connector token shown after creation
  # 4. Go to Settings > Tunnels and set:
  #    - Tunnel Mode: all
  #    - Default Tunnel: <your-tunnel-name>
  #    - Default Service URL: http://traefik:80
  #
  # Every container with a Traefik Host rule will now automatically get
  # both a DNS record AND a tunnel ingress route.

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}
    restart: unless-stopped
```

### Tunnel API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/tunnels` | List all tunnels |
| `POST` | `/api/v1/tunnels` | Create a tunnel |
| `GET` | `/api/v1/tunnels/:id` | Get tunnel detail with ingress rules |
| `DELETE` | `/api/v1/tunnels/:id` | Delete a tunnel |
| `GET` | `/api/v1/tunnels/:id/token` | Get connector token (admin only) |
| `GET` | `/api/v1/tunnels/:id/ingress` | List ingress rules |
| `POST` | `/api/v1/tunnels/:id/ingress` | Add an ingress rule |
| `PUT` | `/api/v1/tunnels/:id/ingress/:hostname` | Update an ingress rule |
| `DELETE` | `/api/v1/tunnels/:id/ingress/:hostname` | Remove an ingress rule |
| `PUT` | `/api/v1/tunnels/:id/config` | Update full tunnel config |
| `POST` | `/api/v1/tunnels/:id/deploy` | Deploy tunnel to Cloudflare |

## RFC 2136 (Dynamic DNS) Setup

TrafegoDNS supports [RFC 2136](https://datatracker.ietf.org/doc/html/rfc2136) dynamic DNS updates, allowing it to manage records on any compliant authoritative DNS server — including **BIND9**, **PowerDNS**, **Knot DNS**, and **Windows DNS Server**.

### How It Works

RFC 2136 defines a standard protocol for dynamically updating DNS zones. TrafegoDNS uses the `nsupdate` and `dig` utilities (bundled in the Docker image) to send signed update commands to your DNS server. Authentication is handled via **TSIG** (Transaction Signature) — a shared-secret mechanism built into the DNS protocol.

### BIND9 Setup Example

**1. Generate a TSIG key** on your BIND9 server:

```bash
tsig-keygen -a hmac-sha256 trafegodns-key
```

This outputs a key block like:

```
key "trafegodns-key" {
    algorithm hmac-sha256;
    secret "BASE64_SECRET_HERE";
};
```

**2. Configure BIND9** — add the key and allow dynamic updates for your zone in `named.conf`:

```
key "trafegodns-key" {
    algorithm hmac-sha256;
    secret "BASE64_SECRET_HERE";
};

zone "example.com" {
    type primary;
    file "/var/lib/bind/example.com.zone";
    allow-update { key "trafegodns-key"; };
};
```

**3. Restart BIND9** to apply the configuration:

```bash
sudo systemctl restart named
# or
sudo rndc reconfig
```

**4. Add the provider in TrafegoDNS** — go to the **Providers** page in the Web UI and click **Add Provider**, then select **RFC 2136** and fill in:

| Field | Value | Description |
|-------|-------|-------------|
| **DNS Server** | `192.168.1.10` | Hostname or IP of your BIND9 server |
| **Port** | `53` | DNS port (default: 53) |
| **Zone** | `example.com` | The zone to manage |
| **TSIG Key Name** | `trafegodns-key` | Must match the key name in `named.conf` |
| **TSIG Algorithm** | `hmac-sha256` | Must match the algorithm in `named.conf` |
| **TSIG Secret** | `BASE64_SECRET_HERE` | The base64-encoded secret from `tsig-keygen` |

> **Note**: TSIG authentication is optional but strongly recommended. Without it, you would need to allow updates by IP address (`allow-update { 172.18.0.0/16; };`), which is less secure.

### Docker Compose Example (BIND9 + TrafegoDNS)

```yaml
services:
  bind9:
    image: ubuntu/bind9:9.18-22.04_beta
    restart: unless-stopped
    ports:
      - "53:53/tcp"
      - "53:53/udp"
    volumes:
      - bind-data:/var/lib/bind
      - ./named.conf:/etc/bind/named.conf:ro
      - ./example.com.zone:/var/lib/bind/example.com.zone

  trafegodns:
    image: ghcr.io/elmerfds/trafegodns:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - trafegodns-data:/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - OPERATION_MODE=direct

volumes:
  bind-data:
  trafegodns-data:
```

After deploying, open the TrafegoDNS Web UI and add your BIND9 server as an RFC 2136 provider using the credentials above.

### Other DNS Servers

RFC 2136 is a standard protocol, so TrafegoDNS works with any compliant server:

- **PowerDNS**: Enable the `dnsupdate` feature and configure TSIG keys via the API or `pdnsutil`
- **Knot DNS**: Configure `acl` with TSIG in `knot.conf` and set `update: on` for the zone
- **Windows DNS Server**: Enable dynamic updates on the zone and configure TSIG keys via `dnscmd`

### Supported Record Types

RFC 2136 supports the full range of record types: **A**, **AAAA**, **CNAME**, **MX**, **TXT**, **SRV**, **CAA**, and **NS**.

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
