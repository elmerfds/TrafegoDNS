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
      authMethod?: 'jwt' | 'apikey';
    }
  }
}

// JWT secret MUST be set via environment variable for security
// Generate a secure random secret if not set (logs warning)
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Generate a secure random secret - this will change on restart
    // Log a warning to encourage proper configuration
    const generatedSecret = randomBytes(64).toString('base64url');
    console.warn(
      '\n⚠️  WARNING: JWT_SECRET environment variable not set!\n' +
      '   A random secret has been generated for this session.\n' +
      '   This will invalidate all tokens on restart.\n' +
      '   Please set JWT_SECRET in your environment for production use.\n'
    );
    return generatedSecret;
  }
  if (secret.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is shorter than 32 characters. Consider using a longer secret.');
  }
  return secret;
})();

// JWT expiration in seconds (default 24 hours)
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '86400', 10);

/**
 * Hash an API key for storage/comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
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
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN_SECONDS }
  );
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): AuthenticatedUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      username: string;
      email: string;
      role: 'admin' | 'user' | 'readonly';
    };

    return {
      id: payload.sub,
      username: payload.username,
      email: payload.email,
      role: payload.role,
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
  // Check for API key in header
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader) {
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

  // Check for JWT in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = verifyToken(token);

    if (!user) {
      next(ApiError.unauthorized('Invalid or expired token'));
      return;
    }

    req.user = user;
    req.authMethod = 'jwt';
    next();
    return;
  }

  // Check for JWT in cookie
  const tokenCookie = req.cookies?.token as string | undefined;
  if (tokenCookie) {
    const user = verifyToken(tokenCookie);

    if (!user) {
      next(ApiError.unauthorized('Invalid or expired token'));
      return;
    }

    req.user = user;
    req.authMethod = 'jwt';
    next();
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
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden(`Required role: ${roles.join(' or ')}`));
      return;
    }

    next();
  };
}

/**
 * Require specific API key permission
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
