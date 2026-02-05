/**
 * DNS Records Controller
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { dnsRecords } from '../../database/schema/index.js';
import { eq, and, like, or, sql } from 'drizzle-orm';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import {
  createDnsRecordSchema,
  updateDnsRecordSchema,
  dnsRecordFilterSchema,
  toggleManagedSchema,
} from '../validation.js';
import type { DNSManager } from '../../services/DNSManager.js';

/**
 * List DNS records with filtering and pagination
 */
export const listRecords = asyncHandler(async (req: Request, res: Response) => {
  const filter = dnsRecordFilterSchema.parse(req.query);
  const db = getDatabase();

  // Build where conditions
  const conditions = [];
  if (filter.type) {
    conditions.push(eq(dnsRecords.type, filter.type));
  }
  if (filter.name) {
    conditions.push(like(dnsRecords.name, `%${filter.name}%`));
  }
  if (filter.content) {
    conditions.push(like(dnsRecords.content, `%${filter.content}%`));
  }
  if (filter.providerId) {
    conditions.push(eq(dnsRecords.providerId, filter.providerId));
  }
  if (filter.source) {
    conditions.push(eq(dnsRecords.source, filter.source));
  }
  // Filter by managed status
  if (filter.managed !== undefined) {
    conditions.push(eq(dnsRecords.managed, filter.managed));
  }
  // General search - searches across name and content
  if (filter.search && filter.search.trim()) {
    const searchTerm = `%${filter.search.trim()}%`;
    conditions.push(
      sql`(${dnsRecords.name} LIKE ${searchTerm} OR ${dnsRecords.content} LIKE ${searchTerm})`
    );
  }
  // Filter by zone/domain - matches records ending with the zone
  if (filter.zone && filter.zone.trim()) {
    const zone = filter.zone.trim().toLowerCase();
    // Match exact zone or subdomains (e.g., "example.com" matches "app.example.com" and "example.com")
    conditions.push(
      sql`(LOWER(${dnsRecords.name}) = ${zone} OR LOWER(${dnsRecords.name}) LIKE ${`%.${zone}`})`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(dnsRecords)
    .where(whereClause);
  const count = countResult[0]?.count ?? 0;

  // Get paginated records
  const offset = (filter.page - 1) * filter.limit;
  const records = await db
    .select()
    .from(dnsRecords)
    .where(whereClause)
    .limit(filter.limit)
    .offset(offset)
    .orderBy(dnsRecords.name);

  res.json({
    success: true,
    data: {
      records,
      pagination: {
        page: filter.page,
        limit: filter.limit,
        total: count,
        totalPages: Math.ceil(count / filter.limit),
      },
    },
  });
});

/**
 * Get a single DNS record
 */
export const getRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  if (!record) {
    throw ApiError.notFound('DNS record');
  }

  res.json({
    success: true,
    data: record,
  });
});

/**
 * Create a new DNS record
 */
export const createRecord = asyncHandler(async (req: Request, res: Response) => {
  const input = createDnsRecordSchema.parse(req.body);
  const db = getDatabase();

  // Get DNS manager
  const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);

  // Use specified provider or fall back to default
  let provider;
  if (input.providerId) {
    provider = dnsManager.getProvider(input.providerId);
    if (!provider) {
      throw ApiError.badRequest(`Provider not found: ${input.providerId}`);
    }
  } else {
    provider = dnsManager.getDefaultProvider();
    if (!provider) {
      throw ApiError.badRequest('No default DNS provider configured');
    }
  }

  // Refresh provider cache and check if record already exists
  await provider.getRecordsFromCache(true); // Force refresh
  const existingRecord = provider.findRecordInCache(input.type, input.name);
  if (existingRecord) {
    throw ApiError.badRequest(
      `A ${input.type} record for '${input.name}' already exists with content '${existingRecord.content}'. ` +
      `Use the edit function to modify existing records.`
    );
  }

  // Create record in provider
  const providerRecord = await provider.createRecord({
    type: input.type,
    name: input.name,
    content: input.content,
    ttl: input.ttl,
    proxied: input.proxied,
    priority: input.priority,
    weight: input.weight,
    port: input.port,
    flags: input.flags,
    tag: input.tag,
  });

  // Save to database
  const id = uuidv4();
  const now = new Date();

  await db.insert(dnsRecords).values({
    id,
    providerId: provider.getProviderId(),
    externalId: providerRecord.id,
    type: providerRecord.type,
    name: providerRecord.name,
    content: providerRecord.content,
    ttl: providerRecord.ttl,
    proxied: providerRecord.proxied,
    priority: providerRecord.priority,
    weight: providerRecord.weight,
    port: providerRecord.port,
    flags: providerRecord.flags,
    tag: providerRecord.tag,
    comment: input.comment ?? null,
    source: 'api',
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'dnsRecord',
    resourceId: id,
    details: { name: input.name, type: input.type },
  });

  const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  res.status(201).json({
    success: true,
    data: record,
  });
});

