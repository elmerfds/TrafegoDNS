/**
 * Cloudflare Tunnels Management
 * Manages Cloudflare Argo Tunnels via Zero Trust API
 */
import Cloudflare from 'cloudflare';
import type { CloudflareTunnel } from 'cloudflare/resources/shared.js';
import { createChildLogger } from '../../core/Logger.js';
import { eventBus, EventTypes } from '../../core/EventBus.js';
import type { Logger } from 'pino';

export interface TunnelConfig {
  name: string;
  secret?: string;
  configSrc?: 'local' | 'cloudflare';
}

export interface TunnelIngressRule {
  hostname: string;
  service: string;
  path?: string;
  originRequest?: {
    connectTimeout?: number;
    tlsTimeout?: number;
    tcpKeepAlive?: number;
    noHappyEyeballs?: boolean;
    keepAliveConnections?: number;
    keepAliveTimeout?: number;
    httpHostHeader?: string;
    originServerName?: string;
    caPool?: string;
    noTLSVerify?: boolean;
    disableChunkedEncoding?: boolean;
    proxyAddress?: string;
    proxyPort?: number;
    proxyType?: string;
  };
}

export interface TunnelInfo {
  id: string;
  accountId: string;
  name: string;
  status: 'active' | 'inactive' | 'degraded';
  token?: string;
  createdAt: Date;
  connections?: Array<{
    id: string;
    version: string;
    clientId: string;
    connectedAt: Date;
  }>;
}

export interface TunnelConfiguration {
  ingress: TunnelIngressRule[];
}

/**
 * Cloudflare Tunnels Manager
 */
export class CloudflareTunnels {
  private logger: Logger;
  private client: Cloudflare;
  private accountId: string;
  private zoneName: string;
  private zoneId: string | null = null;
  private initialized: boolean = false;

  constructor(
    private readonly providerId: string,
    private readonly apiToken: string,
    accountId: string,
    zoneName: string,
    zoneId?: string
  ) {
    this.logger = createChildLogger({ service: 'CloudflareTunnels', providerId });
    this.accountId = accountId;
    this.zoneName = zoneName;
    this.zoneId = zoneId ?? null;

    // Initialize Cloudflare client
    this.client = new Cloudflare({
      apiToken: this.apiToken,
    });
  }

  /**
   * Initialize the tunnels manager
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Tunnels manager already initialized');
      return;
    }

    this.logger.debug('Initializing Cloudflare Tunnels manager');

    try {
      // Look up zone ID if not provided
      if (!this.zoneId) {
        const zones = await this.client.zones.list({ name: this.zoneName });
        if (zones.result && zones.result.length > 0) {
          this.zoneId = zones.result[0]?.id ?? null;
        }
      }

      this.initialized = true;
      this.logger.info({ accountId: this.accountId }, 'Cloudflare Tunnels manager initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Tunnels manager');
      throw error;
    }
  }

  /**
   * List all tunnels
   */
  async listTunnels(): Promise<TunnelInfo[]> {
    this.logger.debug('Listing tunnels');

    try {
      const tunnels: TunnelInfo[] = [];

      // Use for await to iterate through paginated results
      for await (const tunnel of this.client.zeroTrust.tunnels.cloudflared.list({
        account_id: this.accountId,
      })) {
        tunnels.push(this.mapTunnelResponse(tunnel));
      }

      this.logger.debug({ count: tunnels.length }, 'Tunnels listed');
      return tunnels;
    } catch (error) {
      this.logger.error({ error }, 'Failed to list tunnels');
      throw error;
    }
  }

  /**
   * Get a specific tunnel
   */
  async getTunnel(tunnelId: string): Promise<TunnelInfo | null> {
    this.logger.debug({ tunnelId }, 'Getting tunnel');

    try {
      const tunnel = await this.client.zeroTrust.tunnels.cloudflared.get(tunnelId, {
        account_id: this.accountId,
      });

      if (!tunnel) {
        return null;
      }

      return this.mapTunnelResponse(tunnel);
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to get tunnel');
      throw error;
    }
  }

  /**
   * Create a new tunnel
   */
  async createTunnel(config: TunnelConfig): Promise<TunnelInfo> {
    this.logger.info({ name: config.name }, 'Creating tunnel');

    try {
      // Generate tunnel secret if not provided
      const tunnelSecret = config.secret ?? this.generateTunnelSecret();

      const tunnel = await this.client.zeroTrust.tunnels.cloudflared.create({
        account_id: this.accountId,
        name: config.name,
        tunnel_secret: tunnelSecret,
        config_src: config.configSrc ?? 'cloudflare',
      });

      const tunnelInfo = this.mapTunnelResponse(tunnel);

      this.logger.info({ tunnelId: tunnelInfo.id, name: tunnelInfo.name }, 'Tunnel created');

      eventBus.publish(EventTypes.TUNNEL_CREATED, {
        tunnelId: tunnelInfo.id,
        name: tunnelInfo.name,
      });

      return tunnelInfo;
    } catch (error) {
      this.logger.error({ error, name: config.name }, 'Failed to create tunnel');
      throw error;
    }
  }

