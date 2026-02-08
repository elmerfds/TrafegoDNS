/**
 * Users Controller
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { getDatabase } from '../../database/connection.js';
import { users } from '../../database/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { createUserSchema, updateUserSchema, paginationSchema } from '../validation.js';

const BCRYPT_ROUNDS = 12;

/**
 * List all users (admin only)
 */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = paginationSchema.parse(req.query);
  const db = getDatabase();

  // Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(users);
  const count = countResult[0]?.count ?? 0;

  // Get paginated users
  const offset = (page - 1) * limit;
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .limit(limit)
    .offset(offset)
    .orderBy(users.username);

  res.json({
    success: true,
    data: {
      users: allUsers,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    },
  });
});

/**
 * Get a single user
 */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
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
    .where(eq(users.id, id))
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
 * Create a new user (admin only)
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const input = createUserSchema.parse(req.body);
  const db = getDatabase();

  // Check for duplicate username or email
  const [existingUsername] = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  if (existingUsername) {
    throw ApiError.conflict('Username already exists');
  }

  const [existingEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existingEmail) {
    throw ApiError.conflict('Email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const id = uuidv4();
  const now = new Date();

  await db.insert(users).values({
    id,
    username: input.username,
    email: input.email,
    passwordHash,
    role: input.role,
    createdAt: now,
    updatedAt: now,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'user',
    resourceId: id,
    details: { username: input.username, role: input.role },
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      username: input.username,
      email: input.email,
      role: input.role,
      createdAt: now,
    },
  });
});

/**
 * Update a user
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateUserSchema.parse(req.body);
  const db = getDatabase();

  // Check user exists
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('User');
  }

  // Check email conflict
  if (input.email && input.email !== existing.email) {
    const [emailConflict] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (emailConflict) {
      throw ApiError.conflict('Email already exists');
    }
  }

  // Prevent demoting the last admin
  if (input.role && input.role !== 'admin' && existing.role === 'admin') {
    const adminCountResult = await db
      .select({ adminCount: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, 'admin'));
    const adminCount = adminCountResult[0]?.adminCount ?? 0;

    if (adminCount <= 1) {
      throw ApiError.badRequest('Cannot demote the last admin user');
    }
  }

  // Build update object
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.email !== undefined) updateData.email = input.email;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.password !== undefined) {
    updateData.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  }

  await db.update(users).set(updateData).where(eq(users.id, id));

  setAuditContext(req, {
    action: 'update',
    resourceType: 'user',
    resourceId: id,
  });

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
    .where(eq(users.id, id))
    .limit(1);

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Delete a user (admin only)
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  // Check user exists
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('User');
  }

  // Prevent deleting yourself
  if (existing.id === req.user?.id) {
    throw ApiError.badRequest('Cannot delete your own account');
  }

  // Prevent deleting the last admin
  if (existing.role === 'admin') {
    const adminCountResult = await db
      .select({ adminCount: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, 'admin'));
    const adminCount = adminCountResult[0]?.adminCount ?? 0;

    if (adminCount <= 1) {
      throw ApiError.badRequest('Cannot delete the last admin user');
    }
  }

  await db.delete(users).where(eq(users.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'user',
    resourceId: id,
    details: { username: existing.username },
  });

  res.json({
    success: true,
    message: 'User deleted',
  });
});
