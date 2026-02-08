/**
 * Authentication Controller
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { getDatabase } from '../../database/connection.js';
import { users, apiKeys } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import {
  ApiError,
  asyncHandler,
  generateToken,
  generateApiKey,
  hashApiKey,
  setAuditContext,
} from '../middleware/index.js';
import { loginSchema, createApiKeySchema } from '../validation.js';
import { getConfig } from '../../config/ConfigManager.js';
import { sessionService, hashToken } from '../../services/SessionService.js';
import { securityLogService } from '../../services/SecurityLogService.js';

/**
 * Extract client IP from request (respects X-Forwarded-For behind proxy)
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]!.trim();
  if (Array.isArray(forwarded)) return forwarded[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** JWT expiration in seconds (mirrors auth.ts constant) */
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10);

const BCRYPT_ROUNDS = 12;

/**
 * Login with username/password
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  // When auth is disabled, return synthetic anonymous credentials
  const config = getConfig();
  if (config.security.authMode === 'none') {
    res.json({
      success: true,
      data: {
        token: 'auth-disabled',
        user: {
          id: 'anonymous',
          username: 'anonymous',
          email: 'anonymous@trafegodns.local',
          role: 'admin',
          avatar: null,
        },
      },
    });
    return;
  }

  // Block local login when OIDC-only mode is active
  if (config.security.authMode === 'oidc' && !config.oidc?.allowLocalLogin) {
    throw ApiError.badRequest('Local login is disabled. Please sign in with SSO.');
  }

  const { username, password } = loginSchema.parse(req.body);
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'];

  const db = getDatabase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    void securityLogService.logEvent({
      eventType: 'login_failure',
      ipAddress: clientIp,
      userAgent,
      authMethod: 'local',
      success: false,
      failureReason: 'user_not_found',
      details: { username },
    });
    throw ApiError.unauthorized('Invalid credentials');
  }

  // OIDC users cannot log in with local credentials
  if (!user.passwordHash) {
    void securityLogService.logEvent({
      eventType: 'login_failure',
      userId: user.id,
      ipAddress: clientIp,
      userAgent,
      authMethod: 'local',
      success: false,
      failureReason: 'oidc_user',
    });
    throw ApiError.unauthorized('This account uses SSO. Please sign in with your identity provider.');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    void securityLogService.logEvent({
      eventType: 'login_failure',
      userId: user.id,
      ipAddress: clientIp,
      userAgent,
      authMethod: 'local',
      success: false,
      failureReason: 'invalid_password',
    });
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Update last login
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  // Generate JWT
  const token = generateToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
  });

  // Create session
  await sessionService.createSession({
    userId: user.id,
    token,
    authMethod: 'local',
    ipAddress: clientIp,
    userAgent,
    expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
  });

  // Log security event
  void securityLogService.logEvent({
    eventType: 'login_success',
    userId: user.id,
    ipAddress: clientIp,
    userAgent,
    authMethod: 'local',
    success: true,
  });

  // Set audit context
  setAuditContext(req, {
    action: 'login',
    resourceType: 'user',
    resourceId: user.id,
  });

  // Set cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    },
  });
});

/**
 * Logout (clear cookie)
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Revoke session if we have one
  if (req.sessionId && req.user) {
    await sessionService.revokeSession(req.sessionId, req.user.id);
  }

  // Log security event
  void securityLogService.logEvent({
    eventType: 'logout',
    userId: req.user?.id,
    sessionId: req.sessionId,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
    authMethod: 'local',
    success: true,
  });

  setAuditContext(req, {
    action: 'logout',
    resourceType: 'user',
    resourceId: req.user?.id,
  });

  res.clearCookie('token');

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * Get current user
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const db = getDatabase();
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
      authProvider: users.authProvider,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, req.user.id))
    .limit(1);

  if (!user) {
    throw ApiError.notFound('User');
  }

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Maximum allowed permissions per role (OWASP A01: Broken Access Control)
 * Users cannot create API keys with more permissions than their role allows.
 */
const ROLE_ALLOWED_PERMISSIONS: Record<string, string[]> = {
  admin: ['*', 'read', 'write'],
  user: ['read', 'write'],
  readonly: ['read'],
};

/**
 * Create API key
 */
export const createApiKeyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createApiKeySchema.parse(req.body);
  const db = getDatabase();

  // OWASP A01: Validate requested permissions don't exceed user's role
  const userRole = req.user?.role ?? 'readonly';
  const allowedPerms = ROLE_ALLOWED_PERMISSIONS[userRole] ?? ['read'];
  const invalidPerms = input.permissions.filter(p => !allowedPerms.includes(p));
  if (invalidPerms.length > 0) {
    throw ApiError.forbidden(
      `Your role (${userRole}) cannot grant these permissions: ${invalidPerms.join(', ')}`
    );
  }

  // Generate API key
  const { key, prefix, hash } = generateApiKey();

  const id = uuidv4();
  await db.insert(apiKeys).values({
    id,
    userId: req.user?.id ?? null,
    name: input.name,
    keyHash: hash,
    keyPrefix: prefix,
    permissions: JSON.stringify(input.permissions),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'apiKey',
    resourceId: id,
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      name: input.name,
      key, // Only returned once!
      prefix,
      permissions: input.permissions,
      expiresAt: input.expiresAt,
    },
    message: 'API key created. Save the key - it will not be shown again.',
  });
});