/**
 * Update a DNS record
 */
export const updateRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateDnsRecordSchema.parse(req.body);
  const db = getDatabase();

  // Get existing record
  const [existing] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('DNS record');
  }

  // Get provider
  const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
  const provider = dnsManager.getProvider(existing.providerId);

  if (!provider) {
    throw ApiError.badRequest('Provider not found');
  }

  if (!existing.externalId) {
    throw ApiError.badRequest('Record has no external ID');
  }

  // Update in provider
  await provider.updateRecord(existing.externalId, {
    type: input.type ?? existing.type,
    name: input.name ?? existing.name,
    content: input.content ?? existing.content,
    ttl: input.ttl ?? existing.ttl,
    proxied: input.proxied ?? existing.proxied ?? undefined,
    priority: input.priority ?? existing.priority ?? undefined,
    weight: input.weight ?? existing.weight ?? undefined,
    port: input.port ?? existing.port ?? undefined,
    flags: input.flags ?? existing.flags ?? undefined,
    tag: input.tag ?? existing.tag ?? undefined,
  });

  // Update database
  await db
    .update(dnsRecords)
    .set({
      type: input.type ?? existing.type,
      name: input.name ?? existing.name,
      content: input.content ?? existing.content,
      ttl: input.ttl ?? existing.ttl,
      proxied: input.proxied ?? existing.proxied,
      priority: input.priority ?? existing.priority,
      weight: input.weight ?? existing.weight,
      port: input.port ?? existing.port,
      flags: input.flags ?? existing.flags,
      tag: input.tag ?? existing.tag,
      comment: input.comment ?? existing.comment,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dnsRecords.id, id));

  setAuditContext(req, {
    action: 'update',
    resourceType: 'dnsRecord',
    resourceId: id,
  });

  const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  res.json({
    success: true,
    data: record,
  });
});

/**
 * Delete a DNS record
 */
export const deleteRecord = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  // Get existing record
  const [existing] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('DNS record');
  }

  // Get provider and delete from it
  if (existing.externalId) {
    const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
    const provider = dnsManager.getProvider(existing.providerId);

    if (provider) {
      await provider.deleteRecord(existing.externalId);
    }
  }

  // Delete from database
  await db.delete(dnsRecords).where(eq(dnsRecords.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'dnsRecord',
    resourceId: id,
    details: { name: existing.name, type: existing.type },
  });

  res.json({
    success: true,
    message: 'DNS record deleted',
  });
});

/**
 * Bulk delete DNS records
 */
