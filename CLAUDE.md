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
