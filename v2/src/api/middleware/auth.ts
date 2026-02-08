/**
 * Authentication middleware
 * Supports API key and JWT authentication
 */
import type { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../../database/connection.js';
import { apiKeys, users } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { ApiError } from './errorHandler.js';
import { createChildLogger } from '../../core/Logger.js';
import { getConfig, type AuthMode } from '../../config/ConfigManager.js';

const logger = createChildLogger({ service: 'Auth' });

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user' | 'readonly';
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  permissions: string[];
  userId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      apiKey?: ApiKeyInfo;
      authMethod?: 'jwt' | 'apikey' | 'global_apikey' | 'anonymous' | 'oidc';
    }
  }
}

/** Synthetic user for auth-disabled mode */
const ANONYMOUS_USER: AuthenticatedUser = {
  id: 'anonymous',
  username: 'anonymous',
  email: 'anonymous@trafegodns.local',
  role: 'admin',
};

/** Synthetic user for global API key access */
const GLOBAL_API_KEY_USER: AuthenticatedUser = {
  id: 'global-api-key',
  username: 'global_api_key',
  email: 'system@trafegodns.local',
  role: 'admin',
};

/**
 * JWT secret — loaded from ConfigManager which supports Docker Secrets.
 * Lazy-initialized on first use to ensure ConfigManager is ready.
 */
let _jwtSecret: string | undefined;
function getJwtSecret(): string {
  if (!_jwtSecret) {
    _jwtSecret = getConfig().app.jwtSecret;
    if (!_jwtSecret) {
      throw new Error('JWT_SECRET is not configured. Set JWT_SECRET environment variable.');
    }
  }
  return _jwtSecret;
}

// JWT algorithm — explicit to prevent algorithm confusion attacks
const JWT_ALGORITHM = 'HS256' as const;

// JWT expiration in seconds (default 24 hours)
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10);

/**
 * Hash an API key for storage/comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Verify a key against the global API key hash using timing-safe comparison
 */
function verifyGlobalApiKey(key: string): boolean {
  const config = getConfig();
  const expectedHash = config.security.globalApiKeyHash;
  if (!expectedHash) return false;

  const inputHash = Buffer.from(hashApiKey(key), 'hex');
  const storedHash = Buffer.from(expectedHash, 'hex');

  if (inputHash.length !== storedHash.length) return false;
  return timingSafeEqual(inputHash, storedHash);
}

/**
 * Generate a new API key using cryptographically secure random bytes
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = 'tdns_';
  // Use crypto.randomBytes for secure API key generation
  const randomPart = randomBytes(24).toString('base64url'); // 32 chars
  const key = `${prefix}${randomPart}`;
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

/**
 * Generate a JWT token
 */
export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN_SECONDS }
  );
}

/**
 * Verify a JWT token signature and validate user exists in database.
 * Returns the current user from DB (not the JWT payload) to ensure
 * role changes and deletions are respected immediately.
 */
export async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as {
      sub: string;
      username: string;
      email: string;
      role: 'admin' | 'user' | 'readonly';
    };

    // Validate user still exists in database and use current DB role
    const db = getDatabase();
    const [user] = await db
      .select({ id: users.id, username: users.username, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      logger.warn({ userId: payload.sub }, 'JWT valid but user no longer exists');
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  } catch {
    return null;
  }
}

/**
 * Verify an API key
 */
async function verifyApiKey(key: string): Promise<ApiKeyInfo | null> {
  const db = getDatabase();
  const hash = hashApiKey(key);

  const [apiKeyRecord] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!apiKeyRecord) {
    return null;
  }

  // Check expiration
  if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
    return null;
  }

  // Update last used timestamp
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKeyRecord.id));

  return {
    id: apiKeyRecord.id,
    name: apiKeyRecord.name,
    permissions: JSON.parse(apiKeyRecord.permissions) as string[],
    userId: apiKeyRecord.userId ?? undefined,
  };
}

