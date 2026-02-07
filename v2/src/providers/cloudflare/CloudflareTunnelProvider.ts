/**
 * Cloudflare Tunnel Provider
 * Implements BaseTunnelProvider by wrapping the existing CloudflareTunnels client.
 */
import {
  BaseTunnelProvider,
  type TunnelProviderCapabilities,
  type TunnelProviderInfo,
  type CreateTunnelConfig,
  type TunnelInfo as BaseTunnelInfo,
  type TunnelRoute,
  type TunnelRouteConfig,
  type ConnectorInfo,
} from '../base/BaseTunnelProvider.js';
import {
  CloudflareTunnels,
  type TunnelIngressRule,
  type TunnelInfo as CfTunnelInfo,
} from './CloudflareTunnels.js';

/**
 * Cloudflare Tunnel Provider — adapter wrapping CloudflareTunnels
 */
export class CloudflareTunnelProvider extends BaseTunnelProvider {
  private client: CloudflareTunnels;

  constructor(
    providerId: string,
    apiToken: string,
    private readonly accountId: string,
    zoneName: string,
    zoneId?: string,
  ) {
    super(providerId, 'Cloudflare');
    this.client = new CloudflareTunnels(providerId, apiToken, accountId, zoneName, zoneId);
  }

  // --- Metadata ---

  getInfo(): TunnelProviderInfo {
    return {
      name: 'Cloudflare Tunnel',
      type: 'cloudflare',
      version: '1.0.0',
      capabilities: this.getCapabilities(),
    };
  }

  getCapabilities(): TunnelProviderCapabilities {
    return {
      routes: true,
      connectorToken: true,
      managedDns: true,
      routeOptions: true,
      batchDeploy: true,
    };
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    await this.client.init();
    this.initialized = true;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.listTunnels();
      return true;
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    await this.client.dispose();
    this.initialized = false;
  }

  // --- Core tunnel operations ---

  async createTunnel(config: CreateTunnelConfig): Promise<BaseTunnelInfo> {
    const cfInfo = await this.client.createTunnel({
      name: config.name,
      secret: config.providerOptions?.secret as string | undefined,
      configSrc: (config.providerOptions?.configSrc as 'local' | 'cloudflare') ?? 'cloudflare',
    });
    return this.mapCfToBase(cfInfo);
  }

  async deleteTunnel(externalTunnelId: string): Promise<boolean> {
    return this.client.deleteTunnel(externalTunnelId);
  }

  async listTunnels(): Promise<BaseTunnelInfo[]> {
    const cfTunnels = await this.client.listTunnels();
    return cfTunnels.map((t) => this.mapCfToBase(t));
  }

  async getTunnel(externalTunnelId: string): Promise<BaseTunnelInfo | null> {
    const cfTunnel = await this.client.getTunnel(externalTunnelId);
    return cfTunnel ? this.mapCfToBase(cfTunnel) : null;
  }

  // --- Route operations ---

  async addRoute(externalTunnelId: string, route: TunnelRoute): Promise<void> {
    const cfRule: TunnelIngressRule = {
      hostname: route.hostname,
      service: route.service,
      path: route.path,
      originRequest: route.options as TunnelIngressRule['originRequest'],
    };
    await this.client.addIngressRule(externalTunnelId, cfRule);
  }

  async removeRoute(externalTunnelId: string, hostname: string): Promise<void> {
    await this.client.removeIngressRule(externalTunnelId, hostname);
  }

  async getRouteConfig(externalTunnelId: string): Promise<TunnelRouteConfig | null> {
    const cfConfig = await this.client.getTunnelConfiguration(externalTunnelId);
    if (!cfConfig) return null;

    return {
      routes: cfConfig.ingress.map((rule) => ({
        hostname: rule.hostname,
        service: rule.service,
        path: rule.path,
        options: rule.originRequest as Record<string, unknown> | undefined,
      })),
    };
  }

  async deployRouteConfig(externalTunnelId: string, config: TunnelRouteConfig): Promise<void> {
    await this.client.updateTunnelConfiguration(externalTunnelId, {
      ingress: config.routes.map((route) => ({
        hostname: route.hostname,
        service: route.service,
        path: route.path,
        originRequest: route.options as TunnelIngressRule['originRequest'],
      })),
    });
  }

  // --- Optional operations (CF-specific overrides) ---

  async getConnectorInfo(externalTunnelId: string): Promise<ConnectorInfo> {
    const token = await this.client.getToken(externalTunnelId);

    return {
      token,
      instructions: {
        dockerRun: `docker run -d cloudflare/cloudflared:latest tunnel --no-autoupdate run --token ${token}`,
        dockerCompose: [
          'services:',
          '  cloudflared:',
          '    image: cloudflare/cloudflared:latest',
          '    restart: unless-stopped',
          '    command: tunnel --no-autoupdate run --token ${TUNNEL_TOKEN}',
          '    environment:',
          `      - TUNNEL_TOKEN=${token}`,
        ].join('\n'),
        binary: `cloudflared tunnel --no-autoupdate run --token ${token}`,
      },
    };
  }

  async cleanupRouteDns(hostname: string): Promise<void> {
    await this.client.removeTunnelCNAME(hostname);
  }

  // --- Internal helpers ---

  private mapCfToBase(cf: CfTunnelInfo): BaseTunnelInfo {
    return {
      externalId: cf.id,
      name: cf.name,
      status: cf.status,
      createdAt: cf.createdAt,
      connections: cf.connections?.map((c) => ({
        id: c.id,
        version: c.version,
        connectedAt: c.connectedAt,
      })),
    };
  }
}
