/**
 * Webhooks Controller
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../database/connection.js';
import { webhooks, webhookDeliveries } from '../../database/schema/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { container, ServiceTokens } from '../../core/ServiceContainer.js';
import { ApiError, asyncHandler, setAuditContext } from '../middleware/index.js';
import { createWebhookSchema, updateWebhookSchema, paginationSchema } from '../validation.js';
import type { WebhookService } from '../../services/WebhookService.js';

/**
 * List all webhooks
 */
export const listWebhooks = asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  const allWebhooks = await db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      url: webhooks.url,
      events: webhooks.events,
      enabled: webhooks.enabled,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks);

  res.json({
    success: true,
    data: allWebhooks.map((w) => ({
      ...w,
      events: JSON.parse(w.events),
    })),
  });
});

/**
 * Get a single webhook
 */
export const getWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [webhook] = await db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      url: webhooks.url,
      events: webhooks.events,
      enabled: webhooks.enabled,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  res.json({
    success: true,
    data: {
      ...webhook,
      events: JSON.parse(webhook.events),
    },
  });
});

/**
 * Create a new webhook
 */
export const createWebhook = asyncHandler(async (req: Request, res: Response) => {
  const input = createWebhookSchema.parse(req.body);
  const db = getDatabase();

  const id = uuidv4();
  const now = new Date();

  await db.insert(webhooks).values({
    id,
    name: input.name,
    url: input.url,
    secret: input.secret ?? null,
    events: JSON.stringify(input.events),
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  });

  setAuditContext(req, {
    action: 'create',
    resourceType: 'webhook',
    resourceId: id,
    details: { name: input.name, events: input.events },
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      name: input.name,
      url: input.url,
      events: input.events,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    },
  });
});

/**
 * Update a webhook
 */
export const updateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const input = updateWebhookSchema.parse(req.body);
  const db = getDatabase();

  const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('Webhook');
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.url !== undefined) updateData.url = input.url;
  if (input.secret !== undefined) updateData.secret = input.secret;
  if (input.events !== undefined) updateData.events = JSON.stringify(input.events);
  if (input.enabled !== undefined) updateData.enabled = input.enabled;

  await db.update(webhooks).set(updateData).where(eq(webhooks.id, id));

  setAuditContext(req, {
    action: 'update',
    resourceType: 'webhook',
    resourceId: id,
  });

  const [webhook] = await db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      url: webhooks.url,
      events: webhooks.events,
      enabled: webhooks.enabled,
      createdAt: webhooks.createdAt,
      updatedAt: webhooks.updatedAt,
    })
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  res.json({
    success: true,
    data: {
      ...webhook,
      events: JSON.parse(webhook!.events),
    },
  });
});

/**
 * Delete a webhook
 */
export const deleteWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);

  if (!existing) {
    throw ApiError.notFound('Webhook');
  }

  await db.delete(webhooks).where(eq(webhooks.id, id));

  setAuditContext(req, {
    action: 'delete',
    resourceType: 'webhook',
    resourceId: id,
    details: { name: existing.name },
  });

  res.json({
    success: true,
    message: 'Webhook deleted',
  });
});

/**
 * Test a webhook
 */
export const testWebhook = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDatabase();

  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  // Get webhook service
  if (!container.isInstantiated(ServiceTokens.WEBHOOK_SERVICE)) {
    throw ApiError.badRequest('Webhook service not available');
  }

  const webhookService = container.resolveSync<WebhookService>(ServiceTokens.WEBHOOK_SERVICE);

  // Send test event
  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery',
      webhookId: id,
      webhookName: webhook.name,
    },
  };

  try {
    await webhookService.sendToWebhook(webhook, 'test' as any, testPayload);

    res.json({
      success: true,
      data: {
        delivered: true,
        message: 'Test webhook sent successfully',
      },
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        delivered: false,
        message: error instanceof Error ? error.message : 'Failed to send test webhook',
      },
    });
  }
});

/**
 * Get webhook deliveries
 */
export const getWebhookDeliveries = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { page, limit } = paginationSchema.parse(req.query);
  const db = getDatabase();

  // Check webhook exists
  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);

  if (!webhook) {
    throw ApiError.notFound('Webhook');
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id));
  const count = countResult[0]?.count ?? 0;

  // Get deliveries
  const offset = (page - 1) * limit;
  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    success: true,
    data: {
      deliveries: deliveries.map((d) => ({
        ...d,
        payload: JSON.parse(d.payload),
      })),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    },
  });
});
