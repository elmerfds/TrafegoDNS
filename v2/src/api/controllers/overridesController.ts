/**
 * Hostname Overrides Controller
 * Manages per-hostname settings that override defaults during sync
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { hostnameOverrides } from '../../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { z } from 'zod';
import type { DNSManager } from '../../services/DNSManager.js';

// Validation schemas
const createOverrideSchema = z.object({
  hostname: z.string().min(1).max(255),
  proxied: z.boolean().nullable().optional(),
  ttl: z.number().int().positive().nullable().optional(),
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS']).nullable().optional(),
  content: z.string().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  reason: z.string().max(255).nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

const updateOverrideSchema = z.object({
  hostname: z.string().min(1).max(255).optional(),
  proxied: z.boolean().nullable().optional(),
  ttl: z.number().int().positive().nullable().optional(),
  recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS']).nullable().optional(),
  content: z.string().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  reason: z.string().max(255).nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * List all hostname overrides
 */
export const listOverrides = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const overrides = await db.select().from(hostnameOverrides).orderBy(hostnameOverrides.hostname);

  res.json({
    success: true,
    data: overrides,
  });
});

/**
 * Get a single hostname override
 */
export const getOverride = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [override] = await db
    .select()
    .from(hostnameOverrides)
    .where(eq(hostnameOverrides.id, id))
    .limit(1);

  if (!override) {
    throw ApiError.notFound('Hostname override');
  }

  res.json({
    success: true,
    data: override,
  });
});

/**
 * Create a new hostname override
 */
export const createOverride = asyncHandler(async (req: Request, res: Response) => {
  const input = createOverrideSchema.parse(req.body);
  const db = getDatabase();

  // Check if hostname already has an override
  const [existing] = await db
    .select()
    .from(hostnameOverrides)
    .where(eq(hostnameOverrides.hostname, input.hostname.toLowerCase()))
    .limit(1);

  if (existing) {
    throw ApiError.badRequest(`Override already exists for hostname: ${input.hostname}`);
  }

  const id = uuidv4();
  const now = new Date();

  await db.insert(hostnameOverrides).values({
    id,
    hostname: input.hostname.toLowerCase(),
    proxied: input.proxied ?? null,
    ttl: input.ttl ?? null,
    recordType: input.recordType ?? null,
    content: input.content ?? null,
    providerId: input.providerId ?? null,
    reason: input.reason ?? null,
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  // Refresh DNS Manager's override cache
  try {
    const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
    await dnsManager.refreshHostnameOverrides();
  } catch {
    // DNS Manager may not be initialized yet
  }

  setAuditContext(req, {
    action: 'create',
    resourceType: 'hostnameOverride',
    resourceId: id,
    details: { hostname: input.hostname },
  });

  const [override] = await db.select().from(hostnameOverrides).where(eq(hostnameOverrides.id, id)).limit(1);

  res.status(201).json({
    success: true,
    data: override,
    message: `Override created for ${input.hostname}`,
  });
});

/**
 * Update a hostname override
 */
export const updateOverride = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateOverrideSchema.parse(req.body);
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(hostnameOverrides)
    .where(eq(hostnameOverrides.id, id))
    .limit(1);

  if (!existing) {
    throw ApiError.notFound('Hostname override');
  }

  // If hostname is being changed, check for conflicts
  if (input.hostname && input.hostname.toLowerCase() !== existing.hostname.toLowerCase()) {
    const [conflict] = await db
      .select()
      .from(hostnameOverrides)
      .where(eq(hostnameOverrides.hostname, input.hostname.toLowerCase()))
      .limit(1);

    if (conflict) {
      throw ApiError.badRequest(`Override already exists for hostname: ${input.hostname}`);
    }
  }

  await db
    .update(hostnameOverrides)
    .set({
      hostname: input.hostname?.toLowerCase() ?? existing.hostname,
      proxied: input.proxied !== undefined ? input.proxied : existing.proxied,
      ttl: input.ttl !== undefined ? input.ttl : existing.ttl,
      recordType: input.recordType !== undefined ? input.recordType : existing.recordType,
      content: input.content !== undefined ? input.content : existing.content,
      providerId: input.providerId !== undefined ? input.providerId : existing.providerId,
      reason: input.reason !== undefined ? input.reason : existing.reason,
      enabled: input.enabled !== undefined ? input.enabled : existing.enabled,
      updatedAt: new Date(),
    })
    .where(eq(hostnameOverrides.id, id));

  // Refresh DNS Manager's override cache
  try {
    const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
    await dnsManager.refreshHostnameOverrides();
  } catch {
    // DNS Manager may not be initialized yet
  }

  setAuditContext(req, {
    action: 'update',
    resourceType: 'hostnameOverride',
    resourceId: id,
  });

  const [override] = await db.select().from(hostnameOverrides).where(eq(hostnameOverrides.id, id)).limit(1);

  res.json({
    success: true,
    data: override,
  });
});

/**
 * Delete a hostname override
 */
export const deleteOverride = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(hostnameOverrides)
    .where(eq(hostnameOverrides.id, id))
    .limit(1);

  if (!existing) {
    throw ApiError.notFound('Hostname override');
  }

  await db.delete(hostnameOverrides).where(eq(hostnameOverrides.id, id));

  // Refresh DNS Manager's override cache
  try {
    const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
    await dnsManager.refreshHostnameOverrides();
  } catch {
    // DNS Manager may not be initialized yet
  }

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'hostnameOverride',
    resourceId: id,
    details: { hostname: existing.hostname },
  });

  res.json({
    success: true,
    message: `Override deleted for ${existing.hostname}`,
  });
});

/**
 * Create override from existing DNS record
 * Preserves the current settings of a record as an override
 */
export const createOverrideFromRecord = asyncHandler(async (req: Request, res: Response) => {
  const { recordId } = req.body as { recordId: string };

  if (!recordId) {
    throw ApiError.badRequest('recordId is required');
  }

  const db = getDatabase();
  const { dnsRecords } = await import('../../database/schema/index.js');

  // Get the DNS record
  const [record] = await db
    .select()
    .from(dnsRecords)
    .where(eq(dnsRecords.id, recordId))
    .limit(1);

  if (!record) {
    throw ApiError.notFound('DNS record');
  }

  // Check if override already exists
  const [existing] = await db
    .select()
    .from(hostnameOverrides)
    .where(eq(hostnameOverrides.hostname, record.name.toLowerCase()))
    .limit(1);

  if (existing) {
    throw ApiError.badRequest(`Override already exists for hostname: ${record.name}`);
  }

  const id = uuidv4();
  const now = new Date();

  await db.insert(hostnameOverrides).values({
    id,
    hostname: record.name.toLowerCase(),
    proxied: record.proxied ?? null,
    ttl: record.ttl ?? null,
    recordType: record.type,
    content: record.content ?? null,
    providerId: record.providerId ?? null,
    reason: 'Created from existing record settings',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });

  // Refresh DNS Manager's override cache
  try {
    const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
    await dnsManager.refreshHostnameOverrides();
  } catch {
    // DNS Manager may not be initialized yet
  }

  setAuditContext(req, {
    action: 'create',
    resourceType: 'hostnameOverride',
    resourceId: id,
    details: { hostname: record.name, fromRecordId: recordId },
  });

  const [override] = await db.select().from(hostnameOverrides).where(eq(hostnameOverrides.id, id)).limit(1);

  res.status(201).json({
    success: true,
    data: override,
    message: `Override created for ${record.name} (preserves current settings)`,
  });
});
