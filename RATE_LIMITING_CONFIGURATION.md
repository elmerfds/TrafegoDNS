# Rate Limiting Configuration Guide

This guide explains how to configure and manage the rate limiting system in TrafegoDNS to prevent abuse and allow legitimate traffic.

## Current Issue Resolution

### IP 10.0.0.198 Rate Limiting

The IP `10.0.0.198` has been automatically whitelisted in the code changes. The system now includes this IP in the allowed list and will bypass all rate limiting for this address.

## Configuration Options

### Environment Variables

You can configure rate limiting behavior using these environment variables:

```bash
# IP Whitelisting
ALLOWED_IPS="192.168.1.100,10.0.0.198,172.16.0.50"  # Comma-separated list of allowed IPs

# Global Rate Limits
RATE_LIMIT_WINDOW_MS=60000                           # Time window in milliseconds (default: 1 minute)
RATE_LIMIT_ANONYMOUS_MAX=100                         # Requests per window for anonymous users (default: 100)
RATE_LIMIT_AUTHENTICATED_MAX=300                     # Requests per window for authenticated users (default: 300)
RATE_LIMIT_PREMIUM_MAX=500                           # Requests per window for premium users (default: 500)

# Burst Protection
RATE_LIMIT_BURST_WINDOW=1000                         # Burst window in milliseconds (default: 1 second)
RATE_LIMIT_BURST_MAX=25                              # Max requests per burst window (default: 25)
RATE_LIMIT_BURST_BLOCK_DURATION=60000                # Block duration after burst limit (default: 1 minute)

# IP Blocking Behavior
RATE_LIMIT_SUSPICIOUS_THRESHOLD=10                   # Suspicious events before temp block (default: 10)
RATE_LIMIT_BLOCK_DURATION=86400000                   # Block duration in milliseconds (default: 24 hours)
```

### Hardcoded Allowed IPs

The following IPs are automatically whitelisted and bypass all rate limiting:
- `127.0.0.1` (localhost IPv4)
- `::1` (localhost IPv6)
- `10.0.0.198` (your specific IP)

## Current Rate Limits

### User-Based Limits (per minute)
- **Anonymous users**: 100 requests
- **Authenticated users**: 300 requests  
- **Premium users**: 500 requests
- **Admin users**: Unlimited

### Endpoint-Specific Limits
- **Authentication endpoints**: 10 requests per 15 minutes
- **Write operations**: 30 requests per 5 minutes
- **Port operations**: 20 requests per 2 minutes
- **Critical operations**: 5 requests per 10 minutes

### Burst Protection
- **Burst limit**: 25 requests per second
- **Block duration**: 1 minute if exceeded

## Administrative Controls

### API Endpoints for Rate Limit Management

#### Check Rate Limiting Status
```bash
GET /api/v1/status/rate-limit
```
Returns current blocked IPs, suspicious IPs, and configuration.

#### Clear Specific Blocked IP
```bash
DELETE /api/v1/status/rate-limit/blocked/10.0.0.198
```
Removes a specific IP from the blocked list.

#### Clear All Blocked IPs
```bash
DELETE /api/v1/status/rate-limit/blocked
```
Clears all blocked and suspicious IPs.

### Example API Usage

```bash
# Check current rate limiting status
curl -X GET "http://your-server:3000/api/v1/status/rate-limit" \
  -H "Authorization: Bearer your-admin-token"

# Clear the blocked IP 10.0.0.198
curl -X DELETE "http://your-server:3000/api/v1/status/rate-limit/blocked/10.0.0.198" \
  -H "Authorization: Bearer your-admin-token"

# Clear all blocked IPs
curl -X DELETE "http://your-server:3000/api/v1/status/rate-limit/blocked" \
  -H "Authorization: Bearer your-admin-token"
```

## How to Apply Changes

### Method 1: Environment Variables (Recommended)
1. Add the environment variables to your Docker Compose or container configuration
2. Restart the container to apply changes

### Method 2: Direct Code Changes (Already Applied)
The code has been modified to:
- Automatically whitelist `10.0.0.198`
- Support environment variable configuration
- Provide administrative controls via API

### Method 3: Runtime Management
Use the API endpoints to clear blocked IPs without restarting the service.

## Monitoring Rate Limiting

### Check Logs
Rate limiting events are logged with these patterns:
```
Rate limit exceeded for IP 10.0.0.198
Burst protection activated for IP: 10.0.0.198
IP marked as suspicious: 10.0.0.198 - reason
Cleared blocked IP: 10.0.0.198
```

### Monitor via API
Regular checks of the rate limiting status endpoint will show:
- Currently blocked IPs
- Suspicious IPs and their activity
- Configuration details

## Troubleshooting

### If IP is Still Blocked After Changes
1. Check if the application has been restarted with new code
2. Use the API to manually clear the blocked IP
3. Verify the IP appears in the allowed list in logs

### For High Traffic Applications
Consider increasing limits:
```bash
RATE_LIMIT_ANONYMOUS_MAX=500
RATE_LIMIT_AUTHENTICATED_MAX=1000
RATE_LIMIT_BURST_MAX=50
```

### For Development/Testing
Disable rate limiting entirely:
```bash
RATE_LIMIT_ANONYMOUS_MAX=999999
RATE_LIMIT_BURST_MAX=999999
```

## Security Considerations

1. **Allowed IPs**: Only whitelist trusted networks and IPs
2. **Admin Access**: Rate limiting management endpoints require admin authentication
3. **Monitoring**: Regularly monitor blocked IPs for security threats
4. **Logging**: Rate limiting events are logged for security auditing

## Implementation Details

The rate limiting system uses:
- **express-rate-limit** for core rate limiting functionality
- **In-memory storage** for tracking blocked and suspicious IPs
- **IP-based and user-based limits** for different protection levels
- **Graduated response** from warnings to temporary blocks to permanent blocks

All changes are backward compatible and won't affect existing functionality.