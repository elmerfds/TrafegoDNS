/**
 * Preserved Hostnames Controller
 * Manages hostnames that should never be deleted during cleanup
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { preservedHostnames } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { z } from 'zod';

// Validation schemas
const createPreservedHostnameSchema = z.object({
  hostname: z.string().min(1).max(255),
  reason: z.string().max(500).optional(),
});

const updatePreservedHostnameSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * List all preserved hostnames
 */
export const listPreservedHostnames = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  const all = await db.select().from(preservedHostnames).orderBy(preservedHostnames.hostname);

  res.json({
    success: true,
    data: all,
  });
});

/**
 * Get a single preserved hostname
 */
export const getPreservedHostname = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [record] = await db
    .select()
    .from(preservedHostnames)
    .where(eq(preservedHostnames.id, id))
    .limit(1);

  if (!record) {
    throw ApiError.notFound('Preserved hostname');
  }

  res.json({
    success: true,
    data: record,
  });
});

/**
 * Create a new preserved hostname
 */
export const createPreservedHostname = asyncHandler(async (req: Request, res: Response) => {
  const input = createPreservedHostnameSchema.parse(req.body);
  const db = getDatabase();

  // Normalize hostname to lowercase
  const hostname = input.hostname.toLowerCase();

  // Check for duplicate
  const [existing] = await db
    .select()
    .from(preservedHostnames)
    .where(eq(preservedHostnames.hostname, hostname))
    .limit(1);

  if (existing) {
    throw ApiError.conflict('This hostname is already preserved');
  }

  const id = uuidv4();
  const now = new Date();

  await db.insert(preservedHostnames).values({
    id,
    hostname,
    reason: input.reason ?? null,
    createdAt: now,
    updatedAt: now,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'preserved_hostname',
    resourceId: id,
    details: { hostname, reason: input.reason },
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      hostname,
      reason: input.reason ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });
});

/**
 * Update a preserved hostname
 */
export const updatePreservedHostname = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updatePreservedHostnameSchema.parse(req.body);
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(preservedHostnames)
    .where(eq(preservedHostnames.id, id))
    .limit(1);

  if (!existing) {
    throw ApiError.notFound('Preserved hostname');
  }

  const now = new Date();

  await db
    .update(preservedHostnames)
    .set({
      reason: input.reason ?? null,
      updatedAt: now,
    })
    .where(eq(preservedHostnames.id, id));

  setAuditContext(req, {
    action: 'update',
    resourceType: 'preserved_hostname',
    resourceId: id,
    details: { hostname: existing.hostname, reason: input.reason },
  });

  res.json({
    success: true,
    data: {
      ...existing,
      reason: input.reason ?? null,
      updatedAt: now,
    },
  });
});

/**
 * Delete a preserved hostname
 */
export const deletePreservedHostname = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(preservedHostnames)
    .where(eq(preservedHostnames.id, id))
    .limit(1);

  if (!existing) {
    throw ApiError.notFound('Preserved hostname');
  }

  await db.delete(preservedHostnames).where(eq(preservedHostnames.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'preserved_hostname',
    resourceId: id,
    details: { hostname: existing.hostname },
  });

  res.json({
    success: true,
    message: 'Preserved hostname removed',
  });
});
