/**
 * Audit Service
 * Listens to system events and creates audit log entries
 */
import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventTypes } from '../core/EventBus.js';
import { getDatabase } from '../database/connection.js';
import { auditLogs } from '../database/schema/index.js';
import { createChildLogger } from '../core/Logger.js';

const logger = createChildLogger({ service: 'AuditService' });

export class AuditService {
  private initialized = false;

  /**
   * Initialize the audit service and subscribe to events
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing Audit Service');

    // Subscribe to DNS events
    eventBus.subscribe(EventTypes.DNS_RECORD_CREATED, async (data) => {
      await this.logEvent('create', 'dnsRecord', data.record.id, {
        name: data.record.name,
        type: data.record.type,
        content: data.record.content,
        providerId: data.providerId,
        source: 'auto-discovery',
      });
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_UPDATED, async (data) => {
      await this.logEvent('update', 'dnsRecord', data.record.id, {
        name: data.record.name,
        type: data.record.type,
        providerId: data.providerId,
        source: 'auto-discovery',
      });
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_DELETED, async (data) => {
      await this.logEvent('delete', 'dnsRecord', data.record.id, {
        name: data.record.name,
        type: data.record.type,
        providerId: data.providerId,
        reason: 'orphaned-cleanup',
      });
    });

    eventBus.subscribe(EventTypes.DNS_RECORD_ORPHANED, async (data) => {
      await this.logEvent('orphan', 'dnsRecord', data.record.id, {
        name: data.record.name,
        type: data.record.type,
        gracePeriodMinutes: data.gracePeriodMinutes,
      });
    });

    // Subscribe to tunnel events
    eventBus.subscribe(EventTypes.TUNNEL_CREATED, async (data) => {
      await this.logEvent('create', 'tunnel', data.tunnelId, {
        name: data.name,
      });
    });

    eventBus.subscribe(EventTypes.TUNNEL_DELETED, async (data) => {
      await this.logEvent('delete', 'tunnel', data.tunnelId, {
        name: data.name,
      });
    });

    eventBus.subscribe(EventTypes.TUNNEL_DEPLOYED, async (data) => {
      await this.logEvent('deploy', 'tunnel', data.tunnelId, {
        ingressRules: data.ingressRules,
      });
    });

    // Subscribe to settings changes
    eventBus.subscribe(EventTypes.SETTINGS_CHANGED, async (data) => {
      await this.logEvent('update', 'setting', data.key, {
        value: data.value,
        restartRequired: data.restartRequired,
      });
    });

    this.initialized = true;
    logger.info('Audit Service initialized');
  }

  /**
   * Log an event to the audit log
   */
  private async logEvent(
    action: 'create' | 'update' | 'delete' | 'bulk_delete' | 'login' | 'logout' | 'sync' | 'deploy' | 'orphan' | 'import' | 'export',
    resourceType: string,
    resourceId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      const db = getDatabase();
      const now = new Date();

      await db.insert(auditLogs).values({
        id: uuidv4(),
        userId: null, // System-generated events have no user
        action,
        resourceType,
        resourceId: resourceId ?? null,
        details: JSON.stringify(details ?? {}),
        ipAddress: 'system',
        userAgent: 'TrafegoDNS/auto-discovery',
        createdAt: now,
        updatedAt: now,
      });

      logger.debug(
        { action, resourceType, resourceId },
        'Audit event logged'
      );
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, action, resourceType, resourceId }, 'Failed to log audit event');
    }
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.initialized = false;
    logger.info('Audit Service disposed');
  }
}

// Export singleton
export const auditService = new AuditService();
