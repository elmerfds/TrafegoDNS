/**
 * Traefik Monitor
 * Polls Traefik API for router information and extracts hostnames
 */
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { DockerMonitor } from './DockerMonitor.js';
import type { TraefikRouter, ContainerLabels } from '../types/index.js';
import type { Logger } from 'pino';

interface TraefikApiRouter {
  name: string;
  entryPoints?: string[];
  rule: string;
  service: string;
  tls?: {
    certResolver?: string;
  };
  status?: string;
  using?: string[];
  provider?: string;
}

export class TraefikMonitor {
  private logger: Logger;
  private config: ConfigManager;
  private dockerMonitor: DockerMonitor | null = null;
  private pollInterval: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastHostnames: Set<string> = new Set();
  private initialized: boolean = false;
  private polling: boolean = false;

  constructor(config: ConfigManager, dockerMonitor?: DockerMonitor) {
    this.config = config;
    this.dockerMonitor = dockerMonitor ?? null;
    this.logger = createChildLogger({ service: 'TraefikMonitor' });
    this.pollInterval = config.app.pollInterval;
  }

  /**
   * Set the Docker monitor reference
   */
  setDockerMonitor(dockerMonitor: DockerMonitor): void {
    this.dockerMonitor = dockerMonitor;
  }

  /**
   * Initialize the Traefik monitor
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Traefik monitor already initialized');
      return;
    }

    this.logger.debug('Initializing Traefik monitor');

    try {
      // Test Traefik API connection
      await this.testConnection();

      this.initialized = true;
      this.logger.info({ apiUrl: this.config.traefik.apiUrl }, 'Traefik monitor initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Traefik monitor');
      throw error;
    }
  }

  /**
   * Test connection to Traefik API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/overview');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Start polling Traefik API
   */
  startPolling(): void {
    if (this.polling) {
      this.logger.warn('Already polling');
      return;
    }

    this.logger.info({ interval: this.pollInterval }, 'Starting Traefik polling');

    // Initial poll
    void this.poll();

    // Setup interval
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollInterval);

