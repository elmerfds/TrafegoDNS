# OIDC/SSO Authentication

TrafegoDNS supports OpenID Connect (OIDC) authentication, allowing users to log in through external identity providers like Authelia, Keycloak, Auth0, or any OIDC-compliant provider.

## Features

- **Multiple Authentication Methods**: Support for both local and OIDC authentication simultaneously
- **PKCE Flow**: Secure authorization code flow with PKCE for enhanced security
- **Role Mapping**: Automatic role assignment based on OIDC groups/claims
- **Automatic User Creation**: Users are created automatically on first OIDC login
- **Session Management**: Secure JWT-based session management
- **Logout Support**: Support for OIDC provider logout

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Enable OIDC authentication
OIDC_ENABLED=true

# OIDC provider settings
OIDC_ISSUER_URL=https://your-oidc-provider.com/auth/realms/master
OIDC_CLIENT_ID=trafegodns
OIDC_CLIENT_SECRET=your_client_secret
OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/oidc/callback

# OIDC scopes to request
OIDC_SCOPES=openid profile email groups

# Role mapping from OIDC groups to TrafegoDNS roles
OIDC_ROLE_MAPPING=admins:admin,operators:operator,users:viewer

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000
```

### Configuration Details

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OIDC_ENABLED` | Enable/disable OIDC authentication | Yes | `false` |
| `OIDC_ISSUER_URL` | OIDC provider's issuer URL | Yes | - |
| `OIDC_CLIENT_ID` | Client ID registered with provider | Yes | - |
| `OIDC_CLIENT_SECRET` | Client secret (can be stored in database) | No* | - |
| `OIDC_REDIRECT_URI` | Callback URL for OIDC flow | Yes | - |
| `OIDC_SCOPES` | Space-separated list of scopes | No | `openid profile email groups` |
| `OIDC_ROLE_MAPPING` | Group to role mapping | No | - |
| `FRONTEND_URL` | Frontend URL for redirects | No | `http://localhost:3000` |

*Client secret is required for confidential clients but not for public clients.

## Provider Setup Examples

### Authelia

1. **Configure Authelia client in `configuration.yml`:**

```yaml
identity_providers:
  oidc:
    clients:
      - id: trafegodns
        description: TrafegoDNS
        secret: '$pbkdf2-sha512$310000$...'  # Generate with authelia crypto hash generate pbkdf2
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - http://localhost:3000/api/v1/auth/oidc/callback
        scopes:
          - openid
          - profile
          - email
          - groups
        userinfo_signing_algorithm: none
```

2. **Set environment variables:**

```bash
OIDC_ENABLED=true
OIDC_ISSUER_URL=https://auth.yourdomain.com
OIDC_CLIENT_ID=trafegodns
OIDC_CLIENT_SECRET=your_client_secret
OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/oidc/callback
OIDC_SCOPES=openid profile email groups
OIDC_ROLE_MAPPING=admins:admin,operators:operator,users:viewer
```

### Keycloak

1. **Create a new client in Keycloak:**
   - Client ID: `trafegodns`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Valid Redirect URIs: `http://localhost:3000/api/v1/auth/oidc/callback`

2. **Configure client scopes to include groups claim**

3. **Set environment variables:**

```bash
OIDC_ENABLED=true
OIDC_ISSUER_URL=https://keycloak.yourdomain.com/auth/realms/master
OIDC_CLIENT_ID=trafegodns
OIDC_CLIENT_SECRET=your_client_secret
OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/oidc/callback
OIDC_SCOPES=openid profile email groups
OIDC_ROLE_MAPPING=admin-group:admin,operator-group:operator,user-group:viewer
```

### Auth0

1. **Create a new application in Auth0:**
   - Application Type: `Regular Web Application`
   - Allowed Callback URLs: `http://localhost:3000/api/v1/auth/oidc/callback`

2. **Configure Rules/Actions to include groups in ID token**

3. **Set environment variables:**

```bash
OIDC_ENABLED=true
OIDC_ISSUER_URL=https://your-domain.auth0.com/
OIDC_CLIENT_ID=your_client_id
OIDC_CLIENT_SECRET=your_client_secret
OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/oidc/callback
OIDC_SCOPES=openid profile email
OIDC_ROLE_MAPPING=
```

## Role Mapping

TrafegoDNS supports automatic role assignment based on OIDC groups or custom claims. The role mapping is configured using the `OIDC_ROLE_MAPPING` environment variable.

### Format

```
group1:role1,group2:role2,group3:role3
```

