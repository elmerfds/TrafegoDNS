# TrafegoDNS

<div align="center">
  <img src="https://raw.githubusercontent.com/elmerfds/TrafegoDNS/main/logo/logo.png" alt="TrafegoDNS Logo" width="200" height="200">
</div>

A service that automatically manages DNS records based on container configuration. Supports both Traefik integration and direct Docker container label mode, making it compatible with any web server or reverse proxy solution.

## Table of Contents

- [Features](#features)
- [Operation Modes](#operation-modes)
- [Supported DNS Providers](#supported-dns-providers)
- [Supported Architectures](#supported-architectures)
- [Container Registries](#container-registries)
- [Quick Start](#quick-start)
- [DNS Provider Configuration](#dns-provider-configuration)
  - [Cloudflare](#cloudflare)
  - [DigitalOcean](#digitalocean)
  - [Route53](#route53)
- [User/Group Permissions](#usergroup-permissions)
- [Service Labels](#service-labels)
  - [Basic Labels](#basic-labels-provider-agnostic)
  - [Provider-Specific Labels](#provider-specific-labels-override-provider-agnostic-labels)
  - [Type-Specific Labels](#type-specific-labels)
- [Label Precedence](#label-precedence)
- [Provider-Specific TTL Requirements](#provider-specific-ttl-requirements)
- [Usage Examples](#usage-examples)
- [Environment Variables](#environment-variables)
- [Automated Cleanup of Orphaned Records](#automated-cleanup-of-orphaned-records)
  - [Preserving Specific DNS Records](#preserving-specific-dns-records)
- [Manual Hostname Management](#manual-hostname-management)
- [DNS Record Tracking](#dns-record-tracking)
- [Configuration Storage](#configuration-storage)
- [DNS Management Modes](#dns-management-modes)
- [Logging System](#logging-system)
- [Performance Optimisation](#performance-optimisation)
- [Automatic Apex Domain Handling](#automatic-apex-domain-handling)
- [Using Docker Secrets](#using-docker-secrets)
- [Building from Source](#building-from-source)
- [Development](#development)
- [Licence](#licence)

## Features

- 🔄 Automatic DNS record management based on container configuration
- 🔀 Support for both Traefik integration and direct container label mode (works with NGINX, Apache, etc.)
- 👀 Real-time monitoring of Docker container events
- 🏷️ Support for multiple DNS record types (A, AAAA, CNAME, MX, TXT, SRV, CAA)
- 🌐 Automatic public IP detection for apex domains
- 🎛️ Fine-grained control with service-specific labels
- 💪 Fault-tolerant design with retry mechanisms
- 🧹 Optional cleanup of orphaned DNS records with preservation capabilities
- 📊 Optimised performance with DNS caching and batch processing
- 🖨️ Configurable logging levels for better troubleshooting
- 🔌 Multi-provider support with provider-agnostic label system
- 🔒 Preserves manually created DNS records using smart tracking system
- 🛡️ Support for explicitly preserving specific hostnames from cleanup
- 📝 Manual creation and management of hostnames independent of containers
- 🔐 PUID/PGID support for proper file permissions
- 💾 Persistent configuration storage in mounted volumes

## Operation Modes

TrafegoDNS supports two operation modes:

### Traefik Mode (Default)

In this mode, TrafegoDNS monitors the Traefik API to detect hostnames from router rules.

```yaml
environment:
  - OPERATION_MODE=traefik
  - TRAEFIK_API_URL=http://traefik:8080/api
```

With Traefik mode, you define hostnames using standard Traefik Host rules:

```yaml
services:
  my-app:
    image: my-image
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.my-app.rule=Host(`app.example.com`)"
      - "dns.proxied=false"  # Configure DNS settings
```

### Direct Mode

In this mode, TrafegoDNS operates independently of Traefik, directly reading hostnames from container labels. This allows it to run completely independently of any web server or reverse proxy, making it compatible with NGINX, Apache, HAProxy, or any other solution - or even with containers that don't use a reverse proxy at all. The only requirement is that services are deployed as Docker containers.

```yaml
environment:
  - OPERATION_MODE=direct
```

When using direct mode, you can specify hostnames using any of the following label formats:

1. Comma-separated hostnames:
   ```yaml
   services:
     my-app:
       image: my-image
       labels:
         - "dns.hostname=app.example.com,api.example.com"
         - "dns.proxied=false"  # Configure DNS settings
   ```

2. Domain and subdomain combination:
   ```yaml
   services:
     my-app:
       image: my-image
       labels:
         - "dns.domain=example.com"
         - "dns.subdomain=app,api,admin"
         - "dns.proxied=false"  # Configure DNS settings
   ```

3. Use apex domain:
   ```yaml
   services:
     my-app:
       image: my-image
       labels:
         - "dns.domain=example.com"
         - "dns.use_apex=true"
         - "dns.proxied=false"  # Configure DNS settings
   ```

4. Individual host labels:
   ```yaml
   services:
     my-app:
       image: my-image
       labels:
         - "dns.host.1=app.example.com"
         - "dns.host.2=api.example.com"
         - "dns.proxied=false"  # Configure DNS settings
   ```

All other DNS configuration labels work the same way as in Traefik mode.

## Supported DNS Providers

| Provider | Status | Implementation Details |
|:--------:|:------:|:----------------------:|
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat&logo=cloudflare&logoColor=white) | ![Stable](https://img.shields.io/badge/✓-Stable-success) | Full support for all record types and features |
| ![DigitalOcean](https://img.shields.io/badge/DigitalOcean-0080FF?style=flat&logo=digitalocean&logoColor=white) | ![Stable](https://img.shields.io/badge/✓-Stable-success) | Full support for all record types and features |
| ![AWS](https://img.shields.io/badge/Route53-FF9900?style=flat&logo=amazonaws&logoColor=white) | ![Stable](https://img.shields.io/badge/✓-Stable-success) | Full support for all record types and features |

## Supported Architectures

TrafegoDNS supports multiple architectures with multi-arch Docker images:

- **amd64**: Standard 64-bit PCs and servers
- **arm64**: 64-bit ARM devices (Raspberry Pi 4/5, newer ARM servers)
- **armv7**: 32-bit ARM devices (Raspberry Pi 3 and older)

Docker will automatically select the appropriate architecture when you pull the image.

## Container Registries

TrafegoDNS images are available from both Docker Hub and GitHub Container Registry.

Both registries receive simultaneous updates and are functionally identical. The GitHub Container Registry offers an alternative if you experience rate limiting or availability issues with Docker Hub.

### Docker Hub
```yaml
image: eafxx/trafegodns:latest
```

### GitHub Container Registry
```yaml
image: ghcr.io/elmerfds/trafegodns:latest
```

## Quick Start

### Docker Compose

```yaml
version: '3'

services:
  trafegodns:
    image: eafxx/trafegodns:latest
    container_name: trafegodns
    restart: unless-stopped
    environment:
      # User/Group Permissions (optional)
      - PUID=1000                # User ID to run as
      - PGID=1000                # Group ID to run as
      
      # Operation mode
      - OPERATION_MODE=traefik  # Options: traefik, direct
      
      # DNS Provider (choose one)
      - DNS_PROVIDER=cloudflare  # Options: cloudflare, digitalocean, route53
      
      # Cloudflare settings (if using Cloudflare)
      - CLOUDFLARE_TOKEN=your_cloudflare_api_token
      - CLOUDFLARE_ZONE=example.com
      
      # DigitalOcean settings (if using DigitalOcean)
      - DO_TOKEN=your_digitalocean_api_token
      - DO_DOMAIN=example.com
      
      # Route53 settings (if using Route53)
      - ROUTE53_ACCESS_KEY=your_aws_access_key
      - ROUTE53_SECRET_KEY=your_aws_secret_key
      - ROUTE53_ZONE=example.com
      # - ROUTE53_ZONE_ID=Z1234567890ABC  # Alternative to ROUTE53_ZONE
      # - ROUTE53_REGION=eu-west-2  # Optional, defaults to eu-west-2 (London)
      
      # Traefik API settings (for traefik mode)
      - TRAEFIK_API_URL=http://traefik:8080/api
      - LOG_LEVEL=INFO
      
      # DNS record management
      - CLEANUP_ORPHANED=true  # Set to true to automatically remove DNS records when containers are removed
      - PRESERVED_HOSTNAMES=static.example.com,api.example.com,*.admin.example.com  # Hostnames to preserve (even when orphaned)
      - MANAGED_HOSTNAMES=blog.example.com:A:192.168.1.10:3600:false,mail.example.com:MX:mail.example.com:3600:false  # Manually managed hostnames
      
      # API and network timeout settings
      - API_TIMEOUT=60000  # API request timeout in milliseconds (60 seconds)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/config   # Persistent configuration storage
    networks:
      - traefik-network
```

### Using Direct Mode Example

```yaml
version: '3'

services:
  trafegodns:
    image: eafxx/trafegodns:latest
    container_name: trafegodns
    restart: unless-stopped
    environment:
      # User/Group Permissions (optional)
      - PUID=1000                # User ID to run as
      - PGID=1000                # Group ID to run as
      
      # Operation mode - direct doesn't need Traefik
      - OPERATION_MODE=direct
      
      # DNS Provider
      - DNS_PROVIDER=cloudflare
      - CLOUDFLARE_TOKEN=your_cloudflare_api_token
      - CLOUDFLARE_ZONE=example.com
      
      # Application settings
      - LOG_LEVEL=INFO
      - CLEANUP_ORPHANED=true
      
      # API and network timeout settings
      - API_TIMEOUT=60000  # API request timeout in milliseconds (60 seconds)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/config   # Persistent configuration storage

  example-app:
    image: nginx
    labels:
      # Direct mode hostname definition
      - "dns.hostname=app.example.com"
      # DNS configuration
      - "dns.type=A"  # A record instead of default CNAME
      - "dns.proxied=false"  # Disable Cloudflare proxy
```

## DNS Provider Configuration

### Cloudflare

Cloudflare requires an API token with DNS edit permissions for your zone:

```yaml
environment:
  - DNS_PROVIDER=cloudflare
  - CLOUDFLARE_TOKEN=your_cloudflare_api_token
  - CLOUDFLARE_ZONE=example.com
```

Cloudflare-specific features:
- Proxying (orange cloud) through `dns.proxied` or `dns.cloudflare.proxied` labels
- Ultra-low TTL support (as low as 1 second)
- Automatic handling of apex domains

### DigitalOcean

DigitalOcean requires an API token with write access to your domain:

```yaml
environment:
  - DNS_PROVIDER=digitalocean
  - DO_TOKEN=your_digitalocean_api_token
  - DO_DOMAIN=example.com
```

DigitalOcean-specific notes:
- Minimum TTL of 30 seconds (enforced by provider)
- No proxying support (all `proxied` labels are ignored)
- Automatically adds trailing dots for domain names as required by DigitalOcean

### Route53

AWS Route53 requires IAM credentials with permissions to modify DNS records:

```yaml
environment:
  - DNS_PROVIDER=route53
  - ROUTE53_ACCESS_KEY=your_aws_access_key
  - ROUTE53_SECRET_KEY=your_aws_secret_key
  - ROUTE53_ZONE=example.com
  # - ROUTE53_ZONE_ID=Z1234567890ABC  # Alternative to ROUTE53_ZONE
  # - ROUTE53_REGION=eu-west-2  # Optional, defaults to eu-west-2 (London)
```

Route53-specific notes:
- Minimum TTL of 60 seconds (enforced by provider)
- No proxying support (all `proxied` labels are ignored)
- Automatically adds trailing dots for domain names as required by Route53
- Supports batch processing for efficient API usage

Required AWS IAM permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "route53:ListHostedZones",
                "route53:ListHostedZonesByName",
                "route53:GetHostedZone",
                "route53:ListResourceRecordSets",
                "route53:ChangeResourceRecordSets"
            ],
            "Resource": "*"
        }
    ]
}
```

## User/Group Permissions

TrafegoDNS supports running as a specific user and group using the PUID and PGID environment variables:

```yaml
environment:
  - PUID=1000  # User ID to run as
  - PGID=1000  # Group ID to run as
```

This is useful for ensuring that files created by the container (like the DNS record tracking file) have the correct ownership. If not specified, the container will run as the default `abc` user (UID 1001, GID 1001).

To access the Docker socket, you'll need to ensure the user has the appropriate permissions. There are several ways to do this:

1. Run the container as root:
   ```yaml
   user: "0:0"  # Run as root
   ```

2. Add the container's user to the Docker group (done automatically by the container):
   ```yaml
   volumes:
     - /var/run/docker.sock:/var/run/docker.sock:ro
   ```

3. Set appropriate permissions on the Docker socket host-side.

## Service Labels

The DNS Manager supports the following labels for customising DNS record creation:

### Basic Labels (Provider-Agnostic)

| Label | Description | Default |
|-------|-------------|---------|
| `dns.skip` | Skip DNS management for this service | `false` |
| `dns.manage` | Enable DNS management for this service | Depends on `DNS_DEFAULT_MANAGE` |
| `dns.type` | DNS record type (A, AAAA, CNAME, etc.) | `CNAME` or `A` for apex domains |
| `dns.content` | Record content/value | Domain for CNAME, Public IP for A |
| `dns.ttl` | Record TTL in seconds | `1` (Auto) for Cloudflare, `30` for DigitalOcean, `60` for Route53 |
| `dns.hostname` | Comma-separated list of hostnames (direct mode) | None |
| `dns.domain` | Domain name (direct mode) | None |
| `dns.subdomain` | Comma-separated list of subdomains (direct mode) | None |
| `dns.use_apex` | Whether to use the apex domain (direct mode) | `false` |
| `dns.host.X` | Individual hostnames (direct mode) | None |

### Provider-Specific Labels (Override Provider-Agnostic Labels)

| Label | Description | Default | Supported Providers |
|-------|-------------|---------|---------------------|
| `dns.cloudflare.skip` | Skip Cloudflare DNS management for this service | `false` | Cloudflare |
| `dns.cloudflare.manage` | Enable Cloudflare DNS management for this service | Depends on `DNS_DEFAULT_MANAGE` | Cloudflare |
| `dns.cloudflare.type` | DNS record type for Cloudflare | `CNAME` or `A` for apex domains | Cloudflare |
| `dns.cloudflare.content` | Record content for Cloudflare | Domain for CNAME, Public IP for A | Cloudflare |
| `dns.cloudflare.proxied` | Enable Cloudflare proxy (orange cloud) | `true` | Cloudflare |
| `dns.cloudflare.ttl` | Record TTL for Cloudflare in seconds | `1` (Auto) | Cloudflare |
| `dns.digitalocean.skip` | Skip DigitalOcean DNS management for this service | `false` | DigitalOcean |
| `dns.digitalocean.manage` | Enable DigitalOcean DNS management for this service | Depends on `DNS_DEFAULT_MANAGE` | DigitalOcean |
| `dns.digitalocean.type` | DNS record type for DigitalOcean | `CNAME` or `A` for apex domains | DigitalOcean |
| `dns.digitalocean.content` | Record content for DigitalOcean | Domain for CNAME, Public IP for A | DigitalOcean |
| `dns.digitalocean.ttl` | Record TTL for DigitalOcean in seconds | `30` (Minimum) | DigitalOcean |
| `dns.route53.skip` | Skip Route53 DNS management for this service | `false` | Route53 |
| `dns.route53.manage` | Enable Route53 DNS management for this service | Depends on `DNS_DEFAULT_MANAGE` | Route53 |
| `dns.route53.type` | DNS record type for Route53 | `CNAME` or `A` for apex domains | Route53 |
| `dns.route53.content` | Record content for Route53 | Domain for CNAME, Public IP for A | Route53 |
| `dns.route53.ttl` | Record TTL for Route53 in seconds | `60` (Minimum) | Route53 |

### Type-Specific Labels

| Label | Applicable Types | Description |
|-------|------------------|-------------|
| `dns.priority` or `dns.<provider>.priority` | MX, SRV | Priority value |
| `dns.weight` or `dns.<provider>.weight` | SRV | Weight value |
| `dns.port` or `dns.<provider>.port` | SRV | Port value |
| `dns.flags` or `dns.<provider>.flags` | CAA | Flags value |
| `dns.tag` or `dns.<provider>.tag` | CAA | Tag value |

## Label Precedence

The system uses the following precedence order when reading labels:

1. Provider-specific labels (e.g., `dns.cloudflare.type`)
2. Generic DNS labels (e.g., `dns.type`)
3. Default values from configuration

This allows you to set global defaults, override them with generic DNS settings, and further override with provider-specific settings when needed.

## Provider-Specific TTL Requirements

Different DNS providers have different requirements for TTL values:

| Provider | Minimum TTL | Default TTL | Notes |
|----------|-------------|-------------|-------|
| Cloudflare | 1 second | 1 second (Auto) | TTL is ignored for proxied records (always Auto) |
| DigitalOcean | 30 seconds | 30 seconds | Values below 30 are automatically adjusted to 30 |
| Route53 | 60 seconds | 60 seconds | Values below 60 are automatically adjusted to 60 |

The application automatically applies the appropriate minimum TTL value for each provider. If you set `DNS_DEFAULT_TTL` in your environment, it will be used only if it's equal to or higher than the provider-specific minimum.

## Usage Examples

### Basic Service with Default Settings

Just use standard Traefik labels (in Traefik mode) or DNS labels (in Direct mode):

#### Traefik Mode
```yaml
services:
  my-app:
    image: my-image
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.my-app.rule=Host(`app.example.com`)"
      - "traefik.http.routers.my-app.entrypoints=https"
```

#### Direct Mode
```yaml
services:
  my-app:
    image: my-image
    labels:
      - "dns.hostname=app.example.com"
```

### Disable Cloudflare Proxy for Media Servers

```yaml
services:
  my-service:
    image: my-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.my-service.rule=Host(`service.example.com`)"
      # For Direct mode
      - "dns.hostname=service.example.com"
      
      # DNS configuration (works in both modes)
      - "dns.proxied=false"  # Use generic label
      # OR "dns.cloudflare.proxied=false"  # Use provider-specific label
```

### Use A Record with Custom IP

```yaml
services:
  my-app:
    image: my-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.my-app.rule=Host(`app.example.com`)"
      # For Direct mode
      - "dns.hostname=app.example.com"
      
      # DNS configuration (works in both modes)
      - "dns.type=A"
      - "dns.content=203.0.113.10"  # Custom IP address
```

### Set Custom TTL for Route53 DNS

```yaml
services:
  my-app:
    image: my-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.my-app.rule=Host(`app.example.com`)"
      # For Direct mode
      - "dns.hostname=app.example.com"
      
      # DNS configuration (works in both modes)
      - "dns.route53.ttl=3600"  # Set TTL to 1 hour (3600 seconds)
```

### Skip DNS Management for a Service

```yaml
services:
  internal-app:
    image: internal-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.internal.rule=Host(`internal.example.com`)"
      # For Direct mode
      - "dns.hostname=internal.example.com"
      
      # DNS configuration (works in both modes)
      - "dns.skip=true"  # Skip DNS management for all providers
      # OR "dns.route53.skip=true"  # Skip just Route53 DNS management
```

### Opt-in DNS Management (when DNS_DEFAULT_MANAGE=false)

```yaml
services:
  public-app:
    image: public-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.public.rule=Host(`public.example.com`)"
      # For Direct mode
      - "dns.hostname=public.example.com"
      
      # DNS configuration (works in both modes)
      - "dns.manage=true"  # Explicitly enable DNS management for all providers
      # OR "dns.route53.manage=true"  # Enable just for Route53
```

### Create MX Record

```yaml
services:
  mail-service:
    image: mail-image
    labels:
      # For Traefik mode
      - "traefik.enable=true"
      - "traefik.http.routers.mail.rule=Host(`example.com`)"
      # For Direct mode
      - "dns.hostname=example.com"
      
      # DNS configuration (works in both modes)
      - "dns.type=MX"
      - "dns.content=mail.example.com"
      - "dns.priority=10"
```

## Environment Variables

### User/Group Settings
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PUID` | User ID to run as | `1001` | No |
| `PGID` | Group ID to run as | `1001` | No |

### Application Mode
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPERATION_MODE` | Operation mode (`traefik` or `direct`) | `traefik` | No |

### DNS Provider Selection
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DNS_PROVIDER` | DNS provider to use | `cloudflare` | No |

### Cloudflare Settings
| Variable | Description | Default | Required if using Cloudflare |
|----------|-------------|---------|----------|
| `CLOUDFLARE_TOKEN` | Cloudflare API token with DNS edit permissions | - | Yes |
| `CLOUDFLARE_ZONE` | Your domain name (e.g., example.com) | - | Yes |

### DigitalOcean Settings
| Variable | Description | Default | Required if using DigitalOcean |
|----------|-------------|---------|----------|
| `DO_TOKEN` | DigitalOcean API token with write access | - | Yes |
| `DO_DOMAIN` | Your domain name (e.g., example.com) | - | Yes |

### Route53 Settings
| Variable | Description | Default | Required if using Route53 |
|----------|-------------|---------|----------|
| `ROUTE53_ACCESS_KEY` | AWS IAM access key with Route53 permissions | - | Yes |
| `ROUTE53_SECRET_KEY` | AWS IAM secret key | - | Yes |
| `ROUTE53_ZONE` | Your domain name (e.g., example.com) | - | Yes* |
| `ROUTE53_ZONE_ID` | Your Route53 hosted zone ID | - | Yes* |
| `ROUTE53_REGION` | AWS region for API calls | `eu-west-2` | No |

*Either `ROUTE53_ZONE` or `ROUTE53_ZONE_ID` must be provided.

### Traefik API Settings
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TRAEFIK_API_URL` | URL to Traefik API | `http://traefik:8080/api` | No |
| `TRAEFIK_API_USERNAME` | Username for Traefik API basic auth | - | No |
| `TRAEFIK_API_PASSWORD` | Password for Traefik API basic auth | - | No |

### DNS Default Settings
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DNS_LABEL_PREFIX` | Base prefix for DNS labels | `dns.` | No |
| `DNS_DEFAULT_TYPE` | Default DNS record type | `CNAME` | No |
| `DNS_DEFAULT_CONTENT` | Default record content | Value of `CLOUDFLARE_ZONE` or `DO_DOMAIN` or `ROUTE53_ZONE` | No |
| `DNS_DEFAULT_PROXIED` | Default Cloudflare proxy status | `true` | No |
| `DNS_DEFAULT_TTL` | Default TTL in seconds | Provider-specific: Cloudflare=1 (Auto), DigitalOcean=30, Route53=60 | No |
| `DNS_DEFAULT_MANAGE` | Global DNS management mode | `true` | No |

### IP Address Settings
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PUBLIC_IP` | Manual override for public IPv4 | Auto-detected | No |
| `PUBLIC_IPV6` | Manual override for public IPv6 | Auto-detected | No |
| `IP_REFRESH_INTERVAL` | How often to refresh IP (ms) | `3600000` (1 hour) | No |

### Application Behaviour
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POLL_INTERVAL` | How often to poll for changes (ms) | `60000` (1 min) | No |
| `WATCH_DOCKER_EVENTS` | Whether to watch Docker events | `true` | No |
| `CLEANUP_ORPHANED` | Whether to remove orphaned DNS records | `false` | No |
| `PRESERVED_HOSTNAMES` | Comma-separated list of hostnames to exclude from cleanup | - | No |
| `MANAGED_HOSTNAMES` | Comma-separated list of hostnames to create and maintain | - | No |
| `DOCKER_SOCKET` | Path to Docker socket | `/var/run/docker.sock` | No |
| `LOG_LEVEL` | Logging verbosity (ERROR, WARN, INFO, DEBUG, TRACE) | `INFO` | No |
| `DNS_CACHE_REFRESH_INTERVAL` | How often to refresh DNS cache (ms) | `3600000` (1 hour) | No |
| `API_TIMEOUT` | API request timeout (ms) | `60000` (1 minute) | No |

## Automated Cleanup of Orphaned Records

When containers are removed, their DNS records can be automatically cleaned up by enabling the `CLEANUP_ORPHANED` setting:

```yaml
environment:
  - CLEANUP_ORPHANED=true
  - CLEANUP_GRACE_PERIOD=15  # Minutes before deletion (default: 15)
```

This process includes a grace period to prevent premature deletion during container updates or service maintenance:

1. When a hostname is first detected as orphaned (no longer associated with an active container), it's **marked for deletion** but not immediately removed.
2. Only after the configurable grace period has elapsed (default: 15 minutes) will the record actually be deleted.
3. If the container/service comes back online within the grace period, the record is automatically "unmarked" and preserved.

### Preserving Specific DNS Records

You can specify hostnames that should never be deleted, even if they become orphaned:

```yaml
environment:
  - PRESERVED_HOSTNAMES=static.example.com,api.example.com,*.admin.example.com
```

This supports:
- Exact hostnames (e.g., `api.example.com`)
- Wildcard subdomains (e.g., `*.admin.example.com`) which will preserve all subdomains that match the pattern

Preserved hostnames will be logged during startup and skipped during any cleanup operations.

### How the Grace Period Works

The grace period feature provides several benefits:

- **Prevents data loss during container updates**: Services that temporarily go offline during rolling updates won't lose their DNS records.
- **Accommodates maintenance windows**: Planned maintenance that takes services offline won't trigger DNS record deletion.
- **Provides recovery window**: If a container is accidentally stopped, you have time to restart it before DNS records are removed.
- **Clear logging**: The system clearly logs when records are marked for deletion and when they're actually deleted.

### Configuration

- `CLEANUP_ORPHANED`: Set to `true` to enable the orphaned record detection and cleanup.
- `CLEANUP_GRACE_PERIOD`: Time in minutes to wait before deleting orphaned records (default: 15 minutes).
- `PRESERVED_HOSTNAMES`: List of hostnames to never delete, even if orphaned.

### Logs During Operation

When using the grace period feature, you'll see these log entries:

1. When a record is first marked as orphaned:
   ```
   🕒 Marking DNS record as orphaned (will be deleted after 15 minutes): app.example.com (A)
   ```

2. If the service comes back online within the grace period:
   ```
   ✅ DNS record is active again, removing orphaned mark: app.example.com (A)
   ```

3. When the grace period elapses and the record is deleted:
   ```
   🗑️ Grace period elapsed (16 minutes), removing orphaned DNS record: app.example.com (A)
   ```

4. Summary logs after each cleanup cycle:
   ```
   Orphaned records: 3 newly marked, 2 deleted after grace period, 1 reactivated
   ```

This mechanism ensures your DNS records remain stable during normal operational changes while still cleaning up truly abandoned records after a reasonable waiting period.

### Preserving Specific DNS Records

You can specify hostnames that should never be deleted, even if they become orphaned:

```yaml
environment:
  - PRESERVED_HOSTNAMES=static.example.com,api.example.com,*.admin.example.com
```

This supports:
- Exact hostnames (e.g., `api.example.com`)
- Wildcard subdomains (e.g., `*.admin.example.com`) which will preserve all subdomains that match the pattern

Preserved hostnames will be logged during startup and skipped during any cleanup operations.

## Manual Hostname Management

TrafegoDNS allows you to manually specify hostnames that should be created and maintained regardless of container lifecycle:

```yaml
environment:
  - MANAGED_HOSTNAMES=blog.example.com:A:192.168.1.10:3600:false,mail.example.com:MX:mail.example.com:3600:false
```

The format for each managed hostname is:
```
hostname:type:content:ttl:proxied
```

Where:
- `hostname`: The full hostname to create (e.g., blog.example.com)
- `type`: DNS record type (A, AAAA, CNAME, MX, TXT, etc.)
- `content`: Record content/value (IP address for A records, target domain for CNAME, etc.)
- `ttl`: Time-to-live in seconds
- `proxied`: Whether to enable Cloudflare proxying (true/false, only applicable for Cloudflare)

These hostnames will be:
- Created during initialization and kept in sync during runtime
- Maintained independently of container lifecycle
- Never deleted by the cleanup process
- Preserved even if containers using the same hostname are created and then removed

This is useful for maintaining static DNS records for services that don't run in containers, legacy systems, or external endpoints.

## DNS Record Tracking

The application maintains a persistent record of all DNS entries it creates in a tracking file. This enables:

1. **Provider Independence**: Consistent tracking across different DNS providers (Cloudflare, DigitalOcean, Route53)
2. **Safety**: Only records created by the tool are ever deleted during cleanup
3. **Persistence**: Record history is maintained between application restarts

## Configuration Storage

TrafegoDNS stores its configuration and data files in the `/config` directory within the container, which should be mounted as a volume for persistence:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
  - ./config:/config
```

The main configuration files include:

- `/config/data/dns-records.json` - Tracking information for all DNS records managed by the application

This approach provides several benefits:

1. **Data Persistence**: All data is stored in a mounted volume that persists across container restarts and updates
2. **Backup Capability**: The config directory can be easily backed up
3. **Migration Support**: Moving to a new server is as simple as copying the config directory

The application will automatically migrate any existing data from legacy locations into the new structure.

## DNS Management Modes

TrafegoDNS supports two operational modes for DNS management:

### Opt-out Mode (Default)
- Set `DNS_DEFAULT_MANAGE=true` or leave it unset
- All services automatically get DNS records created
- Services can opt-out with `dns.skip=true` or `dns.<provider>.skip=true` label

### Opt-in Mode
- Set `DNS_DEFAULT_MANAGE=false`
- Services need to explicitly opt-in with `dns.manage=true` or `dns.<provider>.manage=true` label
- Services can still use skip labels to ensure no DNS management

## Logging System

The application includes a configurable logging system to help with monitoring and troubleshooting:

### Log Levels

- `ERROR` - Only critical errors that break functionality
- `WARN` - Important warnings that don't break functionality
- `INFO` - Key operational information (default)
- `DEBUG` - Detailed information for troubleshooting
- `TRACE` - Extremely detailed information for deep troubleshooting

The default level is `INFO`, which provides a clean, readable output with important operational information. Set the `LOG_LEVEL` environment variable to change the logging verbosity.

### INFO Level Format

```
✅ Starting TrafegoDNS
ℹ️ Cloudflare Zone: example.com
ℹ️ Processing 30 hostnames for DNS management
✅ Created A record for example.com
ℹ️ 29 DNS records are up to date
✅ TrafegoDNS running successfully
```

## Performance Optimisation

The application includes built-in performance optimisations to reduce API calls and improve efficiency:

### DNS Caching

DNS records from providers are cached in memory to reduce API calls:

- All records are fetched in a single API call
- The cache is refreshed periodically (default: every hour)
- The refresh interval can be adjusted with the `DNS_CACHE_REFRESH_INTERVAL` variable

### Batch Processing

DNS record updates are processed in batches:

- All hostname configurations are collected first
- Records are compared against the cache in memory
- Only records that need changes receive API calls
- All other records use cached data

This significantly reduces API calls to DNS providers, especially for deployments with many hostnames.

### Timeout Handling

The application includes robust timeout handling for API operations:

- All API calls have a configurable timeout (default: 60 seconds)
- This can be adjusted with the `API_TIMEOUT` environment variable
- Timeouts are particularly important when running on lower-powered devices like Raspberry Pi

## Automatic Apex Domain Handling

The DNS Manager automatically detects apex domains (e.g., `example.com`) and uses A records with your public IP instead of CNAME records, which are not allowed at the apex domain level.

## Using Docker Secrets

Any environment variables supported by TrafegoDNS that contain secrets, i.e. those ending in `_TOKEN`, `_KEY` or `_PASSWORD` support receiving the secret vie Docker [secrets](https://docs.docker.com/compose/how-tos/use-secrets/). 

To provide a value via secret file, append the suffix `_FILE` to the variable name and specify the path to the file that contains the secret.

Example:

```
secrets:
  cloudflare_dns_api_token:
    file: ${APPDATA_LOCATION:-/srv/appdata}/secrets/cloudflare_dns_api_token

services:
  trafegodns:
    container_name: trafegodns
    image: eafxx/trafegodns:latest
    restart: unless-stopped
    volumes: 
      - trafegodns:/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
    secrets:
      - cloudflare_dns_api_token
    environment:
      CLOUDFLARE_TOKEN_FILE: /run/secrets/cloudflare_dns_api_token
```

### Supported Secret Variables

- CLOUDFLARE_TOKEN_FILE
- ROUTE53_ACCESS_KEY_FILE
- ROUTE53_SECRET_KEY_FILE
- DO_TOKEN_FILE
- TRAEFIK_API_PASSWORD_FILE

## Building from Source

```bash
# Clone the repository
git clone https://github.com/elmerfds/TrafegoDNS.git
cd TrafegoDNS

# Build the Docker image
docker build -t TrafegoDNS .

# Run the container
docker run -d \
  --name TrafegoDNS \
  -e CLOUDFLARE_TOKEN=your_token \
  -e CLOUDFLARE_ZONE=example.com \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v ./config:/config \
  trafegodns
```

## Development

### Technologies
- **Backend**: Node.js with optimised async processing
- **DNS Integration**: Native API clients for Cloudflare, DigitalOcean, and AWS Route53
- **Container Integration**: Docker API via dockerode
- **Event Architecture**: Custom event bus for decoupled component communication
- **Configuration**: Environment-based with intelligent defaults
- **Resilience**: Retry mechanisms and error categorisation
- **Caching**: Local DNS record caching for improved performance

### Approach
- Core concept, architecture, and management by the project author
- Implementation assistance from Claude AI
- A collaborative blend of human domain expertise with AI capabilities

### Inspiration
- [cloudflare-dns-swarm](https://github.com/MarlBurroW/cloudflare-dns-swarm)
- [docker-traefik-cloudflare-companion](https://github.com/tiredofit/docker-traefik-cloudflare-companion/)

## Licence

MIT