    this.polling = true;
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.polling = false;
    this.logger.info('Traefik polling stopped');
  }

  /**
   * Poll Traefik API for routers
   */
  async poll(): Promise<void> {
    const startTime = Date.now();

    this.logger.debug('Polling Traefik API');
    eventBus.publish(EventTypes.TRAEFIK_POLL_STARTED, { timestamp: new Date() });

    try {
      // Fetch HTTP routers
      const httpRouters = await this.fetchRouters('http');

      // Fetch HTTPS routers
      const httpsRouters = await this.fetchRouters('https');

      // Combine and dedupe
      const allRouters = [...httpRouters, ...httpsRouters];
      const hostnames = this.extractHostnames(allRouters);

      // Get container labels for each hostname
      const containerLabels = this.getContainerLabelsForHostnames(hostnames);

      // Check if hostnames changed
      const currentHostnamesSet = new Set(hostnames);
      const hasChanges = this.hostnamesChanged(currentHostnamesSet);

      if (hasChanges) {
        this.lastHostnames = currentHostnamesSet;
        this.logger.info({ hostnames: hostnames.length }, 'Hostnames changed');
      } else {
        this.logger.debug({ hostnames: hostnames.length }, 'No hostname changes');
      }

      // Always publish event to let DNSManager sync (it will skip if no changes needed)
      if (hostnames.length > 0) {
        eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
          hostnames,
          containerLabels,
        });
      }

      const duration = Date.now() - startTime;
      eventBus.publish(EventTypes.TRAEFIK_POLL_COMPLETED, {
        routerCount: allRouters.length,
        duration,
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to poll Traefik API');
      eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'TraefikMonitor.poll',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetch routers from Traefik API
   */
  private async fetchRouters(type: 'http' | 'https'): Promise<TraefikApiRouter[]> {
    try {
      const endpoint = type === 'http' ? '/http/routers' : '/http/routers';
      const response = await this.makeRequest(endpoint);

      if (!response.ok) {
        this.logger.warn({ type, status: response.status }, 'Failed to fetch routers');
        return [];
      }

      const routers = (await response.json()) as TraefikApiRouter[];
      return routers;
    } catch (error) {
      this.logger.error({ error, type }, 'Error fetching routers');
      return [];
    }
  }

  /**
   * Extract hostnames from router rules
   */
  private extractHostnames(routers: TraefikApiRouter[]): string[] {
    const hostnames = new Set<string>();

    for (const router of routers) {
      // Skip internal routers
      if (router.provider === 'internal' || router.name.includes('@internal')) {
        continue;
      }

      // Extract hosts from rule
      const hosts = this.extractHostsFromRule(router.rule);
      for (const host of hosts) {
        hostnames.add(host);
      }
    }

    return Array.from(hostnames);
  }

  /**
   * Extract hostnames from a Traefik rule
   */
  private extractHostsFromRule(rule: string): string[] {
    const hosts: string[] = [];

    // Match Host(`hostname`) or Host(`host1`) || Host(`host2`)
    const hostMatches = rule.matchAll(/Host\(`([^`]+)`\)/g);

    for (const match of hostMatches) {
      const hostValue = match[1];
      if (hostValue) {
        // Handle comma-separated hosts
        const individualHosts = hostValue.split(',').map((h) => h.trim());
        hosts.push(...individualHosts);
      }
    }

    // Also match HostRegexp for wildcards (but we only take the base domain)
    const regexpMatches = rule.matchAll(/HostRegexp\(`([^`]+)`\)/g);
    for (const match of regexpMatches) {
      const hostValue = match[1];
      if (hostValue) {
        // Extract base domain from regexp pattern if possible
        const baseDomain = hostValue.replace(/\{\.\+\}|\{\*\}|\^|\$/g, '').replace(/\\\./g, '.');
        if (baseDomain && !baseDomain.includes('{')) {
          hosts.push(baseDomain);
        }
      }
    }

    // Filter out invalid hostnames:
    // - Empty strings
    // - Strings with template variables: {}, *
    // - Pure regex patterns: .+, .*, ^, $, etc.
    // - Hostnames that don't look like valid domains (must have at least one dot and valid characters)
    return hosts.filter((h) => {
      if (!h) return false;
      if (h.includes('{') || h.includes('*')) return false;
      // Check for regex metacharacters that indicate this is a pattern, not a hostname
      if (/^[\.\+\*\^\$\[\]\(\)\|\\]+$/.test(h)) return false;
      // Must look like a valid hostname (alphanumeric, dots, hyphens)
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(h)) return false;
      // Must have at least one dot (to be a FQDN)
      if (!h.includes('.')) return false;
      return true;
    });
  }

  /**
   * Get container labels for discovered hostnames
   */
  private getContainerLabelsForHostnames(hostnames: string[]): Record<string, ContainerLabels> {
    if (!this.dockerMonitor) {
      return {};
    }

    const result: Record<string, ContainerLabels> = {};
    const allLabels = this.dockerMonitor.getContainerLabelsByHostname();

    for (const hostname of hostnames) {
      if (allLabels[hostname]) {
        result[hostname] = allLabels[hostname];
      } else {
        // Try to find by partial match
        const normalizedHostname = hostname.toLowerCase();
        for (const [labelHostname, labels] of Object.entries(allLabels)) {
          if (labelHostname.toLowerCase() === normalizedHostname) {
            result[hostname] = labels;
            break;
          }
        }
      }

      // Default to empty labels if not found
      if (!result[hostname]) {
        result[hostname] = {};
      }
    }

    return result;
  }

  /**
   * Check if hostnames have changed
   */
  private hostnamesChanged(current: Set<string>): boolean {
    if (current.size !== this.lastHostnames.size) {
      return true;
    }

    for (const hostname of current) {
      if (!this.lastHostnames.has(hostname)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Make authenticated request to Traefik API
   */
  private async makeRequest(endpoint: string): Promise<Response> {
    const url = `${this.config.traefik.apiUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    // Add basic auth if configured
    if (this.config.traefik.apiUsername && this.config.traefik.apiPassword) {
      const auth = Buffer.from(
        `${this.config.traefik.apiUsername}:${this.config.traefik.apiPassword}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    return fetch(url, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
  }

  /**
   * Force a poll
   */
  async forcePoll(): Promise<void> {
    await this.poll();
  }

  /**
   * Check if polling
   */
  isPolling(): boolean {
    return this.polling;
  }

  /**
   * Get last discovered hostnames
   */
  getLastHostnames(): string[] {
    return Array.from(this.lastHostnames);
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.stopPolling();
    this.lastHostnames.clear();
    this.initialized = false;
    this.logger.debug('Traefik monitor disposed');
  }
}