/**
 * Authentication middleware
 * Checks for API key in header or JWT in cookie/header
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Auth disabled bypass — grant anonymous admin access
  const config = getConfig();
  if (config.security.authMode === 'none') {
    req.user = ANONYMOUS_USER;
    req.authMethod = 'anonymous';
    next();
    return;
  }

  // Check for API key in header
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader) {
    // Check global API key first (env-var master key)
    if (verifyGlobalApiKey(apiKeyHeader)) {
      req.user = GLOBAL_API_KEY_USER;
      req.authMethod = 'global_apikey';
      next();
      return;
    }

    // Fall through to user API key verification
    verifyApiKey(apiKeyHeader)
      .then((apiKeyInfo) => {
        if (!apiKeyInfo) {
          throw ApiError.unauthorized('Invalid API key');
        }
        req.apiKey = apiKeyInfo;
        req.authMethod = 'apikey';

        // If API key has associated user, load user info
        if (apiKeyInfo.userId) {
          const db = getDatabase();
          return db
            .select()
            .from(users)
            .where(eq(users.id, apiKeyInfo.userId))
            .limit(1)
            .then(([user]) => {
              if (user) {
                req.user = {
                  id: user.id,
                  username: user.username,
                  email: user.email,
                  role: user.role,
                };
              }
            });
        }
        return;
      })
      .then(() => next())
      .catch(next);
    return;
  }

  // Check for JWT in Authorization header or cookie
  const authHeader = req.headers.authorization;
  const tokenCookie = req.cookies?.token as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenCookie;

  if (token) {
    verifyToken(token)
      .then((user) => {
        if (!user) {
          next(ApiError.unauthorized('Invalid or expired token'));
          return;
        }
        req.user = user;
        req.authMethod = 'jwt';
        next();
      })
      .catch(next);
    return;
  }

  // No authentication provided
  next(ApiError.unauthorized('Authentication required'));
}

/**
 * Optional authentication middleware
 * Authenticates if credentials provided, but doesn't require them
 */
export function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;
  const tokenCookie = req.cookies?.token as string | undefined;

  // If no auth provided, continue without authentication
  if (!apiKeyHeader && !authHeader && !tokenCookie) {
    next();
    return;
  }

  // Otherwise, run full authentication
  authenticate(req, res, next);
}

/**
 * Require specific role
 */
export function requireRole(...roles: Array<'admin' | 'user' | 'readonly'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Global API key and anonymous (auth disabled) are always admin-level
    if (req.authMethod === 'global_apikey' || req.authMethod === 'anonymous') {
      next();
      return;
    }

    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden(`Required role: ${roles.join(' or ')}`));
      return;
    }

    // OWASP A01: When using API keys, also enforce key-level permissions.
    // Routes that only use requireRole (e.g. admin-only) must still respect
    // the key's granular permissions — a read-only key cannot perform writes.
    if (req.authMethod === 'apikey' && req.apiKey) {
      const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
      const isMutating = mutatingMethods.includes(req.method.toUpperCase());
      const requiredPerm = isMutating ? 'write' : 'read';
      const hasPermission =
        req.apiKey.permissions.includes('*') ||
        req.apiKey.permissions.includes(requiredPerm);

      if (!hasPermission) {
        next(ApiError.forbidden(`API key requires '${requiredPerm}' permission for ${req.method} requests`));
        return;
      }
    }

    next();
  };
}

/**
 * Require specific API key permission
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Global API key and anonymous (auth disabled) have full access
    if (req.authMethod === 'global_apikey' || req.authMethod === 'anonymous') {
      next();
      return;
    }

    // If using JWT auth with admin role, allow all
    if (req.authMethod === 'jwt' && req.user?.role === 'admin') {
      next();
      return;
    }

    // If using API key, check permissions
    if (req.apiKey) {
      const hasPermission = permissions.some(
        (p) => req.apiKey!.permissions.includes(p) || req.apiKey!.permissions.includes('*')
      );

      if (!hasPermission) {
        next(ApiError.forbidden(`Required permission: ${permissions.join(' or ')}`));
        return;
      }

      next();
      return;
    }

    // If using JWT auth, map role to permissions
    if (req.user) {
      const rolePermissions: Record<string, string[]> = {
        admin: ['*'],
        user: ['read', 'write'],
        readonly: ['read'],
      };

      const userPermissions = rolePermissions[req.user.role] ?? [];
      const hasPermission = permissions.some(
        (p) => userPermissions.includes(p) || userPermissions.includes('*')
      );

      if (!hasPermission) {
        next(ApiError.forbidden(`Required permission: ${permissions.join(' or ')}`));
        return;
      }

      next();
      return;
    }

    next(ApiError.unauthorized('Authentication required'));
  };
}
