/**
 * OIDC Authentication Service
 * Handles OpenID Connect authentication using the BFF (Backend-for-Frontend) pattern.
 * All OIDC logic stays server-side; the browser only sees our own JWT.
 */
import * as oidcClient from 'openid-client';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { getDatabase } from '../database/connection.js';
import { users } from '../database/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { getConfig, type OIDCConfig } from '../config/ConfigManager.js';
import { createChildLogger } from '../core/Logger.js';

const logger = createChildLogger({ service: 'OIDCService' });

interface PendingState {
  codeVerifier: string;
  nonce: string;
  createdAt: number;
}

export interface OIDCUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
  avatar: string | null;
  isNewUser: boolean;
}

export class OIDCService {
  private config: OIDCConfig;
  private oidcConfig: oidcClient.Configuration | null = null;
  private pendingStates: Map<string, PendingState> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OIDCConfig) {
    this.config = config;
  }

  /**
   * Initialize OIDC discovery — must be called before use
   */
  async init(): Promise<void> {
    logger.info({ issuerUrl: this.config.issuerUrl }, 'Initializing OIDC discovery');

    const issuer = new URL(this.config.issuerUrl);

    // Only allow insecure (HTTP) requests if the issuer URL is explicitly HTTP.
    // HTTPS issuers enforce TLS for discovery, token exchange, and userinfo.
    const execute: Array<(config: oidcClient.Configuration) => void> = [];
    if (issuer.protocol === 'http:') {
      logger.warn('OIDC issuer uses HTTP — TLS is not enforced. Do NOT use this in production.');
      execute.push(oidcClient.allowInsecureRequests);
    }

    this.oidcConfig = await oidcClient.discovery(
      issuer,
      this.config.clientId,
      this.config.clientSecret,
      oidcClient.ClientSecretBasic(this.config.clientSecret),
      {
        execute,
      }
    );

    const metadata = this.oidcConfig.serverMetadata();
    logger.info({
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      userinfoEndpoint: metadata.userinfo_endpoint,
    }, 'OIDC discovery complete');

    // Start periodic cleanup of expired pending states
    this.cleanupTimer = setInterval(() => this.cleanupExpiredStates(), 60_000);
  }

  /**
   * Generate an authorization URL for redirecting the user to the OIDC provider
   */
  async generateAuthorizationUrl(): Promise<{ url: string; state: string }> {
    if (!this.oidcConfig) throw new Error('OIDCService not initialized');

    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
    const state = randomBytes(32).toString('base64url');
    const nonce = oidcClient.randomNonce();

    // Store pending state for callback validation (5-min TTL)
    this.pendingStates.set(state, {
      codeVerifier,
      nonce,
      createdAt: Date.now(),
    });

    const parameters: Record<string, string> = {
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    };

    const url = oidcClient.buildAuthorizationUrl(this.oidcConfig, parameters);

    logger.debug({ state }, 'Authorization URL generated');
    return { url: url.href, state };
  }

  /**
   * Handle the OIDC callback — exchange code for tokens, find/create user
   */
  async handleCallback(callbackUrl: URL, expectedState: string): Promise<OIDCUser> {
    if (!this.oidcConfig) throw new Error('OIDCService not initialized');

    // Validate and consume pending state
    const pending = this.pendingStates.get(expectedState);
    if (!pending) {
      throw new Error('Invalid or expired OIDC state');
    }
    this.pendingStates.delete(expectedState);

    // Check state TTL (5 minutes)
    if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
      throw new Error('OIDC state expired');
    }

    // Exchange authorization code for tokens
    const tokens = await oidcClient.authorizationCodeGrant(
      this.oidcConfig,
      callbackUrl,
      {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState,
        expectedNonce: pending.nonce,
      }
    );

    // Get claims from ID token
    const claims = tokens.claims();
    if (!claims) {
      throw new Error('No ID token claims in OIDC response');
    }

    // Fetch UserInfo for additional claims (groups, email, etc.)
    let userInfo: oidcClient.UserInfoResponse | undefined;
    try {
      userInfo = await oidcClient.fetchUserInfo(
        this.oidcConfig,
        tokens.access_token,
        claims.sub
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch UserInfo, falling back to ID token claims');
    }

    // Merge claims: UserInfo takes precedence over ID token
    const sub = claims.sub;
    const email = (userInfo?.email ?? claims.email ?? '') as string;
    const name = (userInfo?.name ?? claims.name ?? userInfo?.preferred_username ?? claims.preferred_username ?? '') as string;
    const picture = (userInfo?.picture ?? claims.picture ?? null) as string | null;
    const groups = this.extractGroups(userInfo, claims);

    if (!email) {
      throw new Error('OIDC provider did not return an email address. Ensure "email" scope is requested.');
    }

    // Map groups to application role
    const role = this.mapGroupsToRole(groups);

    logger.info({ sub, email, name, groups, role }, 'OIDC user authenticated');

    // Find or create user in database
    return this.findOrCreateUser(sub, email, name, role, picture);
  }

  /**
   * Extract groups from UserInfo/claims
   */
  private extractGroups(
    userInfo: oidcClient.UserInfoResponse | undefined,
    claims: oidcClient.IDToken
  ): string[] {
    const groupClaim = this.config.groupClaim;

    // Try UserInfo first, then ID token
    const raw =
      (userInfo as Record<string, unknown>)?.[groupClaim] ??
      (claims as Record<string, unknown>)?.[groupClaim];

    if (Array.isArray(raw)) {
      return raw.map(String);
    }
    if (typeof raw === 'string') {
      return raw.split(',').map((g) => g.trim()).filter(Boolean);
    }
    return [];
  }

  /**
   * Map OIDC groups to application role
   * Priority: admin > user > readonly > default
   */
  mapGroupsToRole(groups: string[]): 'admin' | 'user' | 'readonly' {
    if (this.config.adminGroups.length > 0 && groups.some((g) => this.config.adminGroups.includes(g))) {
      return 'admin';
    }
    if (this.config.userGroups.length > 0 && groups.some((g) => this.config.userGroups.includes(g))) {
      return 'user';
    }
    if (this.config.readonlyGroups.length > 0 && groups.some((g) => this.config.readonlyGroups.includes(g))) {
      return 'readonly';
    }
    return this.config.defaultRole;
  }

  /**
   * Find existing user by OIDC subject+issuer, or by email, or create new
   */
  private async findOrCreateUser(
    sub: string,
    email: string,
    displayName: string,
    role: 'admin' | 'user' | 'readonly',
    avatar: string | null
  ): Promise<OIDCUser> {
    const db = getDatabase();
    const issuer = this.config.issuerUrl;

    // 1. Try to find by OIDC subject + issuer (exact match)
    const [existingByOidc] = await db
      .select()
      .from(users)
      .where(and(eq(users.oidcSubject, sub), eq(users.oidcIssuer, issuer)))
      .limit(1);

    if (existingByOidc) {
      // Update role on every login to reflect current group membership
      await db
        .update(users)
        .set({
          role,
          lastLoginAt: new Date(),
          avatar: avatar ?? existingByOidc.avatar,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByOidc.id));

      return {
        id: existingByOidc.id,
        username: existingByOidc.username,
        email: existingByOidc.email,
        role,
        avatar: avatar ?? existingByOidc.avatar,
        isNewUser: false,
      };
    }

    // 2. Try to find by email (link existing local user to OIDC)
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingByEmail) {
      // Link existing user to OIDC
      await db
        .update(users)
        .set({
          authProvider: 'oidc',
          oidcSubject: sub,
          oidcIssuer: issuer,
          role,
          lastLoginAt: new Date(),
          avatar: avatar ?? existingByEmail.avatar,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id));

      logger.info({ userId: existingByEmail.id, email }, 'Linked existing user to OIDC');

      return {
        id: existingByEmail.id,
        username: existingByEmail.username,
        email: existingByEmail.email,
        role,
        avatar: avatar ?? existingByEmail.avatar,
        isNewUser: false,
      };
    }

    // 3. Create new user if auto-creation is enabled
    if (!this.config.autoCreateUsers) {
      throw new Error(
        `User with email ${email} not found and auto-creation is disabled (OIDC_AUTO_CREATE_USERS=false)`
      );
    }

    // Generate a username from email or display name
    const username = this.generateUsername(displayName, email);

    const id = uuidv4();
    await db.insert(users).values({
      id,
      username,
      email,
      passwordHash: null, // OIDC users have no local password
      role,
      avatar,
      authProvider: 'oidc',
      oidcSubject: sub,
      oidcIssuer: issuer,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info({ userId: id, username, email, role }, 'Created new OIDC user');

    return {
      id,
      username,
      email,
      role,
      avatar,
      isNewUser: true,
    };
  }

  /**
   * Generate a unique username from display name or email
   */
  private generateUsername(displayName: string, email: string): string {
    // Prefer display name, fallback to email local part
    let base = displayName || email.split('@')[0] || 'user';
    // Sanitize: lowercase, replace non-alphanumeric with underscore
    base = base.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 30);
    // Add short random suffix to avoid collisions
    const suffix = randomBytes(3).toString('hex');
    return `${base}_${suffix}`;
  }

  /**
   * Remove expired pending states (older than 5 minutes)
   */
  private cleanupExpiredStates(): void {
    const cutoff = Date.now() - 5 * 60 * 1000;
    let cleaned = 0;
    for (const [state, pending] of this.pendingStates) {
      if (pending.createdAt < cutoff) {
        this.pendingStates.delete(state);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up expired OIDC states');
    }
  }

  /**
   * Dispose — stop cleanup timer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pendingStates.clear();
    logger.info('OIDCService disposed');
  }
}
