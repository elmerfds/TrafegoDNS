/**
 * OIDC Service
 * Handles OpenID Connect authentication flows
 */
const { Issuer, generators } = require('openid-client');
const crypto = require('crypto');
const logger = require('../../../utils/logger');
const User = require('../models/User');
const jwtService = require('./jwtService');
const { ApiError } = require('../../../utils/apiError');

class OidcService {
  constructor() {
    this.client = null;
    this.issuer = null;
    this.states = new Map(); // Store state parameters for CSRF protection
    this.codeVerifiers = new Map(); // Store PKCE code verifiers
    this.initialized = false;
  }

  /**
   * Initialize OIDC client with provider configuration
   */
  async initialize(config) {
    try {
      if (!config) {
        logger.debug('OIDC not configured, skipping initialization');
        return false;
      }

      const { issuerUrl, clientId, clientSecret, redirectUri } = config;
      
      if (!issuerUrl || !clientId) {
        logger.debug('OIDC configuration incomplete, skipping initialization');
        return false;
      }

      logger.info(`Initializing OIDC client with issuer: ${issuerUrl}`);

      // Discover OIDC provider
      this.issuer = await Issuer.discover(issuerUrl);
      logger.info(`Discovered OIDC provider: ${this.issuer.metadata.issuer}`);

      // Create client
      this.client = new this.issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none'
      });

      this.initialized = true;
      logger.info('OIDC client initialized successfully');
      