### Available Roles

- **admin**: Full access to all features including user management and settings
- **operator**: Can manage DNS records, containers, and hostnames
- **viewer**: Read-only access to all resources

### Examples

```bash
# Map Authelia groups to TrafegoDNS roles
OIDC_ROLE_MAPPING=admins:admin,operators:operator,users:viewer

# Map Active Directory groups
OIDC_ROLE_MAPPING=Domain Admins:admin,DNS Operators:operator,Domain Users:viewer

# Map Keycloak roles
OIDC_ROLE_MAPPING=trafegodns-admin:admin,trafegodns-operator:operator,trafegodns-viewer:viewer
```

### Default Role

If no role mapping matches the user's groups, the user will be assigned the **viewer** role by default.

## Security Considerations

### PKCE (Proof Key for Code Exchange)

TrafegoDNS implements PKCE for enhanced security:
- Prevents authorization code interception attacks
- Required for public clients, recommended for confidential clients
- Automatically handled by the OIDC service

### State Parameter

- CSRF protection through state parameter validation
- State parameters expire after 10 minutes
- Automatic cleanup of expired states

### Token Management

- JWT tokens are securely generated and validated
- Refresh tokens are stored in HTTP-only cookies
- Token revocation is supported

### Client Secret Storage

- Client secrets can be stored as environment variables
- Alternatively, secrets can be encrypted and stored in the database
- Database-stored secrets take precedence over environment variables

## API Endpoints

### OIDC Status

```http
GET /api/v1/auth/oidc/status
```

Returns OIDC configuration status and provider metadata.

### Authorization URL

```http
GET /api/v1/auth/oidc/authorize
```

Returns the authorization URL to redirect users to for OIDC login.

### Callback Handler

```http
GET /api/v1/auth/oidc/callback?code=...&state=...
```

Handles the OIDC callback and exchanges the authorization code for tokens.

## User Experience

### Login Flow

1. User clicks "Login with SSO" button on login page
2. User is redirected to OIDC provider for authentication
3. After successful authentication, user is redirected back to TrafegoDNS
4. TrafegoDNS exchanges the authorization code for tokens
5. User information is retrieved from the OIDC provider
6. User account is created or updated automatically
7. User is logged into TrafegoDNS with appropriate role

### Logout Flow

- Local logout clears TrafegoDNS session
- OIDC provider logout can be implemented if supported

## Troubleshooting

### Common Issues

1. **OIDC service initialization failed**
   - Check that `OIDC_ISSUER_URL` is accessible
   - Verify the issuer URL format (should include protocol)
   - Ensure network connectivity to the OIDC provider

2. **Invalid redirect URI**
   - Verify `OIDC_REDIRECT_URI` matches the configured callback URL
   - Check that the redirect URI is registered with the OIDC provider
   - Ensure the redirect URI is accessible from the provider

3. **Role mapping not working**
   - Check that groups claim is included in the ID token or userinfo response
   - Verify the group names in `OIDC_ROLE_MAPPING` match exactly
   - Review provider configuration for group claims

4. **Client authentication failed**
   - Verify `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` are correct
   - Check client configuration in the OIDC provider
   - Ensure client type (public/confidential) matches configuration

### Debug Logging

Enable debug logging to troubleshoot OIDC issues:

```bash
LOG_LEVEL=debug
```

This will provide detailed logs of the OIDC authentication flow.

### Testing Configuration

You can test your OIDC configuration by:

1. Checking the OIDC status endpoint: `GET /api/v1/auth/oidc/status`
2. Reviewing the provider metadata in the response
3. Testing the authorization flow through the web interface

## Migration from Local Authentication

OIDC can be enabled alongside existing local authentication:

1. Existing local users continue to work normally
2. New users can be created through OIDC
3. The same user cannot exist with both local and OIDC authentication
4. User management through the admin interface remains available

## Best Practices

1. **Use HTTPS in production** for all OIDC communication
2. **Generate strong client secrets** and store them securely
3. **Regularly rotate client secrets** as per your security policy
4. **Monitor authentication logs** for suspicious activity
5. **Use specific redirect URIs** rather than wildcards
6. **Test role mappings** thoroughly before deploying to production
7. **Keep OIDC provider configuration synchronized** with TrafegoDNS configuration

## Support

For issues or questions regarding OIDC authentication:

1. Check the TrafegoDNS logs for error messages
2. Verify your OIDC provider configuration
3. Review the provider's documentation for client setup
4. Consult the TrafegoDNS documentation and issue tracker