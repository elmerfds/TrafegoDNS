/**
 * Webhook Service
 * Handles webhook dispatch with retry logic and HMAC signing
 */
import { createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes, type EventType, type EventPayloadMap } from '../core/EventBus.js';
import { getDatabase } from '../database/connection.js';
import { webhooks, webhookDeliveries } from '../database/schema/index.js';
import { eq, and, lt, isNull, isNotNull, or } from 'drizzle-orm';
import type { WebhookEventType } from '../types/index.js';
import type { Logger } from 'pino';

interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  error?: string;
}

export class WebhookService {
  private logger: Logger;
  private maxRetries: number;
  private retryDelay: number;
  private retryTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(options: { maxRetries?: number; retryDelay?: number } = {}) {
    this.logger = createChildLogger({ service: 'WebhookService' });
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 5000;
  }

  /**
   * Initialize the webhook service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Webhook service already initialized');
      return;
    }

    this.logger.debug('Initializing Webhook service');

    // Setup event subscriptions
    this.setupEventSubscriptions();

    // Start retry processor
    this.startRetryProcessor();

    this.initialized = true;
    this.logger.info('Webhook service initialized');
  }

  /**
   * Setup event subscriptions for webhook triggers
   */
  private setupEventSubscriptions(): void {
    // DNS events
    eventBus.subscribe(EventTypes.DNS_RECORD_CREATED, (data) => {
      void this.dispatch('dns.record.created', data);
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_UPDATED, (data) => {
      void this.dispatch('dns.record.updated', data);
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_DELETED, (data) => {
      void this.dispatch('dns.record.deleted', data);
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_ORPHANED, (data) => {
      void this.dispatch('dns.record.orphaned', data);
    });

    // Tunnel events
    eventBus.subscribe(EventTypes.TUNNEL_CREATED, (data) => {
      void this.dispatch('tunnel.created', data);
    });

    eventBus.subscribe(EventTypes.TUNNEL_DEPLOYED, (data) => {
      void this.dispatch('tunnel.deployed', data);
    });

    // System events
    eventBus.subscribe(EventTypes.DNS_SYNC_COMPLETED, (data) => {
      void this.dispatch('system.sync.completed', data);
    });

    eventBus.subscribe(EventTypes.ERROR_OCCURRED, (data) => {
      void this.dispatch('system.error', data);
    });
  }

  /**
   * Dispatch an event to all matching webhooks
   */
  async dispatch(event: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    const db = getDatabase();

    // Find all enabled webhooks that subscribe to this event
    const allWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.enabled, true));

    // Filter webhooks that subscribe to this event
    const matchingWebhooks = allWebhooks.filter((webhook) => {
      const events = JSON.parse(webhook.events) as string[];
      return events.includes(event);
    });

    if (matchingWebhooks.length === 0) {
      this.logger.debug({ event }, 'No webhooks subscribed to event');
      return;
    }

    this.logger.debug({ event, count: matchingWebhooks.length }, 'Dispatching event to webhooks');

    // Build payload
    const payload: WebhookPayload = {
      id: uuidv4(),
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Dispatch to each webhook
    for (const webhook of matchingWebhooks) {
      await this.deliverToWebhook(webhook, payload);
    }
  }

  /**
   * Deliver payload to a specific webhook
   */
  private async deliverToWebhook(
    webhook: typeof webhooks.$inferSelect,
    payload: WebhookPayload
  ): Promise<void> {
    const db = getDatabase();

    // Create delivery record
    const deliveryId = uuidv4();
    await db.insert(webhookDeliveries).values({
      id: deliveryId,
      webhookId: webhook.id,
      event: payload.event,
      payload: JSON.stringify(payload),
      attempts: 0,
    });

    // Attempt delivery
    const result = await this.attemptDelivery(webhook, payload);

    if (result.success) {
      // Mark as delivered
      await db
        .update(webhookDeliveries)
        .set({
          statusCode: result.statusCode,
          response: result.response,
          attempts: 1,
          deliveredAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      this.logger.info(
        { webhookId: webhook.id, event: payload.event, statusCode: result.statusCode },
        'Webhook delivered successfully'
      );

      eventBus.publish(EventTypes.WEBHOOK_DELIVERY_SUCCESS, {
        webhookId: webhook.id,
        deliveryId,
      });
    } else {
      // Schedule retry
      const nextRetryAt = new Date(Date.now() + this.retryDelay);

      await db
        .update(webhookDeliveries)
        .set({
          statusCode: result.statusCode,
          response: result.error,
          attempts: 1,
          nextRetryAt,
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      this.logger.warn(
        { webhookId: webhook.id, event: payload.event, error: result.error },
        'Webhook delivery failed, scheduled retry'
      );
    }
  }

  /**
   * Attempt to deliver a webhook
   */
  private async attemptDelivery(
    webhook: typeof webhooks.$inferSelect,
    payload: WebhookPayload
  ): Promise<DeliveryResult> {
    const payloadString = JSON.stringify(payload);

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TrafegoDNS/2.0',
      'X-Webhook-ID': payload.id,
      'X-Webhook-Event': payload.event,
    };

    // Add HMAC signature if secret is configured
    if (webhook.secret) {
      const signature = this.signPayload(payloadString, webhook.secret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
      headers['X-Webhook-Signature-256'] = signature;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseText = await response.text().catch(() => '');

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          response: responseText.slice(0, 1000), // Limit response size
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: responseText.slice(0, 1000),
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Sign payload with HMAC-SHA256
   */
  private signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Start the retry processor
   */
  private startRetryProcessor(): void {
    // Process retries every minute
    this.retryTimer = setInterval(() => {
      void this.processRetries();
    }, 60000);

    // Also run immediately
    void this.processRetries();
  }

  /**
   * Process failed deliveries that need retry
   */
  private async processRetries(): Promise<void> {
    const db = getDatabase();
    const now = new Date();

    // Find deliveries that need retry
    const pendingRetries = await db
      .select({
        delivery: webhookDeliveries,
        webhook: webhooks,
      })
      .from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhookDeliveries.webhookId, webhooks.id))
      .where(
        and(
          isNull(webhookDeliveries.deliveredAt),
          lt(webhookDeliveries.nextRetryAt, now),
          lt(webhookDeliveries.attempts, this.maxRetries)
        )
      )
      .limit(10); // Process 10 at a time

    if (pendingRetries.length === 0) {
      return;
    }

    this.logger.debug({ count: pendingRetries.length }, 'Processing webhook retries');

    for (const { delivery, webhook } of pendingRetries) {
      if (!webhook.enabled) {
        // Skip disabled webhooks
        continue;
      }

      const payload = JSON.parse(delivery.payload) as WebhookPayload;
      const result = await this.attemptDelivery(webhook, payload);

      const attempts = delivery.attempts + 1;

      if (result.success) {
        // Mark as delivered
        await db
          .update(webhookDeliveries)
          .set({
            statusCode: result.statusCode,
            response: result.response,
            attempts,
            deliveredAt: new Date(),
            nextRetryAt: null,
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        this.logger.info(
          { webhookId: webhook.id, deliveryId: delivery.id, attempts },
          'Webhook retry delivered successfully'
        );

        eventBus.publish(EventTypes.WEBHOOK_DELIVERY_SUCCESS, {
          webhookId: webhook.id,
          deliveryId: delivery.id,
        });
      } else if (attempts >= this.maxRetries) {
        // Max retries reached, mark as failed
        await db
          .update(webhookDeliveries)
          .set({
            statusCode: result.statusCode,
            response: result.error,
            attempts,
            nextRetryAt: null,
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        this.logger.error(
          { webhookId: webhook.id, deliveryId: delivery.id, attempts, error: result.error },
          'Webhook delivery failed after max retries'
        );

        eventBus.publish(EventTypes.WEBHOOK_DELIVERY_FAILED, {
          webhookId: webhook.id,
          deliveryId: delivery.id,
          error: result.error ?? 'Max retries exceeded',
        });
      } else {
        // Schedule next retry with exponential backoff
        const backoffDelay = this.retryDelay * Math.pow(2, attempts - 1);
        const nextRetryAt = new Date(Date.now() + backoffDelay);

        await db
          .update(webhookDeliveries)
          .set({
            statusCode: result.statusCode,
            response: result.error,
            attempts,
            nextRetryAt,
          })
          .where(eq(webhookDeliveries.id, delivery.id));

        this.logger.warn(
          { webhookId: webhook.id, deliveryId: delivery.id, attempts, nextRetryAt },
          'Webhook retry failed, scheduled next attempt'
        );
      }
    }
  }

  /**
   * Send a payload directly to a specific webhook (for testing)
   */
  async sendToWebhook(
    webhook: typeof webhooks.$inferSelect,
    event: WebhookEventType,
    data: Record<string, unknown>
  ): Promise<void> {
    const payload: WebhookPayload = {
      id: uuidv4(),
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const result = await this.attemptDelivery(webhook, payload);

    if (!result.success) {
      throw new Error(result.error ?? `Delivery failed with status ${result.statusCode}`);
    }
  }

  /**
   * Generate a webhook secret
   */
  static generateSecret(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Verify a webhook signature
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected || signature === `sha256=${expected}`;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.initialized = false;
    this.logger.debug('Webhook service disposed');
  }
}