  /**
   * Delete a tunnel
   */
  async deleteTunnel(tunnelId: string): Promise<boolean> {
    this.logger.info({ tunnelId }, 'Deleting tunnel');

    try {
      // Get tunnel info for event
      const tunnel = await this.getTunnel(tunnelId);

      await this.client.zeroTrust.tunnels.cloudflared.delete(tunnelId, {
        account_id: this.accountId,
      });

      this.logger.info({ tunnelId }, 'Tunnel deleted');

      eventBus.publish(EventTypes.TUNNEL_DELETED, {
        tunnelId,
        name: tunnel?.name ?? '',
      });

      return true;
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to delete tunnel');
      throw error;
    }
  }

  /**
   * Get tunnel configuration
   */
  async getTunnelConfiguration(tunnelId: string): Promise<TunnelConfiguration | null> {
    this.logger.debug({ tunnelId }, 'Getting tunnel configuration');

    try {
      const config = await this.client.zeroTrust.tunnels.cloudflared.configurations.get(tunnelId, {
        account_id: this.accountId,
      });

      if (!config.config) {
        return null;
      }

      const ingress: TunnelIngressRule[] = [];
      for (const rule of config.config.ingress ?? []) {
        if (rule.hostname) {
          ingress.push({
            hostname: rule.hostname,
            service: rule.service ?? '',
            path: rule.path,
            originRequest: rule.originRequest as TunnelIngressRule['originRequest'],
          });
        }
      }

      return {
        ingress,
      };
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to get tunnel configuration');
      throw error;
    }
  }

  /**
   * Update tunnel configuration (ingress rules)
   */
  async updateTunnelConfiguration(
    tunnelId: string,
    configuration: TunnelConfiguration
  ): Promise<void> {
    this.logger.info({ tunnelId, ingressCount: configuration.ingress.length }, 'Updating tunnel configuration');

    try {
      // Build ingress rules with catch-all
      const ingress = configuration.ingress.map((rule) => ({
        hostname: rule.hostname,
        service: rule.service,
        path: rule.path,
        origin_request: rule.originRequest,
      }));

      // Add catch-all rule at the end
      ingress.push({
        service: 'http_status:404',
      } as typeof ingress[0]);

      await this.client.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
        account_id: this.accountId,
        config: {
          ingress,
        },
      });

      this.logger.info({ tunnelId }, 'Tunnel configuration updated');