/**
 * List API keys for current user
 */
export const listApiKeys = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  let query = db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys);

  // Filter by user if authenticated
  const keys = req.user
    ? await query.where(eq(apiKeys.userId, req.user.id))
    : await query;

  res.json({
    success: true,
    data: keys.map((key) => ({
      ...key,
      permissions: JSON.parse(key.permissions),
    })),
  });
});

/**
 * Revoke API key
 */
export const revokeApiKey = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  // Check key exists and belongs to user (or user is admin)
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);

  if (!key) {
    throw ApiError.notFound('API key');
  }

  // Only owner or admin can revoke
  if (key.userId !== req.user?.id && req.user?.role !== 'admin') {
    throw ApiError.forbidden('Cannot revoke this API key');
  }

  await db.delete(apiKeys).where(eq(apiKeys.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'apiKey',
    resourceId: id,
  });

  res.json({
    success: true,
    message: 'API key revoked',
  });
});

/**
 * Update current user's own profile (email, password, avatar)
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const { email, password, avatar } = req.body;
  const db = getDatabase();

  // Check user exists
  const [existing] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
  if (!existing) {
    throw ApiError.notFound('User');
  }

  // Check email conflict if changing
  if (email && email !== existing.email) {
    const [emailConflict] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (emailConflict) {
      throw ApiError.conflict('Email already in use');
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (email !== undefined) updateData.email = email;
  if (password !== undefined) {
    // Block password changes for OIDC users
    if (existing.authProvider === 'oidc') {
      throw ApiError.badRequest('Password cannot be changed for SSO accounts. Manage your password through your identity provider.');
    }
    if (password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }
    updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }
  if (avatar !== undefined) {
    // Validate avatar is a data URI or URL, or null to remove
    if (avatar !== null && avatar !== '') {
      const isDataUri = avatar.startsWith('data:image/');
      const isUrl = avatar.startsWith('http://') || avatar.startsWith('https://');
      if (!isDataUri && !isUrl) {
        throw ApiError.badRequest('Avatar must be a data URI or URL');
      }
      // Limit base64 size to ~500KB (after encoding, roughly 670KB string)
      if (isDataUri && avatar.length > 700000) {
        throw ApiError.badRequest('Avatar image too large (max 500KB)');
      }
    }
    updateData.avatar = avatar || null;
  }

  if (Object.keys(updateData).length === 1) {
    throw ApiError.badRequest('No changes to save');
  }

  await db.update(users).set(updateData).where(eq(users.id, req.user.id));

  // Log password change as security event
  if (password !== undefined) {
    void securityLogService.logEvent({
      eventType: 'password_change',
      userId: req.user.id,
      sessionId: req.sessionId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      authMethod: 'local',
      success: true,
    });
  }

  setAuditContext(req, {
    action: 'update',
    resourceType: 'user',
    resourceId: req.user.id,
    details: { self: true, avatarChanged: avatar !== undefined },
  });

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      avatar: users.avatar,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, req.user.id))
    .limit(1);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * List active sessions for current user
 */
export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  // Get current token hash for "isCurrent" flag
  const authHeader = req.headers.authorization;
  const tokenCookie = req.cookies?.token as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenCookie;
  const currentTokenHash = token ? hashToken(token) : undefined;

  const sessions = await sessionService.listUserSessions(req.user.id, currentTokenHash);

  res.json({
    success: true,
    data: sessions,
  });
});

/**
 * Revoke a specific session
 */
export const revokeSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const sessionId = req.params.id as string;

  // Prevent revoking current session (use logout instead)
  if (sessionId === req.sessionId) {
    throw ApiError.badRequest('Cannot revoke current session. Use logout instead.');
  }

  const revoked = await sessionService.revokeSession(sessionId, req.user.id);
  if (!revoked) {
    throw ApiError.notFound('Session');
  }

  // Log security event
  void securityLogService.logEvent({
    eventType: 'session_revoked',
    userId: req.user.id,
    sessionId,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
    success: true,
    details: { revokedSessionId: sessionId },
  });

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'session',
    resourceId: sessionId,
  });

  res.json({
    success: true,
    message: 'Session revoked',
  });
});

/**
 * Revoke all sessions except current
 */
export const revokeAllSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }

  const count = await sessionService.revokeAllUserSessions(req.user.id, req.sessionId);

  // Log security event
  void securityLogService.logEvent({
    eventType: 'session_revoked',
    userId: req.user.id,
    sessionId: req.sessionId,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
    success: true,
    details: { revokedCount: count, exceptCurrent: true },
  });

  res.json({
    success: true,
    data: { count },
    message: `${count} session(s) revoked`,
  });
});

/**
 * Helper to create initial admin user if none exists
 */
export async function ensureAdminUser(
  username: string = 'admin',
  password: string = 'admin',
  email: string = 'admin@localhost'
): Promise<void> {
  const db = getDatabase();

  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);

  if (existingAdmin) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.insert(users).values({
    id: uuidv4(),
    username,
    email,
    passwordHash,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