export const bulkDeleteRecords = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('No record IDs provided');
  }

  if (ids.length > 100) {
    throw ApiError.badRequest('Cannot delete more than 100 records at once');
  }

  const db = getDatabase();
  const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);

  let deleted = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of ids) {
    try {
      // Get existing record
      const [existing] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

      if (!existing) {
        failed++;
        errors.push({ id, error: 'Record not found' });
        continue;
      }

      // Delete from provider if has external ID
      if (existing.externalId) {
        const provider = dnsManager.getProvider(existing.providerId);
        if (provider) {
          try {
            await provider.deleteRecord(existing.externalId);
          } catch (providerError) {
            // Log but continue - the record might already be deleted at provider
            console.warn(`Failed to delete record ${id} from provider:`, providerError);
          }
        }
      }

      // Delete from database
      await db.delete(dnsRecords).where(eq(dnsRecords.id, id));
      deleted++;
    } catch (error) {
      failed++;
      errors.push({ id, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  setAuditContext(req, {
    action: 'bulk_delete',
    resourceType: 'dnsRecords',
    details: { requested: ids.length, deleted, failed },
  });

  res.json({
    success: true,
    data: {
      deleted,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    },
    message: `Deleted ${deleted} records${failed > 0 ? `, ${failed} failed` : ''}`,
  });
});

/**
 * Force sync DNS records - re-applies current provider defaults to all managed records
 */
export const syncRecords = asyncHandler(async (req: Request, res: Response) => {
  const { providerId } = req.query as { providerId?: string };

  // Get DNS manager
  const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);

  // Force re-sync records with current defaults
  const result = await dnsManager.forceResyncRecords(providerId);

  setAuditContext(req, {
    action: 'sync',
    resourceType: 'dnsRecords',
    details: {
      providerId: providerId ?? 'all',
      total: result.total,
      updated: result.updated,
      errors: result.errors,
    },
  });

  res.json({
    success: true,
    data: {
      total: result.total,
      updated: result.updated,
      unchanged: result.unchanged,
      errors: result.errors,
      details: result.details,
    },
    message: result.updated > 0
      ? `Synced ${result.updated} records with current defaults`
      : 'All records are already up to date',
  });
});

/**
 * Toggle managed status of a DNS record
 * Allows claiming ownership of pre-existing records or releasing TrafegoDNS management
 */
export const toggleManaged = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = toggleManagedSchema.parse(req.body);
  const db = getDatabase();

  // Get existing record
  const [existing] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('DNS record');
  }

  // Update managed status
  await db
    .update(dnsRecords)
    .set({
      managed: input.managed,
      source: input.managed ? 'managed' : 'discovered',
      updatedAt: new Date(),
    })
    .where(eq(dnsRecords.id, id));

  // If claiming the record, we could optionally update the comment at the provider
  // to add the ownership marker. For now, we just update our database.
  // This can be enhanced later to update provider comments.

  setAuditContext(req, {
    action: 'update',
    resourceType: 'dnsRecord',
    resourceId: id,
    details: { managed: input.managed, action: input.managed ? 'claim' : 'unclaim' },
  });

  const [record] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, id)).limit(1);

  res.json({
    success: true,
    data: record,
    message: input.managed ? 'Record claimed by TrafegoDNS' : 'Record released from TrafegoDNS management',
  });
});

/**
 * Export DNS records
 * Supports JSON and CSV formats
 */