      eventBus.publish(EventTypes.TUNNEL_DEPLOYED, {
        tunnelId,
        ingressRules: configuration.ingress.length,
      });
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to update tunnel configuration');
      throw error;
    }
  }

  /**
   * Add an ingress rule to a tunnel
   */
  async addIngressRule(tunnelId: string, rule: TunnelIngressRule): Promise<void> {
    this.logger.info({ tunnelId, hostname: rule.hostname }, 'Adding ingress rule');

    try {
      // Get current configuration
      const currentConfig = await this.getTunnelConfiguration(tunnelId);
      const ingress = currentConfig?.ingress ?? [];

      // Check if rule already exists
      const existingIndex = ingress.findIndex((r) => r.hostname === rule.hostname);
      if (existingIndex >= 0) {
        ingress[existingIndex] = rule;
      } else {
        ingress.push(rule);
      }

      // Update configuration
      await this.updateTunnelConfiguration(tunnelId, { ingress });

      // Create CNAME record for the hostname
      await this.createTunnelCNAME(tunnelId, rule.hostname);

      this.logger.info({ tunnelId, hostname: rule.hostname }, 'Ingress rule added');
    } catch (error) {
      this.logger.error({ error, tunnelId, hostname: rule.hostname }, 'Failed to add ingress rule');
      throw error;
    }
  }

  /**
   * Remove an ingress rule from a tunnel
   */
  async removeIngressRule(tunnelId: string, hostname: string): Promise<void> {
    this.logger.info({ tunnelId, hostname }, 'Removing ingress rule');

    try {
      // Get current configuration
      const currentConfig = await this.getTunnelConfiguration(tunnelId);
      const ingress = currentConfig?.ingress ?? [];

      // Remove the rule
      const newIngress = ingress.filter((r) => r.hostname !== hostname);

      if (newIngress.length === ingress.length) {
        this.logger.warn({ tunnelId, hostname }, 'Ingress rule not found');
        return;
      }

      // Update configuration
      await this.updateTunnelConfiguration(tunnelId, { ingress: newIngress });

      this.logger.info({ tunnelId, hostname }, 'Ingress rule removed');
    } catch (error) {
      this.logger.error({ error, tunnelId, hostname }, 'Failed to remove ingress rule');
      throw error;
    }
  }

  /**
   * Create CNAME record pointing to tunnel
   */
  private async createTunnelCNAME(tunnelId: string, hostname: string): Promise<void> {
    if (!this.zoneId) {
      this.logger.warn({ hostname }, 'Zone ID not available, skipping CNAME creation');
      return;
    }

    try {
      const cnameTarget = `${tunnelId}.cfargotunnel.com`;

      // Check if record exists
      const existingRecords = await this.client.dns.records.list({
        zone_id: this.zoneId,
        name: { exact: hostname },
        type: 'CNAME',
      });

      if (existingRecords.result && existingRecords.result.length > 0) {
        // Update existing record
        const existingRecord = existingRecords.result[0];
        if (existingRecord?.id) {
          await this.client.dns.records.update(existingRecord.id, {
            zone_id: this.zoneId,
            type: 'CNAME',
            name: hostname,
            content: cnameTarget,
            ttl: 1, // Auto
            proxied: true,
            comment: 'Managed by TrafegoDNS - Cloudflare Tunnel',
          });
        }
      } else {
        // Create new record
        await this.client.dns.records.create({
          zone_id: this.zoneId,
          type: 'CNAME',
          name: hostname,
          content: cnameTarget,
          ttl: 1, // Auto
          proxied: true,
          comment: 'Managed by TrafegoDNS - Cloudflare Tunnel',
        });
      }

      this.logger.info({ hostname, target: cnameTarget }, 'Tunnel CNAME record created/updated');
    } catch (error) {
      this.logger.error({ error, hostname }, 'Failed to create tunnel CNAME');
      throw error;
    }
  }

  /**
   * Generate tunnel secret
   */
  private generateTunnelSecret(): string {
    // Generate 32 random bytes and encode as base64
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Buffer.from(bytes).toString('base64');
  }

  /**
   * Map Cloudflare tunnel API response to TunnelInfo
   */
  private mapTunnelResponse(tunnel: CloudflareTunnel): TunnelInfo {
    return {
      id: tunnel.id ?? '',
      accountId: this.accountId,
      name: tunnel.name ?? '',
      status: this.mapTunnelStatus(tunnel.status),
      createdAt: tunnel.created_at ? new Date(tunnel.created_at) : new Date(),
      connections: tunnel.connections?.map((conn) => ({
        id: conn.id ?? '',
        version: conn.client_version ?? '',
        clientId: conn.client_id ?? '',
        connectedAt: conn.opened_at ? new Date(conn.opened_at) : new Date(),
      })),
    };
  }

  /**
   * Map Cloudflare tunnel status
   */
  private mapTunnelStatus(status?: string): 'active' | 'inactive' | 'degraded' {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'active':
        return 'active';
      case 'degraded':
        return 'degraded';
      default:
        return 'inactive';
    }
  }

  /**
   * Get tunnel connector token from Cloudflare API
   */
  async getToken(tunnelId: string): Promise<string> {
    this.logger.debug({ tunnelId }, 'Getting tunnel token');

    try {
      const token = await this.client.zeroTrust.tunnels.cloudflared.token.get(tunnelId, {
        account_id: this.accountId,
      });
      return token as unknown as string;
    } catch (error) {
      this.logger.error({ error, tunnelId }, 'Failed to get tunnel token');
      throw error;
    }
  }

  /**
   * Remove CNAME record pointing to a tunnel
   * Only removes records whose content ends with .cfargotunnel.com
   */
  async removeTunnelCNAME(hostname: string): Promise<void> {
    if (!this.zoneId) {
      this.logger.warn({ hostname }, 'Zone ID not available, skipping CNAME removal');
      return;
    }

    try {
      const existingRecords = await this.client.dns.records.list({
        zone_id: this.zoneId,
        name: { exact: hostname },
        type: 'CNAME',
      });

      if (existingRecords.result && existingRecords.result.length > 0) {
        for (const record of existingRecords.result) {
          if (record.id && record.content?.endsWith('.cfargotunnel.com')) {
            await this.client.dns.records.delete(record.id, { zone_id: this.zoneId });
            this.logger.info({ hostname, recordId: record.id }, 'Tunnel CNAME removed');
          }
        }
      }
    } catch (error) {
      this.logger.error({ error, hostname }, 'Failed to remove tunnel CNAME');
      throw error;
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.initialized = false;
    this.logger.debug('Tunnels manager disposed');
  }
}
