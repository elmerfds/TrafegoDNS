/**
 * Tunnel Manager Service
 * Orchestrates tunnel management with database persistence.
 * Provider-agnostic — delegates to BaseTunnelProvider implementations.
 */
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger } from '../core/Logger.js';
import { getDatabase } from '../database/connection.js';
import { tunnels, tunnelIngressRules, providers } from '../database/schema/index.js';
import { eq, and } from 'drizzle-orm';
import type { BaseTunnelProvider, TunnelRouteConfig, ConnectorInfo } from '../providers/base/index.js';
import { createTunnelProvider } from '../providers/TunnelProviderFactory.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { Logger } from 'pino';

export interface TunnelManagerConfig {
  autoCreateCNAME: boolean;
  defaultOriginService: string;
}

export interface ManagedTunnel {
  id: string;
  externalTunnelId: string; // Provider's tunnel UUID
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

/** Provider-agnostic ingress rule input */
export interface IngressRuleInput {
  hostname: string;
  service: string;
  path?: string;
  /** Provider-specific route options (e.g., originRequest for Cloudflare) */
  options?: Record<string, unknown>;
}

export class TunnelManager {
  private logger: Logger;
  private config: ConfigManager;
  private tunnelProvider: BaseTunnelProvider | null = null;
  private providerId: string | null = null;
  private initialized: boolean = false;

  constructor(config: ConfigManager) {
    this.config = config;
    this.logger = createChildLogger({ service: 'TunnelManager' });
  }

