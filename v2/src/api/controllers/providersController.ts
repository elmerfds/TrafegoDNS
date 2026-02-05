/**
 * Providers Controller
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { providers, dnsRecords } from '../../database/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { createProviderSchema, updateProviderSchema } from '../validation.js';
import { createProvider, TRAFEGO_OWNERSHIP_MARKER } from '../../providers/index.js';
import { getAllProviderTypes, getProviderTypeInfo } from '../../providers/providerTypes.js';
import type { ProviderType } from '../../types/index.js';

/**
 * Get all available provider types with their features
 */
export const listProviderTypes = asyncHandler(async (_req: Request, res: Response) => {
  const types = getAllProviderTypes();

  res.json({
    success: true,
    data: types,
  });
});

/**
 * Get a specific provider type info
 */
export const getProviderType = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type as string;
  const info = getProviderTypeInfo(type);

  if (!info) {
    throw ApiError.notFound('Provider type');
  }

  res.json({
    success: true,
    data: info,
  });
});

/**
 * List all providers
 */
export const listProviders = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  const allProviders = await db.select({
    id: providers.id,
    name: providers.name,
    type: providers.type,
    isDefault: providers.isDefault,
    enabled: providers.enabled,
    settings: providers.settings,
    credentials: providers.credentials,
    createdAt: providers.createdAt,
    updatedAt: providers.updatedAt,
  }).from(providers);

  // Non-sensitive credential fields that can be exposed (zone info)
  const nonSensitiveFields = ['domain', 'zoneName', 'zoneId', 'zone', 'region', 'accountId', 'url', 'hostedZoneId'];

  // Add type info (features) and extract zone info from credentials
  const providersWithFeatures = allProviders.map((p) => {
    const typeInfo = getProviderTypeInfo(p.type);

    // Safely parse settings and credentials
    let parsedSettings: Record<string, unknown> = {};
    let credentials: Record<string, string> = {};

    try {
      parsedSettings = p.settings ? JSON.parse(p.settings) : {};
    } catch {
      // Invalid settings JSON, use empty object
    }

    try {
      credentials = p.credentials ? JSON.parse(p.credentials) : {};
    } catch {
      // Invalid credentials JSON, use empty object
    }

    // Extract non-sensitive zone info from credentials and add to settings
    const zoneInfo: Record<string, string> = {};
    for (const [key, value] of Object.entries(credentials)) {
      if (nonSensitiveFields.includes(key) && value) {
        zoneInfo[key] = value;
      }
    }

    return {
      id: p.id,
      name: p.name,
      type: p.type,
      isDefault: p.isDefault,
      enabled: p.enabled,
      settings: { ...parsedSettings, ...zoneInfo },
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      features: typeInfo?.features ?? null,
    };
  });

  res.json({
    success: true,
    data: providersWithFeatures,
  });
});

/**
 * Get a single provider
 */
export const getProvider = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [provider] = await db
    .select({
      id: providers.id,
      name: providers.name,
      type: providers.type,
      isDefault: providers.isDefault,
      enabled: providers.enabled,
      settings: providers.settings,
      credentials: providers.credentials,
      createdAt: providers.createdAt,
      updatedAt: providers.updatedAt,
    })
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  if (!provider) {
    throw ApiError.notFound('Provider');
  }

  // Parse credentials and mask sensitive values
  const credentials = JSON.parse(provider.credentials) as Record<string, string>;
  const maskedCredentials: Record<string, string> = {};

  // Fields that should show their actual value (not sensitive)
  const nonSensitiveFields = ['domain', 'zoneName', 'zoneId', 'zone', 'region', 'accountId', 'url', 'hostedZoneId'];

  for (const [key, value] of Object.entries(credentials)) {
    if (nonSensitiveFields.includes(key)) {
      // Show actual value for non-sensitive fields
      maskedCredentials[key] = value;
    } else if (value) {
      // Mask sensitive fields (tokens, keys, secrets)
      maskedCredentials[key] = '••••••••' + (value.length > 8 ? value.slice(-4) : '');
    }
  }

  res.json({
    success: true,
    data: {
      ...provider,
      settings: JSON.parse(provider.settings),
      credentials: maskedCredentials,
    },
  });
});

/**
 * Create a new provider
 */
export const createProviderHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createProviderSchema.parse(req.body);
  const db = getDatabase();

  // Check for duplicate name
  const [existing] = await db
    .select()
    .from(providers)
    .where(eq(providers.name, input.name))
    .limit(1);

  if (existing) {
    throw ApiError.conflict('Provider with this name already exists');
  }

  // If setting as default, unset any existing default
  if (input.isDefault) {
    await db.update(providers).set({ isDefault: false });
  }

  const id = uuidv4();
  const now = new Date();

  await db.insert(providers).values({
    id,
    name: input.name,
    type: input.type,
    isDefault: input.isDefault,
    credentials: JSON.stringify(input.credentials),
    settings: JSON.stringify(input.settings ?? {}),
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'provider',
    resourceId: id,
    details: { name: input.name, type: input.type },
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      name: input.name,
      type: input.type,
      isDefault: input.isDefault,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    },
  });
});

/**
 * Update a provider
 */