export const exportRecords = asyncHandler(async (req: Request, res: Response) => {
  const { format = 'json', providerId, type, managed } = req.query as {
    format?: 'json' | 'csv';
    providerId?: string;
    type?: string;
    managed?: string;
  };
  const db = getDatabase();

  // Build where conditions
  const conditions = [];
  if (providerId) {
    conditions.push(eq(dnsRecords.providerId, providerId));
  }
  if (type) {
    conditions.push(eq(dnsRecords.type, type as typeof dnsRecords.type.enumValues[number]));
  }
  if (managed !== undefined) {
    conditions.push(eq(dnsRecords.managed, managed === 'true'));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const records = await db
    .select()
    .from(dnsRecords)
    .where(whereClause)
    .orderBy(dnsRecords.name);

  // Map to export format
  const exportData = records.map((r) => ({
    hostname: r.name,
    type: r.type,
    content: r.content,
    ttl: r.ttl,
    proxied: r.proxied,
    priority: r.priority,
    weight: r.weight,
    port: r.port,
    flags: r.flags,
    tag: r.tag,
    managed: r.managed,
    source: r.source,
    providerId: r.providerId,
  }));

  if (format === 'csv') {
    // Generate CSV
    const headers = ['hostname', 'type', 'content', 'ttl', 'proxied', 'priority', 'weight', 'port', 'flags', 'tag', 'managed', 'source', 'providerId'];
    const csvRows = [headers.join(',')];

    for (const record of exportData) {
      const row = headers.map((h) => {
        const value = record[h as keyof typeof record];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvRows.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dns-records-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvRows.join('\n'));
    return;
  }

  // JSON format
  res.setHeader('Content-Disposition', `attachment; filename="dns-records-${new Date().toISOString().split('T')[0]}.json"`);
  res.json({
    success: true,
    data: {
      exportedAt: new Date().toISOString(),
      count: exportData.length,
      records: exportData,
    },
  });
});

/**
 * Import DNS records
 * Accepts JSON array of records and creates them in the specified provider
 */
export const importRecords = asyncHandler(async (req: Request, res: Response) => {
  const { records: inputRecords, providerId, skipDuplicates = true, dryRun = false } = req.body as {
    records: Array<{
      hostname: string;
      type: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
      priority?: number;
      weight?: number;
      port?: number;
      flags?: number;
      tag?: string;
    }>;
    providerId: string;
    skipDuplicates?: boolean;
    dryRun?: boolean;
  };

  if (!inputRecords || !Array.isArray(inputRecords)) {
    throw ApiError.badRequest('Records array is required');
  }

  if (!providerId) {
    throw ApiError.badRequest('Provider ID is required');
  }

  if (inputRecords.length > 500) {
    throw ApiError.badRequest('Cannot import more than 500 records at once');
  }

  // Get DNS manager and provider
  const dnsManager = container.resolveSync<DNSManager>(ServiceTokens.DNS_MANAGER);
  const provider = dnsManager.getProvider(providerId);

  if (!provider) {
    throw ApiError.badRequest(`Provider not found: ${providerId}`);
  }

  const db = getDatabase();
  const results = {
    total: inputRecords.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [] as Array<{ hostname: string; error: string }>,
    preview: [] as Array<{ hostname: string; type: string; content: string; action: 'create' | 'skip' | 'error'; reason?: string }>,
  };

  // Refresh provider cache
  await provider.getRecordsFromCache(true);

  for (const record of inputRecords) {
    // Validate required fields
    if (!record.hostname || !record.type || !record.content) {
      results.failed++;
      results.errors.push({ hostname: record.hostname ?? 'unknown', error: 'Missing required fields (hostname, type, content)' });
      results.preview.push({
        hostname: record.hostname ?? 'unknown',
        type: record.type ?? 'unknown',
        content: record.content ?? 'unknown',
        action: 'error',
        reason: 'Missing required fields',
      });
      continue;
    }

    // Check if record already exists
    const existing = provider.findRecordInCache(record.type as any, record.hostname);
    if (existing) {
      if (skipDuplicates) {
        results.skipped++;
        results.preview.push({
          hostname: record.hostname,
          type: record.type,
          content: record.content,
          action: 'skip',
          reason: `Existing record: ${existing.content}`,
        });
        continue;
      } else {
        results.failed++;
        results.errors.push({ hostname: record.hostname, error: `Record already exists with content: ${existing.content}` });
        results.preview.push({
          hostname: record.hostname,
          type: record.type,
          content: record.content,
          action: 'error',
          reason: `Duplicate: ${existing.content}`,
        });
        continue;
      }
    }

    // Preview mode - don't actually create
    if (dryRun) {
      results.created++;
      results.preview.push({
        hostname: record.hostname,
        type: record.type,
        content: record.content,
        action: 'create',
      });
      continue;
    }

    // Create the record
    try {
      const providerRecord = await provider.createRecord({
        type: record.type as any,
        name: record.hostname,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied,
        priority: record.priority,
        weight: record.weight,
        port: record.port,
        flags: record.flags,
        tag: record.tag,
      });

      // Save to database
      const id = uuidv4();
      const now = new Date();

      await db.insert(dnsRecords).values({
        id,
        providerId: provider.getProviderId(),
        externalId: providerRecord.id,
        type: providerRecord.type,
        name: providerRecord.name,
        content: providerRecord.content,
        ttl: providerRecord.ttl,
        proxied: providerRecord.proxied,
        priority: providerRecord.priority,
        weight: providerRecord.weight,
        port: providerRecord.port,
        flags: providerRecord.flags,
        tag: providerRecord.tag,
        source: 'api',
        managed: true,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      results.created++;
      results.preview.push({
        hostname: record.hostname,
        type: record.type,
        content: record.content,
        action: 'create',
      });
    } catch (error) {
      results.failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push({ hostname: record.hostname, error: errorMessage });
      results.preview.push({
        hostname: record.hostname,
        type: record.type,
        content: record.content,
        action: 'error',
        reason: errorMessage,
      });
    }
  }

  if (!dryRun) {
    setAuditContext(req, {
      action: 'import',
      resourceType: 'dnsRecords',
      details: {
        providerId,
        total: results.total,
        created: results.created,
        skipped: results.skipped,
        failed: results.failed,
      },
    });
  }

  res.json({
    success: true,
    data: results,
    message: dryRun
      ? `Preview: ${results.created} to create, ${results.skipped} to skip, ${results.failed} errors`
      : `Imported ${results.created} records, skipped ${results.skipped}, failed ${results.failed}`,
  });
});
