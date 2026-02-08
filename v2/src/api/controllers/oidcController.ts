/**
 * OIDC Authentication Controller
 * Handles login redirect and callback for OpenID Connect providers
 */
import type { Request, Response } from 'express';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { OIDCService } from '../../services/OIDCService.js';
import { generateToken } from '../middleware/auth.js';
import { setAuditContext } from '../middleware/index.js';
import { getConfig } from '../../config/ConfigManager.js';
import { createChildLogger } from '../../core/Logger.js';
import { sessionService } from '../../services/SessionService.js';
import { securityLogService } from '../../services/SecurityLogService.js';

/** JWT expiration in seconds (mirrors auth.ts constant) */
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10);

/**
 * Extract client IP from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  if (Array.isArray(forwarded)) return forwarded[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

const logger = createChildLogger({ service: 'OIDCController' });

/**
 * Determine whether cookies should use the Secure flag.
 * Uses the configured OIDC redirect URI as the source of truth —
 * if the app is served over HTTPS, cookies must be Secure.
 */
let _secureFlag: boolean | null = null;

function isSecureContext(): boolean {
  if (_secureFlag !== null) return _secureFlag;
  try {
    const config = getConfig();
    if (config.oidc?.redirectUri) {
      _secureFlag = new URL(config.oidc.redirectUri).protocol === 'https:';
      return _secureFlag;
    }
  } catch { /* fallback */ }
  _secureFlag = process.env.NODE_ENV === 'production';
  return _secureFlag;
}

/**
 * GET /auth/oidc/login
 * Redirects the user to the OIDC provider's authorization endpoint
 */
export async function oidcLogin(req: Request, res: Response): Promise<void> {
  try {
    const oidcService = container.resolveSync<OIDCService>(ServiceTokens.OIDC_SERVICE);

    const { url, state } = await oidcService.generateAuthorizationUrl();

    // Store state in httpOnly cookie for CSRF protection
    // SameSite=lax is required for cross-origin OIDC redirects
    res.cookie('oidc_state', state, {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000, // 5 minutes
      path: '/api/v1/auth/oidc',
    });

    res.redirect(302, url);
  } catch (error) {
    logger.error({ error }, 'Failed to initiate OIDC login');
    res.redirect('/login?error=oidc_init_failed');
  }
}

/**
 * GET /auth/oidc/callback
 * Handles the callback from the OIDC provider after user authentication
 */
export async function oidcCallback(req: Request, res: Response): Promise<void> {
  try {
    const oidcService = container.resolveSync<OIDCService>(ServiceTokens.OIDC_SERVICE);

    // Read and clear state cookie
    const expectedState = req.cookies?.oidc_state as string | undefined;
    res.clearCookie('oidc_state', { path: '/api/v1/auth/oidc' });

    logger.info(`OIDC callback received: hasStateCookie=${!!expectedState}, query=${JSON.stringify(req.query)}, cookies=${Object.keys(req.cookies || {}).join(',')}`);

    if (!expectedState) {
      logger.warn('OIDC callback: missing state cookie');
      res.redirect('/login?error=oidc_state_missing');
      return;
    }

    // Build the callback URL using the configured redirect URI as the base
    // This avoids protocol/host mismatches behind reverse proxies
    const redirectUri = getConfig().oidc!.redirectUri;
    const callbackUrl = new URL(redirectUri);
    // Append the query params from the actual request (code, state, etc.)
    const reqUrl = new URL(`http://localhost${req.originalUrl}`);
    reqUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });

    logger.info(`OIDC callback URL: ${callbackUrl.toString().replace(/code=[^&]+/, 'code=REDACTED')}`);

    // Exchange code for tokens and find/create user
    const oidcUser = await oidcService.handleCallback(callbackUrl, expectedState);

    // Generate our own JWT
    const token = generateToken({
      id: oidcUser.id,
      username: oidcUser.username,
      email: oidcUser.email,
      role: oidcUser.role,
    });

    // Create session
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    await sessionService.createSession({
      userId: oidcUser.id,
      token,
      authMethod: 'oidc',
      ipAddress: clientIp,
      userAgent,
      expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
    });

    // Log security event
    void securityLogService.logEvent({
      eventType: 'oidc_success',
      userId: oidcUser.id,
      ipAddress: clientIp,
      userAgent,
      authMethod: 'oidc',
      success: true,
      details: { isNewUser: oidcUser.isNewUser },
    });

    // Set JWT cookie (same as local login)
    res.cookie('token', token, {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Audit log
    setAuditContext(req, {
      action: 'login',
      resourceType: 'user',
      resourceId: oidcUser.id,
      details: { authMethod: 'oidc', isNewUser: oidcUser.isNewUser },
    });

    logger.info({ userId: oidcUser.id, username: oidcUser.username, isNewUser: oidcUser.isNewUser }, 'OIDC login successful');

    // Redirect to frontend
    res.redirect('/');
  } catch (error) {
    // Log security event
    void securityLogService.logEvent({
      eventType: 'oidc_failure',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      authMethod: 'oidc',
      success: false,
      failureReason: error instanceof Error ? error.message : String(error),
    });

    // Log full details server-side for debugging
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code;
    const cause = (error as any)?.cause;
    const causeStr = cause ? JSON.stringify(cause, null, 2) : undefined;
    logger.error(`OIDC callback failed: ${message}${code ? ` [code=${code}]` : ''}${causeStr ? ` [cause=${causeStr}]` : ''}`);
    if (error instanceof Error && error.stack) {
      logger.error(`OIDC stack: ${error.stack}`);
    }
    // Send generic error to frontend — never leak internal details
    res.redirect('/login?error=oidc_auth_failed');
  }
}
