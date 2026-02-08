/**
 * OIDC Authentication Controller
 * Handles login redirect and callback for OpenID Connect providers
 */
import type { Request, Response } from 'express';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { OIDCService } from '../../services/OIDCService.js';
import { generateToken } from '../middleware/auth.js';
import { setAuditContext } from '../middleware/index.js';
import { createChildLogger } from '../../core/Logger.js';

const logger = createChildLogger({ service: 'OIDCController' });

/**
 * GET /auth/oidc/login
 * Redirects the user to the OIDC provider's authorization endpoint
 */
export async function oidcLogin(req: Request, res: Response): Promise<void> {
  try {
    const oidcService = container.resolveSync<OIDCService>(ServiceTokens.OIDC_SERVICE);
    const returnTo = req.query.returnTo as string | undefined;

    const { url, state } = await oidcService.generateAuthorizationUrl(returnTo);

    // Store state in httpOnly cookie for CSRF protection
    // SameSite=lax is required for cross-origin OIDC redirects
    res.cookie('oidc_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000, // 5 minutes
      path: '/api/v1/auth/oidc',
    });

    res.redirect(302, url);
  } catch (error) {
    logger.error({ error }, 'Failed to initiate OIDC login');
    res.redirect(`/login?error=oidc_init_failed`);
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

    if (!expectedState) {
      logger.warn('OIDC callback: missing state cookie');
      res.redirect('/?error=oidc_state_missing');
      return;
    }

    // Build the callback URL using the configured redirect URI as the base
    // This avoids protocol/host mismatches behind reverse proxies
    const config = (await import('../../config/ConfigManager.js')).getConfig();
    const redirectUri = config.oidc!.redirectUri;
    const callbackUrl = new URL(redirectUri);
    // Append the query params from the actual request (code, state, etc.)
    const reqUrl = new URL(`http://localhost${req.originalUrl}`);
    reqUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });

    // Exchange code for tokens and find/create user
    const oidcUser = await oidcService.handleCallback(callbackUrl, expectedState);

    // Generate our own JWT
    const token = generateToken({
      id: oidcUser.id,
      username: oidcUser.username,
      email: oidcUser.email,
      role: oidcUser.role,
    });

    // Set JWT cookie (same as local login)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error({ error: message, stack }, 'OIDC callback failed');
    res.redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}
