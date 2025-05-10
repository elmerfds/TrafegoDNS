# TrafegoDNS API Features

This document describes the key features of the TrafegoDNS API, with a focus on advanced capabilities that support building rich web interfaces and integrations.

## Table of Contents

- [Rate Limiting](#rate-limiting)
- [Pagination](#pagination)
- [CORS Configuration](#cors-configuration)
- [Real-Time Updates](#real-time-updates)
- [API Security](#api-security)

## Rate Limiting

The API includes built-in rate limiting to protect against abuse and ensure fair resource usage.

### Default Limits

- **Global Rate Limit**: 100 requests per minute per IP address
- **Authentication Endpoints**: 10 attempts per 15 minutes (helps prevent brute force attacks)
- **Write Operations**: 30 requests per 5 minutes (applies to POST, PUT, DELETE)

### Headers

Rate limit information is returned in the response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1620000000
```

### Configuration

Rate limits can be configured via environment variables:

```env
RATE_LIMIT_MAX=200
RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_WINDOW_MS=900000
```

## Pagination

All collection endpoints support pagination to efficiently handle large datasets.

### Parameters

- `page`: Page number (default: 1)
- `limit`: Number of items per page (default: 10, max: 100)

### Example Request

```
GET /api/v1/dns/records?page=2&limit=20
```

### Response Format

```json
{
  "status": "success",
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": true,
    "links": {
      "self": "/api/v1/dns/records?page=2&limit=20",
      "first": "/api/v1/dns/records?page=1&limit=20",
      "prev": "/api/v1/dns/records?page=1&limit=20",
      "next": "/api/v1/dns/records?page=3&limit=20",
      "last": "/api/v1/dns/records?page=8&limit=20"
    }
  }
}
```

## CORS Configuration

The API includes configurable CORS (Cross-Origin Resource Sharing) support to allow browser-based clients from different origins.

### Default Configuration

- **Origin**: Accepts requests from any origin (`*`) in development, configurable for production
- **Credentials**: Allowed (supports cookies and Authorization headers)
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization

### Configuration

CORS can be configured via environment variables:

```env
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
CORS_ALLOW_CREDENTIALS=true
CORS_MAX_AGE=86400
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-Requested-With
```

## Real-Time Updates

The API includes WebSocket support for real-time updates, enabling dynamic UIs that reflect changes instantly.

### Connection

Connect to the WebSocket server using Socket.IO:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token' // Same token used for REST API
  }
});
```

### Event Subscription

Subscribe to specific event types:

```javascript
// Subscribe to DNS record creation events
socket.emit('subscribe', 'dns:record:created');

// Subscribe to container events
socket.emit('subscribe', 'container:started');
socket.emit('subscribe', 'container:stopped');
```

### Handling Events

```javascript
socket.on('event', (eventData) => {
  const { type, data } = eventData;
  
  switch (type) {
    case 'dns:record:created':
      console.log('New DNS record created:', data);
      break;
    case 'container:started':
      console.log('Container started:', data);
      break;
  }
});
```

### Available Events

The following events can be subscribed to:

| Event Type | Description |
|------------|-------------|
| `dns:records:updated` | DNS records batch updated |
| `dns:record:created` | New DNS record created |
| `dns:record:updated` | Existing DNS record updated |
| `dns:record:deleted` | DNS record deleted |
| `container:started` | Container started |
| `container:stopped` | Container stopped |
| `container:destroyed` | Container destroyed |
| `status:update` | System status update |

## API Security

The API implements multiple security measures:

### Authentication

- JWT-based authentication
- Token refresh mechanism
- HTTPS recommended for production

### Rate Limiting

- Prevents brute force attacks
- Protects against DoS attempts
- Resource usage fairness

### Input Validation

- All inputs are validated
- Structured error responses
- Protection against injection attacks

### Response Headers

- Helmet security headers
- Content-Security-Policy
- CORS protection

## Example Client Code

See the [examples directory](../examples/) for sample code demonstrating how to use these features:

- WebSocket client example
- React hook for real-time updates
- API client with pagination

## Best Practices

1. **Authentication**: Always pass the JWT token in the Authorization header
2. **Pagination**: Use pagination for all collection endpoints
3. **Rate Limiting**: Implement client-side handling of rate limit responses
4. **WebSockets**: Implement reconnection logic and error handling
5. **Error Handling**: Check response status and handle errors appropriately