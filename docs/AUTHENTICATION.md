# TrafegoDNS Authentication System

This document describes the authentication system implemented in TrafegoDNS API.

## Table of Contents

- [Overview](#overview)
- [User Management](#user-management)
- [Authentication Flow](#authentication-flow)
- [Token Management](#token-management)
- [Security Features](#security-features)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)

## Overview

TrafegoDNS uses a robust JWT-based authentication system with:

- **File-based user storage** for small deployments
- **Secure token management** with access and refresh tokens
- **Token revocation** for enhanced security
- **Role-based access control** for fine-grained permissions
- **Rate limiting** to prevent brute force attacks

## User Management

### User Roles

The system implements three user roles:

1. **Admin**: Full access to all features including user management
2. **Operator**: Can manage DNS records but has limited configuration access
3. **Viewer**: Read-only access to the system

### User Storage

Users are stored in a JSON file within the `/config/data` directory for persistence across restarts:

```
/config/data/users.json
```

The system creates a default admin user on first run:
- Username: `admin`
- Password: `admin123`

**Important**: Change the default admin password after initial setup!

## Authentication Flow

The authentication flow follows a standard JWT pattern with refresh tokens:

1. **Login**: User provides credentials and receives access and refresh tokens
2. **Authorization**: Protected endpoints require a valid access token
3. **Token Refresh**: When the access token expires, the client can use the refresh token to get a new one
4. **Logout**: Revokes both access and refresh tokens

```
┌──────┐                                                     ┌──────────────┐
│Client│                                                     │TrafegoDNS API│
└──┬───┘                                                     └──────┬───────┘
   │                                                                │
   │ 1. POST /api/v1/auth/login {username, password}                │
   │────────────────────────────────────────────────────────────────>
   │                                                                │
   │ 2. {accessToken, refreshToken (in HTTP-only cookie)}           │
   │<────────────────────────────────────────────────────────────────
   │                                                                │
   │ 3. API Request with Bearer Token                               │
   │────────────────────────────────────────────────────────────────>
   │                                                                │
   │ 4. Response                                                    │
   │<────────────────────────────────────────────────────────────────
   │                                                                │
   │ 5. When access token expires:                                  │
   │ POST /api/v1/auth/refresh (refresh token in cookie)            │
   │────────────────────────────────────────────────────────────────>
   │                                                                │
   │ 6. {new accessToken, new refreshToken in cookie}              │
   │<────────────────────────────────────────────────────────────────
   │                                                                │
   │ 7. POST /api/v1/auth/logout (tokens revoked)                   │
   │────────────────────────────────────────────────────────────────>
   │                                                                │
```

## Token Management

### Token Types

1. **Access Tokens**:
   - Short-lived (1 hour by default)
   - Used for API authorization
   - Contain user ID, username, and role

2. **Refresh Tokens**:
   - Long-lived (7 days by default)
   - Stored in HTTP-only cookies
   - Used to obtain new access tokens
   - Contains minimal information (user ID only)

### Token Revocation

The system maintains a list of revoked tokens in:

```
/config/data/revoked-tokens.json
```

When a user logs out or an admin revokes a user's access, both the access token and refresh token are added to this list. The system automatically cleans up expired tokens from this list.

## Security Features

1. **Password Hashing**: Passwords are hashed using bcrypt with a salt
2. **HTTP-only Cookies**: Refresh tokens are stored in HTTP-only cookies to prevent XSS attacks
3. **Token Revocation**: Ability to revoke tokens immediately
4. **Rate Limiting**: Login endpoints are rate-limited to prevent brute force attacks
5. **Environment-based Secrets**: JWT secrets are loaded from environment variables for production
6. **Secure Cookie Settings**: Cookies are set with secure and sameSite flags in production

## API Endpoints

### Authentication

- **POST /api/v1/auth/login**: Authenticate user and get tokens
- **POST /api/v1/auth/refresh**: Refresh access token using refresh token
- **POST /api/v1/auth/logout**: Revoke tokens and log out

### User Management

- **POST /api/v1/auth/register**: Create a new user (admin only)
- **GET /api/v1/auth/users**: List all users (admin only)
- **PUT /api/v1/auth/users/:id**: Update a user (admin only)
- **DELETE /api/v1/auth/users/:id**: Delete a user (admin only)
- **GET /api/v1/auth/me**: Get current user profile

## Configuration

The authentication system can be configured using the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | Randomly generated |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | Randomly generated |
| `ACCESS_TOKEN_EXPIRY` | Access token lifetime | `1h` |
| `REFRESH_TOKEN_EXPIRY` | Refresh token lifetime | `7d` |
| `CONFIG_DIR` | Directory for configuration storage | `/config` |

**Important**: For production use, always set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to secure values via environment variables.

## Best Practices

1. **Change Default Admin Password**: Change the default admin password immediately after setup
2. **Set JWT Secrets**: Configure secure JWT secrets through environment variables
3. **Minimal Permissions**: Create users with the least privileges needed
4. **Regular User Audit**: Regularly review the list of users and their roles
5. **Monitor Failed Attempts**: Check logs for multiple failed login attempts
6. **Secure Communication**: Always use HTTPS in production