  /**
   * Initialize the Tunnel Manager
   * Scans enabled providers for tunnel capability using TunnelProviderFactory
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Tunnel Manager already initialized');
      return;
    }

    this.logger.debug('Initializing Tunnel Manager');

    try {
      const db = getDatabase();
      const enabledProviders = await db
        .select()
        .from(providers)
        .where(eq(providers.enabled, true));

      if (enabledProviders.length === 0) {
        this.logger.info('No providers configured, tunnel management disabled');
        this.initialized = true;
        return;
      }

      // Prefer the default provider, then try all others
      const sorted = [...enabledProviders].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });

      for (const provider of sorted) {
        const tunnelProv = createTunnelProvider(provider);
        if (tunnelProv) {
          this.tunnelProvider = tunnelProv;
          this.providerId = provider.id;
          break;
        }
      }

      if (!this.tunnelProvider) {
        this.logger.info('No tunnel-capable provider found, tunnel management disabled');
        this.initialized = true;
        return;
      }

      await this.tunnelProvider.init();

      // Sync existing tunnels
      await this.syncTunnels();

      this.initialized = true;
      this.logger.info('Tunnel Manager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Tunnel Manager');
      // Degrade gracefully — tunnel support will be unavailable but the app continues
      this.tunnelProvider = null;
      this.providerId = null;
      this.initialized = true;
    }
  }

  /**
   * Sync tunnels from provider to database
   */
  async syncTunnels(): Promise<void> {
    if (!this.tunnelProvider || !this.providerId) {
      this.logger.debug('Tunnel provider not available, skipping sync');
      return;
    }

    this.logger.debug('Syncing tunnels from provider');

    try {
      const remoteTunnels = await this.tunnelProvider.listTunnels();
      const db = getDatabase();

      // Get existing tunnels from database
      const existingTunnels = await db
        .select()
        .from(tunnels)
        .where(eq(tunnels.providerId, this.providerId));

      const existingByExternalId = new Map(existingTunnels.map((t) => [t.tunnelId, t]));

      for (const remoteTunnel of remoteTunnels) {
        const existing = existingByExternalId.get(remoteTunnel.externalId);

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

          existingByExternalId.delete(remoteTunnel.externalId);
        } else {
          // Create new tunnel record
          await db.insert(tunnels).values({
            id: uuidv4(),
            providerId: this.providerId,
            tunnelId: remoteTunnel.externalId,
            name: remoteTunnel.name,
            status: remoteTunnel.status,
            createdAt: remoteTunnel.createdAt,
            updatedAt: new Date(),
          });
        }

        // Sync ingress rules for this tunnel
        await this.syncIngressRules(remoteTunnel.externalId);
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
   * Sync ingress rules for a tunnel — merges provider state with local metadata (source, orphanedAt)
   */
  private async syncIngressRules(tunnelExternalId: string): Promise<void> {
    if (!this.tunnelProvider) return;

    const db = getDatabase();

    // Get the tunnel record
    const [tunnelRecord] = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.tunnelId, tunnelExternalId))
      .limit(1);

    if (!tunnelRecord) return;

    try {
      const routeConfig = await this.tunnelProvider.getRouteConfig(tunnelExternalId);
      if (!routeConfig) return;

      // Get existing local rules to preserve source and orphanedAt
      const existingRules = await db
        .select()
        .from(tunnelIngressRules)
        .where(eq(tunnelIngressRules.tunnelId, tunnelRecord.id));

      const existingByHostname = new Map(
        existingRules.map((r) => [r.hostname, r])
      );

      const remoteHostnames = new Set<string>();

      // Upsert rules from provider config
      for (const route of routeConfig.routes) {
        remoteHostnames.add(route.hostname);
        const existing = existingByHostname.get(route.hostname);

        if (existing) {
          // Update service/path if changed, but preserve source and orphanedAt
          if (existing.service !== route.service || (existing.path ?? null) !== (route.path ?? null)) {
            await db.update(tunnelIngressRules)
              .set({ service: route.service, path: route.path ?? null })
              .where(eq(tunnelIngressRules.id, existing.id));
          }
        } else {
          // New route from provider that we don't have locally — mark as 'api' (manually created)
          await db.insert(tunnelIngressRules).values({
            id: uuidv4(),
            tunnelId: tunnelRecord.id,
            hostname: route.hostname,
            service: route.service,
            path: route.path ?? null,
            source: 'api',
            createdAt: new Date(),
          });
        }
      }

      // Remove local rules that no longer exist on provider
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
  async createTunnel(config: { name: string; providerOptions?: Record<string, unknown> }): Promise<ManagedTunnel> {
    if (!this.tunnelProvider || !this.providerId) {
      throw new Error('Tunnel provider not initialized');
    }

    this.logger.info({ name: config.name }, 'Creating tunnel');

    try {
      const tunnelInfo = await this.tunnelProvider.createTunnel(config);

      const db = getDatabase();
      const id = uuidv4();
      const now = new Date();

      await db.insert(tunnels).values({
        id,
        providerId: this.providerId,
        tunnelId: tunnelInfo.externalId,
        name: tunnelInfo.name,
        status: tunnelInfo.status,
        createdAt: now,
        updatedAt: now,
      });

      this.logger.info({ id, externalTunnelId: tunnelInfo.externalId }, 'Tunnel created');

      return {
        id,
        externalTunnelId: tunnelInfo.externalId,
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
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
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
      await this.tunnelProvider.deleteTunnel(tunnelRecord.tunnelId);

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
  async addIngressRule(tunnelId: string, rule: IngressRuleInput): Promise<ManagedIngressRule> {
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
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
      // Add route via provider
      await this.tunnelProvider.addRoute(tunnelRecord.tunnelId, {
        hostname: rule.hostname,
        service: rule.service,
        path: rule.path,
        options: rule.options,
      });

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
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
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
      // Remove route via provider
      await this.tunnelProvider.removeRoute(tunnelRecord.tunnelId, hostname);

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
   * Deploy tunnel route configuration (all ingress rules at once)
   */
  async deployRouteConfig(
    tunnelId: string,
    config: TunnelRouteConfig
  ): Promise<void> {
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
    }

    this.logger.info({ tunnelId, routeCount: config.routes.length }, 'Deploying tunnel route configuration');

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
      // Deploy via provider
      await this.tunnelProvider.deployRouteConfig(tunnelRecord.tunnelId, config);

      // Update database - remove all existing rules and insert new ones
      await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.tunnelId, tunnelId));

      for (const route of config.routes) {
        await db.insert(tunnelIngressRules).values({
          id: uuidv4(),
          tunnelId,
          hostname: route.hostname,
          service: route.service,
          path: route.path ?? null,
          createdAt: new Date(),
        });
      }

      // Update tunnel timestamp
      await db
        .update(tunnels)
        .set({ updatedAt: new Date() })
        .where(eq(tunnels.id, tunnelId));

      this.logger.info({ tunnelId }, 'Tunnel route configuration deployed');
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to deploy tunnel route configuration');
      throw error;
    }
  }

  /**
   * Get tunnel connector info (token + setup instructions)
   * Fetches from provider and caches token in database
   */
  async getConnectorInfo(tunnelId: string): Promise<ConnectorInfo> {
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
    }

    const db = getDatabase();
    const [tunnelRecord] = await db.select().from(tunnels).where(eq(tunnels.id, tunnelId)).limit(1);

    if (!tunnelRecord) {
      throw new Error(`Tunnel not found: ${tunnelId}`);
    }

    const connectorInfo = await this.tunnelProvider.getConnectorInfo(tunnelRecord.tunnelId);

    // Cache token in database
    await db.update(tunnels).set({ token: connectorInfo.token, updatedAt: new Date() }).where(eq(tunnels.id, tunnelId));

    return connectorInfo;
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
    if (!this.tunnelProvider) {
      throw new Error('Tunnel provider not initialized');
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
        const routeOptions: Record<string, unknown> = {};
        if (options?.noTLSVerify) routeOptions.noTLSVerify = options.noTLSVerify;
        if (options?.httpHostHeader) routeOptions.httpHostHeader = options.httpHostHeader;

        await this.tunnelProvider.addRoute(tunnelRecord.tunnelId, {
          hostname,
          service,
          path: options?.path,
          options: Object.keys(routeOptions).length > 0 ? routeOptions : undefined,
        });
        await db
          .update(tunnelIngressRules)
          .set({ service, path: options?.path ?? null, updatedAt: new Date() })
          .where(eq(tunnelIngressRules.id, existingRule.id));
        this.logger.info({ tunnelName, hostname, service }, 'Ingress rule service updated');
      }
      return;
    }

    // Create new ingress rule via provider
    const routeOptions: Record<string, unknown> = {};
    if (options?.noTLSVerify) routeOptions.noTLSVerify = options.noTLSVerify;
    if (options?.httpHostHeader) routeOptions.httpHostHeader = options.httpHostHeader;

    await this.tunnelProvider.addRoute(tunnelRecord.tunnelId, {
      hostname,
      service,
      path: options?.path,
      options: Object.keys(routeOptions).length > 0 ? routeOptions : undefined,
    });

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
    if (!this.tunnelProvider) return;

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
        // Grace period elapsed — remove from provider and database
        const [tunnelRecord] = await db
          .select()
          .from(tunnels)
          .where(eq(tunnels.id, rule.tunnelId))
          .limit(1);

        if (tunnelRecord) {
          try {
            await this.tunnelProvider.removeRoute(tunnelRecord.tunnelId, rule.hostname);
            await this.tunnelProvider.cleanupRouteDns(rule.hostname);
            this.logger.info({ hostname: rule.hostname }, 'Orphaned ingress rule removed');
          } catch (error) {
            this.logger.error({ error, hostname: rule.hostname }, 'Failed to remove orphaned ingress rule');
          }
        }

        await db.delete(tunnelIngressRules).where(eq(tunnelIngressRules.id, rule.id));
      }
    }
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
    return this.tunnelProvider !== null;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this.tunnelProvider) {
      await this.tunnelProvider.dispose();
      this.tunnelProvider = null;
    }
    this.initialized = false;
    this.logger.debug('Tunnel Manager disposed');
  }
}