export const updateProvider = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateProviderSchema.parse(req.body);
  const db = getDatabase();

  // Check exists
  const [existing] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('Provider');
  }

  // Check name conflict
  if (input.name && input.name !== existing.name) {
    const [nameConflict] = await db
      .select()
      .from(providers)
      .where(eq(providers.name, input.name))
      .limit(1);

    if (nameConflict) {
      throw ApiError.conflict('Provider with this name already exists');
    }
  }

  // If setting as default, unset any existing default
  if (input.isDefault === true) {
    await db.update(providers).set({ isDefault: false });
  }

  // Build update object
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.credentials !== undefined) updateData.credentials = JSON.stringify(input.credentials);
  if (input.settings !== undefined) updateData.settings = JSON.stringify(input.settings);
  if (input.isDefault !== undefined) updateData.isDefault = input.isDefault;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;

  await db.update(providers).set(updateData).where(eq(providers.id, id));

  // Build audit details showing what changed
  const auditDetails: Record<string, unknown> = { name: existing.name };
  if (input.name !== undefined && input.name !== existing.name) auditDetails.nameChanged = { from: existing.name, to: input.name };
  if (input.enabled !== undefined && input.enabled !== existing.enabled) auditDetails.enabledChanged = { from: existing.enabled, to: input.enabled };
  if (input.isDefault !== undefined && input.isDefault !== existing.isDefault) auditDetails.isDefaultChanged = { from: existing.isDefault, to: input.isDefault };
  if (input.credentials !== undefined) auditDetails.credentialsUpdated = true;

  setAuditContext(req, {
    action: 'update',
    resourceType: 'provider',
    resourceId: id,
    details: auditDetails,
  });

  const [provider] = await db
    .select({
      id: providers.id,
      name: providers.name,
      type: providers.type,
      isDefault: providers.isDefault,
      enabled: providers.enabled,
      createdAt: providers.createdAt,
      updatedAt: providers.updatedAt,
    })
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);

  res.json({
    success: true,
    data: provider,
  });
});

/**
 * Delete a provider
 */
export const deleteProvider = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [existing] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('Provider');
  }

  await db.delete(providers).where(eq(providers.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'provider',
    resourceId: id,
    details: { name: existing.name, type: existing.type },
  });

  res.json({
    success: true,
    message: 'Provider deleted',
  });
});

/**
 * Test provider connection
 */
export const testProvider = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [providerRecord] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);

  if (!providerRecord) {
    throw ApiError.notFound('Provider');
  }

  try {
    const credentials = JSON.parse(providerRecord.credentials) as Record<string, string>;

    const provider = createProvider({
      id: providerRecord.id,
      name: providerRecord.name,
      type: providerRecord.type as ProviderType,
      credentials,
    });

    await provider.init();

    // Try to list records to verify connection
    await provider.listRecords();

    await provider.dispose();

    res.json({
      success: true,
      data: {
        connected: true,
        message: 'Connection successful',
      },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        connected: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      },
    });
  }
});

/**
 * Test provider credentials without creating
 * Allows testing connection before saving the provider
 */
export const testProviderCredentials = asyncHandler(async (req: Request, res: Response) => {
  const input = createProviderSchema.parse(req.body);

  try {
    const provider = createProvider({
      id: 'test-provider',
      name: input.name,
      type: input.type as ProviderType,
      credentials: input.credentials,
    });

    await provider.init();

    // Try to list records to verify connection
    await provider.listRecords();

    await provider.dispose();

    res.json({
      success: true,
      data: {
        connected: true,
        message: 'Connection successful',
      },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        connected: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      },
    });
  }
});

/**
 * Discover and import all records from a provider
 * Records that already exist in the database are skipped
 * New records are imported with managed=false (unless they have TrafegoDNS ownership marker)
 */
export const discoverRecords = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [providerRecord] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);

  if (!providerRecord) {
    throw ApiError.notFound('Provider');
  }

  try {
    const credentials = JSON.parse(providerRecord.credentials) as Record<string, string>;

    const provider = createProvider({
      id: providerRecord.id,
      name: providerRecord.name,
      type: providerRecord.type as ProviderType,
      credentials,
    });

    await provider.init();

    // Get all records from the provider
    const providerRecords = await provider.listRecords();

    const now = new Date();
    let imported = 0;
    let skipped = 0;
    let managed = 0;
    let unmanaged = 0;

    for (const record of providerRecords) {
      // Check if record already exists in database (by external ID or name+type)
      const existingRecords = await db
        .select({ id: dnsRecords.id })
        .from(dnsRecords)
        .where(
          record.id
            ? eq(dnsRecords.externalId, record.id)
            : and(eq(dnsRecords.name, record.name), eq(dnsRecords.type, record.type), eq(dnsRecords.providerId, id))
        )
        .limit(1);

      if (existingRecords.length > 0) {
        skipped++;
        continue;
      }

      // Check if record has ownership marker
      const isOwned = provider.isOwnedByTrafego(record);

      // Import the record
      await db.insert(dnsRecords).values({
        id: uuidv4(),
        providerId: id,
        externalId: record.id ?? null,
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied ?? null,
        priority: record.priority ?? null,
        weight: record.weight ?? null,
        port: record.port ?? null,
        flags: record.flags ?? null,
        tag: record.tag ?? null,
        comment: record.comment ?? null,
        source: isOwned ? 'traefik' : 'discovered',
        managed: isOwned,
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      imported++;
      if (isOwned) {
        managed++;
      } else {
        unmanaged++;
      }
    }

    await provider.dispose();

    setAuditContext(req, {
      action: 'sync',
      resourceType: 'provider',
      resourceId: id,
      details: { action: 'discover', imported, skipped, managed, unmanaged },
    });

    res.json({
      success: true,
      data: {
        totalAtProvider: providerRecords.length,
        imported,
        skipped,
        managed,
        unmanaged,
      },
      message: `Discovered ${imported} new records (${managed} managed, ${unmanaged} unmanaged), ${skipped} already in database`,
    });
  } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : 'Discovery failed');
  }
});