      // Clean up expired states periodically (every 5 minutes)
      setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize OIDC client: ${error.message}`);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Get authorization URL for OIDC login
   */
  getAuthorizationUrl(redirectUri, scopes = 'openid profile email') {
    if (!this.initialized) {
      throw new ApiError('OIDC not configured', 503, 'OIDC_NOT_CONFIGURED');
    }

    // Generate state for CSRF protection
    const state = generators.state();
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    // Store state and code verifier with expiration (10 minutes)
    const expiry = Date.now() + 10 * 60 * 1000;
    this.states.set(state, { expiry, redirectUri });
    this.codeVerifiers.set(state, { codeVerifier, expiry });
    
    // Generate authorization URL
    const authUrl = this.client.authorizationUrl({
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri
    });

    return { authUrl, state };
  }

  /**
   * Handle OIDC callback and exchange code for tokens
   */
  async handleCallback(code, state, redirectUri) {
    if (!this.initialized) {
      throw new ApiError('OIDC not configured', 503, 'OIDC_NOT_CONFIGURED');
    }

    // Validate state
    const stateData = this.states.get(state);
    if (!stateData) {
      throw new ApiError('Invalid state parameter', 400, 'INVALID_STATE');
    }

    // Check if state expired
    if (Date.now() > stateData.expiry) {
      this.states.delete(state);
      this.codeVerifiers.delete(state);
      throw new ApiError('State parameter expired', 400, 'STATE_EXPIRED');
    }

    // Get code verifier
    const verifierData = this.codeVerifiers.get(state);
    if (!verifierData) {
      throw new ApiError('Code verifier not found', 400, 'VERIFIER_NOT_FOUND');
    }

    try {
      // Exchange code for tokens
      const tokenSet = await this.client.callback(
        redirectUri,
        { code, state },
        { state, code_verifier: verifierData.codeVerifier }
      );

      // Clean up used state and verifier
      this.states.delete(state);
      this.codeVerifiers.delete(state);

      // Get user info from ID token or userinfo endpoint
      let userInfo;
      if (tokenSet.id_token) {
        userInfo = tokenSet.claims();
      } else {
        userInfo = await this.client.userinfo(tokenSet.access_token);
      }

      return {
        tokenSet,
        userInfo
      };
    } catch (error) {
      // Clean up on error
      this.states.delete(state);
      this.codeVerifiers.delete(state);
      
      logger.error(`OIDC callback error: ${error.message}`);
      throw new ApiError('Failed to authenticate with OIDC provider', 400, 'OIDC_AUTH_FAILED');
    }
  }

  /**
   * Create or update user from OIDC claims
   */
  async createOrUpdateUser(userInfo, config) {
    const { sub, preferred_username, email, name, groups } = userInfo;
    
    // Determine username (prefer preferred_username, fallback to email or sub)
    const username = preferred_username || email || `oidc_${sub}`;
    
    // Map OIDC groups/roles to TrafegoDNS roles
    const role = this.mapOidcRole(groups, config.roleMapping);
    
    try {
      // Check if user exists
      let user = await User.findByUsername(username);
      
      if (user) {
        // Update existing user
        logger.info(`Updating existing OIDC user: ${username}`);
        
        // Update user info and role
        user = await User.update(user.id, {
          role,
          last_login: new Date().toISOString(),
          oidc_sub: sub,
          display_name: name
        });
      } else {
        // Create new user
        logger.info(`Creating new OIDC user: ${username}`);
        
        // Generate a random password (user won't use it for OIDC login)
        const randomPassword = crypto.randomBytes(32).toString('hex');
        
        user = await User.create({
          username,
          password: randomPassword,
          role,
          oidc_sub: sub,
          display_name: name,
          auth_provider: 'oidc'
        });
      }
      
      return user;
    } catch (error) {
      logger.error(`Failed to create/update OIDC user: ${error.message}`);
      throw new ApiError('Failed to create user account', 500, 'USER_CREATION_FAILED');
    }
  }

  /**
   * Map OIDC groups/claims to TrafegoDNS roles
   */
  mapOidcRole(groups, roleMapping = {}) {
    // Default role
    let role = 'viewer';
    
    // If no groups or role mapping, return default
    if (!groups || !roleMapping || Object.keys(roleMapping).length === 0) {
      return role;
    }
    
    // Convert groups to array if it's a string
    const groupList = Array.isArray(groups) ? groups : [groups];
    
    // Check each group against role mapping
    for (const group of groupList) {
      if (roleMapping[group]) {
        const mappedRole = roleMapping[group];
        
        // Use highest privilege role
        if (mappedRole === 'admin') {
          return 'admin';
        } else if (mappedRole === 'operator' && role !== 'admin') {
          role = 'operator';
        }
      }
    }
    
    return role;
  }

  /**
   * Handle logout with OIDC provider
   */
  getLogoutUrl(idToken, postLogoutRedirectUri) {
    if (!this.initialized || !this.issuer.metadata.end_session_endpoint) {
      return null;
    }

    try {
      return this.client.endSessionUrl({
        id_token_hint: idToken,
        post_logout_redirect_uri: postLogoutRedirectUri
      });
    } catch (error) {
      logger.error(`Failed to generate OIDC logout URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Clean up expired states and verifiers
   */
  cleanupExpiredStates() {
    const now = Date.now();
    
    // Clean up states
    for (const [state, data] of this.states.entries()) {
      if (now > data.expiry) {
        this.states.delete(state);
      }
    }
    
    // Clean up verifiers
    for (const [state, data] of this.codeVerifiers.entries()) {
      if (now > data.expiry) {
        this.codeVerifiers.delete(state);
      }
    }
  }

  /**
   * Check if OIDC is configured and initialized
   */
  isEnabled() {
    return this.initialized;
  }

  /**
   * Get OIDC provider metadata
   */
  getProviderMetadata() {
    if (!this.initialized) {
      return null;
    }

    return {
      issuer: this.issuer.metadata.issuer,
      authorizationEndpoint: this.issuer.metadata.authorization_endpoint,
      tokenEndpoint: this.issuer.metadata.token_endpoint,
      userinfoEndpoint: this.issuer.metadata.userinfo_endpoint,
      endSessionEndpoint: this.issuer.metadata.end_session_endpoint
    };
  }
}

// Create singleton instance
const oidcService = new OidcService();

module.exports = oidcService;