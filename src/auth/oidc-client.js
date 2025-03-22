/**
 * src/auth/oidc-client.js
 * OpenID Connect client for authentication
 */
const { Issuer, generators } = require('openid-client');
const logger = require('../utils/logger');

class OpenIDConnectClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.issuer = null;
    
    // OIDC configuration
    this.oidcConfig = {
      provider: config.oidcProvider || null,
      clientId: config.oidcClientId || null,
      clientSecret: config.oidcClientSecret || null,
      redirectUri: config.oidcRedirectUri || null,
      scope: config.oidcScope || 'openid profile email',
      enabled: config.oidcEnabled === true
    };
  }
  
  /**
   * Initialize the OIDC client
   */
  async initialize() {
    if (!this.oidcConfig.enabled) {
      logger.info('OIDC authentication is disabled');
      return false;
    }
    
    if (!this.oidcConfig.provider || 
        !this.oidcConfig.clientId || 
        !this.oidcConfig.clientSecret ||
        !this.oidcConfig.redirectUri) {
      logger.warn('OIDC configuration is incomplete, disabling OIDC auth');
      this.oidcConfig.enabled = false;
      return false;
    }
    
    try {
      logger.info(`Initializing OIDC client for provider: ${this.oidcConfig.provider}`);
      
      // Discover the OIDC provider endpoints
      this.issuer = await Issuer.discover(this.oidcConfig.provider);
      
      // Create client
      this.client = new this.issuer.Client({
        client_id: this.oidcConfig.clientId,
        client_secret: this.oidcConfig.clientSecret,
        redirect_uris: [this.oidcConfig.redirectUri],
        response_types: ['code']
      });
      
      logger.debug('OIDC client initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize OIDC client: ${error.message}`);
      this.oidcConfig.enabled = false;
      return false;
    }
  }
  
  /**
   * Check if OIDC authentication is enabled
   * @returns {boolean} Whether OIDC is enabled
   */
  isEnabled() {
    return this.oidcConfig.enabled && this.client !== null;
  }
  
  /**
   * Generate an authorization URL for redirecting to the OIDC provider
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl() {
    if (!this.isEnabled()) {
      throw new Error('OIDC client is not initialized or disabled');
    }
    
    // Generate code challenge and verifier for PKCE
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    
    // Store code verifier in session or state
    // For simplicity, using a global cache - in production use Redis or similar
    global.oidcState = global.oidcState || {};
    const state = generators.state();
    global.oidcState[state] = { codeVerifier };
    
    // Generate URL
    const authUrl = this.client.authorizationUrl({
      scope: this.oidcConfig.scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state
    });
    
    return authUrl;
  }
  
  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from callback
   * @param {string} state - State parameter from callback
   * @returns {Object} Token response
   */
  async exchangeCodeForToken(code, state) {
    if (!this.isEnabled()) {
      throw new Error('OIDC client is not initialized or disabled');
    }
    
    // Retrieve code verifier from state
    global.oidcState = global.oidcState || {};
    const storedState = global.oidcState[state];
    
    if (!storedState) {
      throw new Error('Invalid or expired state parameter');
    }
    
    const { codeVerifier } = storedState;
    
    // Clean up state
    delete global.oidcState[state];
    
    // Exchange code for tokens
    const tokenSet = await this.client.callback(
      this.oidcConfig.redirectUri,
      { code, state },
      { code_verifier: codeVerifier }
    );
    
    return {
      access_token: tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      id_token: tokenSet.id_token,
      expires_in: tokenSet.expires_in,
      provider: this.getProviderName()
    };
  }
  
  /**
   * Get user information using access token
   * @param {string} accessToken - Access token
   * @returns {Object} User info
   */
  async getUserInfo(accessToken) {
    if (!this.isEnabled()) {
      throw new Error('OIDC client is not initialized or disabled');
    }
    
    const userinfo = await this.client.userinfo(accessToken);
    return userinfo;
  }
  
  /**
   * Get the provider name for storage
   * @returns {string} Provider name
   */
  getProviderName() {
    if (!this.oidcConfig.provider) {
      return 'unknown';
    }
    
    // Extract domain from provider URL
    try {
      const url = new URL(this.oidcConfig.provider);
      return url.hostname;
    } catch (e) {
      return 'oidc';
    }
  }
  
  /**
   * Refresh an access token using a refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} New token response
   */
  async refreshToken(refreshToken) {
    if (!this.isEnabled()) {
      throw new Error('OIDC client is not initialized or disabled');
    }
    
    const tokenSet = await this.client.refresh(refreshToken);
    
    return {
      access_token: tokenSet.access_token,
      refresh_token: tokenSet.refresh_token,
      id_token: tokenSet.id_token,
      expires_in: tokenSet.expires_in,
      provider: this.getProviderName()
    };
  }
}

module.exports = OpenIDConnectClient;