/**
 * Tunnel Manager Service
 * Orchestrates Cloudflare Tunnel management with database persistence
 */
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import { getDatabase } from '../database/connection.js';
import { tunnels, tunnelIngressRules, providers } from '../database/schema/index.js';
import { eq, and } from 'drizzle-orm';
import {
  CloudflareTunnels,
  type TunnelConfig,
  type TunnelIngressRule,
  type TunnelInfo,
  type TunnelConfiguration,
} from '../providers/cloudflare/index.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { Logger } from 'pino';

export interface TunnelManagerConfig {
  autoCreateCNAME: boolean;
  defaultOriginService: string;
}

export interface ManagedTunnel {
  id: string;
  externalTunnelId: string; // Cloudflare's tunnel UUID
  providerId: string;
  name: string;
  token?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagedIngressRule {
  id: string;
  tunnelId: string; // Local database tunnel ID
  hostname: string;
  service: string;
  path?: string;
  source?: 'auto' | 'api';
  orphanedAt?: Date | null;
  createdAt: Date;
}

export class TunnelManager {
  private logger: Logger;
  private config: ConfigManager;
  private tunnelsClient: CloudflareTunnels | null = null;
  private providerId: string | null = null;
  private initialized: boolean = false;

  constructor(config: ConfigManager) {
    this.config = config;
    this.logger = createChildLogger({ service: 'TunnelManager' });
  }

  /**
   * Initialize the Tunnel Manager
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Tunnel Manager already initialized');
      return;
    }

    this.logger.debug('Initializing Tunnel Manager');

    try {
      // Find the default Cloudflare provider with tunnel support
      const db = getDatabase();
      const cloudflareProviders = await db
        .select()
        .from(providers)
        .where(and(eq(providers.type, 'cloudflare'), eq(providers.enabled, true)));

      if (cloudflareProviders.length === 0) {
        this.logger.info('No Cloudflare provider configured, tunnel management disabled');
        this.initialized = true;
        return;
      }

      // Use the first (or default) Cloudflare provider
      const provider = cloudflareProviders.find((p) => p.isDefault) ?? cloudflareProviders[0];
      if (!provider) {
        this.logger.warn('No Cloudflare provider available for tunnels');
        this.initialized = true;
        return;
      }

      this.providerId = provider.id;

      // Parse credentials
      const credentials = JSON.parse(provider.credentials) as {
        apiToken: string;
        accountId?: string;
        zoneId?: string;
        zoneName?: string;
      };

      if (!credentials.accountId) {
        this.logger.warn('Cloudflare provider missing accountId, tunnel management disabled');
        this.initialized = true;
        return;
      }

      // Initialize CloudflareTunnels client
      this.tunnelsClient = new CloudflareTunnels(
        provider.id,
        credentials.apiToken,
        credentials.accountId,
        credentials.zoneName ?? '',
        credentials.zoneId
      );

      await this.tunnelsClient.init();

      // Sync existing tunnels
      await this.syncTunnels();

      this.initialized = true;
      this.logger.info('Tunnel Manager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Tunnel Manager');
      // Degrade gracefully — tunnel support will be unavailable but the app continues
      this.tunnelsClient = null;
      this.providerId = null;
      this.initialized = true;
    }
  }

  /**
   * Sync tunnels from Cloudflare to database
   */
  async syncTunnels(): Promise<void> {
    if (!this.tunnelsClient || !this.providerId) {
      this.logger.debug('Tunnel client not available, skipping sync');
      return;
    }

    this.logger.debug('Syncing tunnels from Cloudflare');

    try {
      const remoteTunnels = await this.tunnelsClient.listTunnels();
      const db = getDatabase();

      // Get existing tunnels from database
      const existingTunnels = await db
        .select()
        .from(tunnels)
        .where(eq(tunnels.providerId, this.providerId));

      const existingByExternalId = new Map(existingTunnels.map((t) => [t.tunnelId, t]));

      for (const remoteTunnel of remoteTunnels) {
        const existing = existingByExternalId.get(remoteTunnel.id);

        if (existing) {
          // Update existing tunnel
          await db
            .update(tunnels)
            .set({
              name: remoteTunnel.name,
              status: remoteTunnel.status,
              updatedAt: new Date(),
            })
            .where(eq(tunnels.id, existing.id));

          existingByExternalId.delete(remoteTunnel.id);
        } else {
          // Create new tunnel record
          await db.insert(tunnels).values({
            id: uuidv4(),
            providerId: this.providerId,
            tunnelId: remoteTunnel.id,
            name: remoteTunnel.name,
            status: remoteTunnel.status,
            createdAt: remoteTunnel.createdAt,
            updatedAt: new Date(),
          });
        }

        // Sync ingress rules for this tunnel
        await this.syncIngressRules(remoteTunnel.id);
      }

      // Mark tunnels that no longer exist remotely
      for (const [, orphaned] of existingByExternalId) {
        await db
          .update(tunnels)
          .set({
            status: 'deleted',
            updatedAt: new Date(),
          })
          .where(eq(tunnels.id, orphaned.id));
      }

      this.logger.debug({ count: remoteTunnels.length }, 'Tunnels synced');
    } catch (error) {
      this.logger.error({ error }, 'Failed to sync tunnels');
      throw error;
    }
  }

