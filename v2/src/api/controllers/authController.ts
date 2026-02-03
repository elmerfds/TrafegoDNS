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

const BCRYPT_ROUNDS = 12;

/**
 * Login with username/password
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = loginSchema.parse(req.body);

  const db = getDatabase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
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
      },
    },
  });
});

/**
 * Logout (clear cookie)
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
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
 * Create API key
 */
export const createApiKeyHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createApiKeySchema.parse(req.body);
  const db = getDatabase();

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
