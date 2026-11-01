/**
 * Base Tunnel Provider
 * Abstract interface for tunnel providers (Cloudflare Tunnels, Tailscale Funnel, etc.)
 */
import type { Logger } from 'pino';
import { createChildLogger } from '../../core/Logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Capabilities a tunnel provider can declare
 */
export interface TunnelProviderCapabilities {
  /** Can manage routes (hostname → service mappings) */
  routes: boolean;
  /** Can retrieve a connector token (e.g., cloudflared token) */
  connectorToken: boolean;
  /** Provider manages DNS records alongside routes (e.g., CF CNAME) */
  managedDns: boolean;
  /** Routes support provider-specific transport/origin options */
  routeOptions: boolean;
  /** Tunnel config can be deployed as a batch */
  batchDeploy: boolean;
}

/**
 * Provider metadata for UI and capability checks
 */
export interface TunnelProviderInfo {
  name: string;
  type: string;
  version: string;
  capabilities: TunnelProviderCapabilities;
}

/**
 * Provider-agnostic tunnel creation config
 */
export interface CreateTunnelConfig {
  name: string;
  /** Provider-specific creation options (e.g., CF secret, Tailscale ACL tags) */
  providerOptions?: Record<string, unknown>;
}

/**
 * Provider-agnostic tunnel info
 */
export interface TunnelInfo {
  /** External ID at the provider */
  externalId: string;
  name: string;
  status: 'active' | 'inactive' | 'degraded';
  createdAt: Date;
  connections?: Array<{
    id: string;
    version?: string;
    connectedAt?: Date;
  }>;
}

/**
 * A route maps hostname → service through the tunnel.
 * Provider-agnostic abstraction over CF ingress rules, Tailscale funnel entries, etc.
 */
export interface TunnelRoute {
  hostname: string;
  service: string;
  path?: string;
  /** Provider-specific route options (stored as JSON in DB originRequest column) */
  options?: Record<string, unknown>;
}

/**
 * Full tunnel route configuration for batch deploy
 */
export interface TunnelRouteConfig {
  routes: TunnelRoute[];
}

/**
 * Connector info returned by providers that support getConnectorInfo()
 */
export interface ConnectorInfo {
  token: string;
  /** Human-readable instructions for running the connector */
  instructions: {
    dockerRun?: string;
    dockerCompose?: string;
    binary?: string;
  };
}

// ---------------------------------------------------------------------------
// Abstract Base Class
// ---------------------------------------------------------------------------

/**
 * Abstract base class for tunnel providers.
 * All tunnel providers must extend this class and implement the abstract methods.
 */
export abstract class BaseTunnelProvider {
  protected logger: Logger;
  protected initialized: boolean = false;

  constructor(
    protected readonly providerId: string,
    protected readonly providerName: string,
  ) {
    this.logger = createChildLogger({ service: `tunnel:${providerName.toLowerCase().replace(/\s+/g, '-')}`, providerId });
  }

  // --- Metadata ---
  abstract getInfo(): TunnelProviderInfo;
  abstract getCapabilities(): TunnelProviderCapabilities;

  // --- Lifecycle ---
  abstract init(): Promise<void>;
  abstract testConnection(): Promise<boolean>;

  async dispose(): Promise<void> {
    this.initialized = false;
  }

  // --- Core tunnel operations ---
  abstract createTunnel(config: CreateTunnelConfig): Promise<TunnelInfo>;
  abstract deleteTunnel(externalTunnelId: string): Promise<boolean>;
  abstract listTunnels(): Promise<TunnelInfo[]>;
  abstract getTunnel(externalTunnelId: string): Promise<TunnelInfo | null>;

  // --- Route operations ---
  abstract addRoute(externalTunnelId: string, route: TunnelRoute): Promise<void>;
  abstract removeRoute(externalTunnelId: string, hostname: string): Promise<void>;
  abstract getRouteConfig(externalTunnelId: string): Promise<TunnelRouteConfig | null>;
  abstract deployRouteConfig(externalTunnelId: string, config: TunnelRouteConfig): Promise<void>;

  // --- Optional operations (capability-gated, base provides defaults) ---

  /**
   * Get connector info (token, docker run command, etc.).
   * Only available when capabilities.connectorToken === true.
   */
  async getConnectorInfo(_externalTunnelId: string): Promise<ConnectorInfo> {
    throw new Error(`${this.providerName} does not support connector tokens`);
  }

  /**
   * Cleanup DNS records associated with a route.
   * Only available when capabilities.managedDns === true.
   * Called by TunnelManager during orphan cleanup.
   */
  async cleanupRouteDns(_hostname: string): Promise<void> {
    // No-op by default; providers that manage DNS (e.g., Cloudflare CNAME) override this
  }

  // --- Convenience ---
  getProviderId(): string {
    return this.providerId;
  }

  getProviderName(): string {
    return this.providerName;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
