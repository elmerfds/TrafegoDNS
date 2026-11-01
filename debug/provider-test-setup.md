# Provider Test Setup

Test instances deployed on server-titan via Komodo for validating AdGuard Home and Pi-hole providers.

## AdGuard Home

- **Stack**: `adguard-test` (Komodo)
- **Container**: `adguard-test`
- **Image**: `adguard/adguardhome:latest`
- **Network**: `adguard-test_test-dns` (bridge, no host ports exposed)
- **Internal ports**: 3000 (setup wizard), 80 (web UI + API after setup), 53 (DNS)
- **Volumes**: `adguard-test_adguard-work`, `adguard-test_adguard-conf`

### Initial Setup
AdGuard Home requires initial setup wizard at port 3000. Since no ports are exposed:
1. Use `docker exec` or another container on the same network to access the wizard
2. Or temporarily expose port 3000, complete setup, then remove the port mapping

### API Access
- **Base URL**: `http://adguard-test:80` (from containers on the same Docker network)
- **Auth**: HTTP Basic Auth (username + password set during setup)
- **Test endpoint**: `GET /control/status`
- **Rewrite endpoints**:
  - `GET /control/rewrite/list`
  - `POST /control/rewrite/add` — `{ "domain": "...", "answer": "..." }`
  - `PUT /control/rewrite/update` — `{ "target": {...}, "update": {...} }`
  - `POST /control/rewrite/delete` — `{ "domain": "...", "answer": "..." }`

## Pi-hole v6

- **Stack**: `pihole-test` (Komodo)
- **Container**: `pihole-test`
- **Image**: `pihole/pihole:latest`
- **Network**: `pihole-test_test-dns` (bridge, no host ports exposed)
- **Internal ports**: 80 (web UI + API), 53 (DNS)
- **Volumes**: `pihole-test_pihole-data`, `pihole-test_pihole-dnsmasq`
- **Password**: `trafego-test-2024` (set via `FTLCONF_webserver_api_password`)

### API Access
- **Base URL**: `http://pihole-test:80` (from containers on the same Docker network)
- **Auth**: Session-based
  - `POST /api/auth` with `{ "password": "trafego-test-2024" }` → returns `{ "session": { "sid": "...", "valid": true } }`
  - Use `X-FTL-SID: <sid>` header on subsequent requests
- **Test endpoint**: `GET /api/info/version`
- **Local DNS endpoints**:
  - `GET /api/config/dns/hosts` — returns array of "IP hostname" strings
  - `PUT /api/config/dns/hosts/{entry}` — add host entry
  - `DELETE /api/config/dns/hosts/{entry}` — remove host entry
  - `GET /api/config/dns/cnameRecords` — returns array of "hostname,target" strings
  - `PUT /api/config/dns/cnameRecords/{entry}` — add CNAME
  - `DELETE /api/config/dns/cnameRecords/{entry}` — remove CNAME
- **Built-in API docs**: `http://pihole-test:80/api/docs` (OpenAPI)

## Cleanup

To remove test instances:
```
# Via Komodo MCP
mcp__komodo__destroy_stack("adguard-test")
mcp__komodo__delete_stack("adguard-test")
mcp__komodo__destroy_stack("pihole-test")
mcp__komodo__delete_stack("pihole-test")
```