  /**
   * Sync ingress rules for a tunnel — merges CF state with local metadata (source, orphanedAt)
   */
  private async syncIngressRules(tunnelExternalId: string): Promise<void> {
    if (!this.tunnelsClient) return;

    const db = getDatabase();

    // Get the tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.tunnelId, tunnelExternalId))
      .limit(1);

    if (!tunnelRecord) return;

    try {
      const config = await this.tunnelsClient.getTunnelConfiguration(tunnelExternalId);
      if (!config) return;

      // Get existing local rules to preserve source and orphanedAt
      const existingRules = await db
        .select()
        .from(tunnelIngressRules)
        .where(eq(tunnelIngressRules.tunnelId, tunnelRecord.id));

      const existingByHostname = new Map(
        existingRules.map((r) => [r.hostname, r])
      );

      const remoteHostnames = new Set<string>();

      // Upsert rules from CF config
      for (const rule of config.ingress) {
        remoteHostnames.add(rule.hostname);
        const existing = existingByHostname.get(rule.hostname);

        if (existing) {
          // Update service/path if changed, but preserve source and orphanedAt
          if (existing.service !== rule.service || (existing.path ?? null) !== (rule.path ?? null)) {
            await db.update(tunnelIngressRules)
              .set({ service: rule.service, path: rule.path ?? null })
              .where(eq(tunnelIngressRules.id, existing.id));
          }
        } else {
          // New rule from CF that we don't have locally — mark as 'api' (manually created on CF)
          await db.insert(tunnelIngressRules).values({
            id: uuidv4(),
            tunnelId: tunnelRecord.id,
            hostname: rule.hostname,
            service: rule.service,
            path: rule.path ?? null,
            source: 'api',
            createdAt: new Date(),
          });
        }
      }

      // Remove local rules that no longer exist on CF
      for (const existing of existingRules) {
        if (!remoteHostnames.has(existing.hostname)) {
          await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.id, existing.id));
        }
      }
    } catch (error) {
      this.logger.warn({ error, tunnelId: tunnelExternalId }, 'Failed to sync ingress rules');
    }
  }

  /**
   * Create a new tunnel
   */
  async createTunnel(config: TunnelConfig): Promise<ManagedTunnel> {
    if (!this.tunnelsClient || !this.providerId) {
      throw new Error('Tunnel client not initialized');
    }

    this.logger.info({ name: config.name }, 'Creating tunnel');

    try {
      // Create in Cloudflare
      const tunnelInfo = await this.tunnelsClient.createTunnel(config);

      // Save to database
      const db = getDatabase();
      const id = uuidv4();
      const now = new Date();

      await db.insert(tunnels).values({
        id,
        providerId: this.providerId,
        tunnelId: tunnelInfo.id,
        name: tunnelInfo.name,
        status: tunnelInfo.status,
        createdAt: now,
        updatedAt: now,
      });

      this.logger.info({ id, externalTunnelId: tunnelInfo.id }, 'Tunnel created');

      return {
        id,
        externalTunnelId: tunnelInfo.id,
        providerId: this.providerId,
        name: tunnelInfo.name,
        status: tunnelInfo.status,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      this.logger.error({ error, name: config.name }, 'Failed to create tunnel');
      throw error;
    }
  }

  /**
   * Delete a tunnel
   */
  async deleteTunnel(tunnelId: string): Promise<boolean> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    this.logger.info({ tunnelId }, 'Deleting tunnel');

    const db = getDatabase();

    // Get tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.id, tunnelId))
      .limit(1);

    if (!tunnelRecord) {
      this.logger.warn({ tunnelId }, 'Tunnel not found');
      return false;
    }

    try {
      // Delete from Cloudflare
      await this.tunnelsClient.deleteTunnel(tunnelRecord.tunnelId);

      // Delete ingress rules from database
      await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.tunnelId, tunnelId));

      // Delete tunnel from database
      await db.delete(tunnels).where(eq(tunnels.id, tunnelId));

      this.logger.info({ id: tunnelId, externalTunnelId: tunnelRecord.tunnelId }, 'Tunnel deleted');

      return true;
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to delete tunnel');
      throw error;
    }
  }

  /**
   * Get tunnel by ID
   */
  async getTunnel(tunnelId: string): Promise<ManagedTunnel | null> {
    const db = getDatabase();

    const [record] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId)).limit(1);

    if (!record) return null;

    return {
      id: record.id,
      externalTunnelId: record.tunnelId,
      providerId: record.providerId,
      name: record.name,
      status: record.status,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }

  /**
   * List all managed tunnels
   */
  async listTunnels(): Promise<ManagedTunnel[]> {
    const db = getDatabase();

    const records = await db.select().from(tunnels);

    return records.map((record) => ({
      id: record.id,
      externalTunnelId: record.tunnelId,
      providerId: record.providerId,
      name: record.name,
      status: record.status,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    }));
  }

  /**
   * Add an ingress rule to a tunnel
   */
  async addIngressRule(tunnelId: string, rule: TunnelIngressRule): Promise<ManagedIngressRule> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    this.logger.info({ tunnelId, hostname: rule.hostname }, 'Adding ingress rule');

    const db = getDatabase();

    // Get tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.id, tunnelId))
      .limit(1);

    if (!tunnelRecord) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    try {
      // Add rule in Cloudflare
      await this.tunnelsClient.addIngressRule(tunnelRecord.tunnelId, rule);

      // Save to database
      const id = uuidv4();
      const now = new Date();

      await db.insert(tunnelIngressRules).values({
        id,
        tunnelId,
        hostname: rule.hostname,
        service: rule.service,
        path: rule.path ?? null,
        source: 'api',
        createdAt: now,
      });

      this.logger.info({ tunnelId, hostname: rule.hostname }, 'Ingress rule added');

      return {
        id,
        tunnelId,
        hostname: rule.hostname,
        service: rule.service,
        path: rule.path,
        source: 'api' as const,
        createdAt: now,
      };
    } catch (error) {
      this.logger.error({ error, tunnelId, hostname: rule.hostname }, 'Failed to add ingress rule');
      throw error;
    }
  }

  /**
   * Remove an ingress rule from a tunnel
   */
  async removeIngressRule(tunnelId: string, hostname: string): Promise<boolean> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    this.logger.info({ tunnelId, hostname }, 'Removing ingress rule');

    const db = getDatabase();

    // Get tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.id, tunnelId))
      .limit(1);

    if (!tunnelRecord) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    try {
      // Remove rule in Cloudflare
      await this.tunnelsClient.removeIngressRule(tunnelRecord.tunnelId, hostname);

      // Remove from database
      await db
        .delete(tunnelIngressRules)
        .where(and(eq(tunnelIngressRules.tunnelId, tunnelId), eq(tunnelIngressRules.hostname, hostname)));

      this.logger.info({ tunnelId, hostname }, 'Ingress rule removed');

      return true;
    } catch (error) {
      this.logger.error({ error, tunnelId, hostname }, 'Failed to remove ingress rule');
      throw error;
    }
  }

  /**
   * Get ingress rules for a tunnel
   */
  async getIngressRules(tunnelId: string): Promise<ManagedIngressRule[]> {
    const db = getDatabase();

    const records = await db
      .select()
      .from(tunnelIngressRules)
      .where(eq(tunnelIngressRules.tunnelId, tunnelId));

    return records.map((record) => ({
      id: record.id,
      tunnelId: record.tunnelId,
      hostname: record.hostname,
      service: record.service,
      path: record.path ?? undefined,
      source: (record.source as 'auto' | 'api') ?? 'api',
      orphanedAt: record.orphanedAt ? new Date(record.orphanedAt) : null,
      createdAt: new Date(record.createdAt),
    }));
  }

  /**
   * Update tunnel configuration with all ingress rules
   */
  async updateTunnelConfiguration(
    tunnelId: string,
    configuration: TunnelConfiguration
  ): Promise<void> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    this.logger.info({ tunnelId, ingressCount: configuration.ingress.length }, 'Updating tunnel configuration');

    const db = getDatabase();

    // Get tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.id, tunnelId))
      .limit(1);

    if (!tunnelRecord) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    try {
      // Update in Cloudflare
      await this.tunnelsClient.updateTunnelConfiguration(tunnelRecord.tunnelId, configuration);

      // Update database - remove all existing rules and insert new ones
      await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.tunnelId, tunnelId));

      for (const rule of configuration.ingress) {
        await db.insert(tunnelIngressRules).values({
          id: uuidv4(),
          tunnelId,
          hostname: rule.hostname,
          service: rule.service,
          path: rule.path ?? null,
          createdAt: new Date(),
        });
      }

      // Update tunnel timestamp
      await db
        .update(tunnels)
        .set({ updatedAt: new Date() })
        .where(eq(tunnels.id, tunnelId));

      this.logger.info({ tunnelId }, 'Tunnel configuration updated');
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to update tunnel configuration');
      throw error;
    }
  }

  /**
   * Get tunnel connector token
   * Fetches from Cloudflare API and caches in database
   */
  async getToken(tunnelId: string): Promise<string> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    const db = getDatabase();
    const [tunnelRecord] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId)).limit(1);

    if (!tunnelRecord) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    // Fetch fresh token from Cloudflare API
    const token = await this.tunnelsClient.getToken(tunnelRecord.tunnelId);

    // Cache in database
    await db.update(tunnels).set({ token, updatedAt: new Date() }).where(eq(tunnels.id, tunnelId));

    return token;
  }

  /**
   * Ensure an ingress rule exists for a hostname (auto-management)
   * Creates or reactivates the rule as needed
   */
  async ensureIngressRule(
    tunnelName: string,
    hostname: string,
    service: string,
    options?: {
      path?: string;
      noTLSVerify?: boolean;
      httpHostHeader?: string;
    }
  ): Promise<void> {
    if (!this.tunnelsClient) {
      throw new Error('Tunnel client not initialized');
    }

    const db = getDatabase();

    // Find tunnel by name
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.name, tunnelName))
      .limit(1);

    if (!tunnelRecord) {
      this.logger.warn({ tunnelName, hostname }, 'Tunnel not found for auto-management, skipping');
      return;
    }

    // Check if rule already exists
    const [existingRule] = await db
      .select()
      .from(tunnelIngressRules)
      .where(and(eq(tunnelIngressRules.tunnelId, tunnelRecord.id), eq(tunnelIngressRules.hostname, hostname)))
      .limit(1);

    if (existingRule) {
      // Reactivate if orphaned
      if (existingRule.orphanedAt) {
        await db
          .update(tunnelIngressRules)
          .set({ orphanedAt: null, updatedAt: new Date() })
          .where(eq(tunnelIngressRules.id, existingRule.id));
        this.logger.info({ tunnelName, hostname }, 'Ingress rule reactivated');
      }

      // Update service if changed
      if (existingRule.service !== service) {
        const rule: TunnelIngressRule = {
          hostname,
          service,
          path: options?.path,
          originRequest:
            options?.noTLSVerify || options?.httpHostHeader
              ? {
                  noTLSVerify: options.noTLSVerify,
                  httpHostHeader: options.httpHostHeader,
                }
              : undefined,
        };
        await this.tunnelsClient.addIngressRule(tunnelRecord.tunnelId, rule);
        await db
          .update(tunnelIngressRules)
          .set({ service, path: options?.path ?? null, updatedAt: new Date() })
          .where(eq(tunnelIngressRules.id, existingRule.id));
        this.logger.info({ tunnelName, hostname, service }, 'Ingress rule service updated');
      }
      return;
    }

    // Create new ingress rule
    const rule: TunnelIngressRule = {
      hostname,
      service,
      path: options?.path,
      originRequest:
        options?.noTLSVerify || options?.httpHostHeader
          ? {
              noTLSVerify: options.noTLSVerify,
              httpHostHeader: options.httpHostHeader,
            }
          : undefined,
    };

    await this.tunnelsClient.addIngressRule(tunnelRecord.tunnelId, rule);

    await db.insert(tunnelIngressRules).values({
      id: uuidv4(),
      tunnelId: tunnelRecord.id,
      hostname,
      service,
      path: options?.path ?? null,
      source: 'auto',
      createdAt: new Date(),
    });

    this.logger.info({ tunnelName, hostname, service }, 'Auto-created ingress rule');
  }

  /**
   * Cleanup orphaned auto-managed ingress rules
   * Mirrors the DNS record orphan cleanup pattern with grace period
   */
  async cleanupOrphanedIngressRules(
    activeHostnames: Set<string>,
    gracePeriodMinutes: number
  ): Promise<void> {
    if (!this.tunnelsClient) return;

    const db = getDatabase();
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - gracePeriodMinutes * 60 * 1000);

    // Get all auto-managed ingress rules
    const autoRules = await db
      .select()
      .from(tunnelIngressRules)
      .where(eq(tunnelIngressRules.source, 'auto'));

    for (const rule of autoRules) {
      const isActive = activeHostnames.has(rule.hostname.toLowerCase());

      if (isActive) {
        // Clear orphaned status if active
        if (rule.orphanedAt) {
          await db
            .update(tunnelIngressRules)
            .set({ orphanedAt: null })
            .where(eq(tunnelIngressRules.id, rule.id));
        }
      } else if (!rule.orphanedAt) {
        // Mark as orphaned
        await db
          .update(tunnelIngressRules)
          .set({ orphanedAt: now })
          .where(eq(tunnelIngressRules.id, rule.id));
        this.logger.info({ hostname: rule.hostname }, 'Ingress rule marked orphaned');
      } else if (new Date(rule.orphanedAt) < cutoffTime) {
        // Grace period elapsed — remove from Cloudflare and database
        const [tunnelRecord] = await db
          .select()
          .from(tunnels)
          .where(eq(tunnels.id, rule.tunnelId))
          .limit(1);

        if (tunnelRecord) {
          try {
            await this.tunnelsClient.removeIngressRule(tunnelRecord.tunnelId, rule.hostname);
            await this.tunnelsClient.removeTunnelCNAME(rule.hostname);
            this.logger.info({ hostname: rule.hostname }, 'Orphaned ingress rule + CNAME removed');
          } catch (error) {
            this.logger.error({ error, hostname: rule.hostname }, 'Failed to remove orphaned ingress rule from Cloudflare');
          }
        }

        await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.id, rule.id));
      }
    }
  }

  /**
   * Get the underlying CloudflareTunnels client
   */
  getTunnelsClient(): CloudflareTunnels | null {
    return this.tunnelsClient;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if tunnel support is available
   */
  isTunnelSupportAvailable(): boolean {
    return this.tunnelsClient !== null;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.tunnelsClient) {
      await this.tunnelsClient.dispose();
      this.tunnelsClient = null;
    }
    this.initialized = false;
    this.logger.debug('Tunnel Manager disposed');
  }
}
