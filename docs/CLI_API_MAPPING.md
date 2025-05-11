# TrafegoDNS CLI and API Mapping

This document provides a mapping between the TrafegoDNS CLI commands and their equivalent API endpoints. This is useful for understanding how the same operations can be performed through either interface.

## DNS Records Operations

| CLI Command | API Endpoint | HTTP Method | Description |
|-------------|--------------|------------|-------------|
| `trafegodns records` | `/api/v1/dns/records` | GET | List all DNS records |
| `trafegodns search <query>` | `/api/v1/dns/records?name=<query>` | GET | Search records by name |
| `trafegodns search 'type=<value>'` | `/api/v1/dns/records?type=<value>` | GET | Search records by type |
| `trafegodns process` | `/api/v1/dns/process` | POST | Process DNS records |
| `trafegodns process --force` | `/api/v1/dns/process` with `{"force":true}` | POST | Force process DNS records |
| `trafegodns delete <id>` | `/api/v1/dns/records/<id>` | DELETE | Delete a DNS record |
| `trafegodns update <id> <field=value>` | `/api/v1/dns/records/<id>` | PUT | Update a DNS record |

## Examples

### Listing Records

**CLI:**
```bash
trafegodns records
```

**API:**
```
GET /api/v1/dns/records
Authorization: Bearer <token>
```

### Searching Records

**CLI:**
```bash
trafegodns search example.com
```

**API:**
```
GET /api/v1/dns/records?name=example.com
Authorization: Bearer <token>
```

**CLI:**
```bash
trafegodns search 'type=CNAME'
```

**API:**
```
GET /api/v1/dns/records?type=CNAME
Authorization: Bearer <token>
```

### Deleting a Record

**CLI:**
```bash
trafegodns delete 123
```

**API:**
```
DELETE /api/v1/dns/records/123
Authorization: Bearer <token>
```

### Updating a Record

**CLI:**
```bash
trafegodns update 123 content=192.168.1.10
```

**API:**
```
PUT /api/v1/dns/records/123
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "192.168.1.10"
}
```

### Processing Records

**CLI:**
```bash
trafegodns process --force
```

**API:**
```
POST /api/v1/dns/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "force": true
}
```

## API Authentication

While the CLI handles authentication automatically using environment variables or direct database access, API calls require proper authentication:

1. Obtain a JWT token through the `/api/v1/auth/login` endpoint
2. Include the token in the `Authorization` header as `Bearer <token>`

## Advantages of Each Approach

### CLI Advantages

- No authentication required (uses direct access)
- Available when running inside the container
- Simple for quick operations and scripts
- Works even when API is disabled

### API Advantages

- Can be accessed remotely
- Supports advanced filtering and pagination
- Suitable for building UIs and integrations
- Provides structured JSON responses
- Supports real-time updates via WebSockets