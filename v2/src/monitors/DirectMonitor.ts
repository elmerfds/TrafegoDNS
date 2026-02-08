/**
 * Direct Monitor
 * Extracts hostnames directly from Docker container labels
 * Used when not running in Traefik mode
 */
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { DockerMonitor } from './DockerMonitor.js';
import type { ContainerLabels } from '../types/index.js';
import type { Logger } from 'pino';

export class DirectMonitor {
  private logger: Logger;
  private config: ConfigManager;
  private dockerMonitor: DockerMonitor;
  private pollInterval: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastHostnames: Set<string> = new Set();
  private initialized: boolean = false;
  private polling: boolean = false;

  constructor(config: ConfigManager, dockerMonitor: DockerMonitor) {
    this.config = config;
    this.dockerMonitor = dockerMonitor;
    this.logger = createChildLogger({ service: 'DirectMonitor' });
    this.pollInterval = config.app.pollInterval;
  }

  /**
   * Initialize the Direct monitor
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Direct monitor already initialized');
      return;
    }

    this.logger.debug('Initializing Direct monitor');

    // Subscribe to Docker events for real-time updates
    eventBus.subscribe(EventTypes.DOCKER_CONTAINER_STARTED, () => {
      void this.poll();
    });

    eventBus.subscribe(EventTypes.DOCKER_CONTAINER_STOPPED, () => {
      void this.poll();
    });

    this.initialized = true;
    this.logger.info('Direct monitor initialized');
  }

  /**
   * Start polling for hostnames
   */
  startPolling(): void {
    if (this.polling) {
      this.logger.warn('Already polling');
      return;
    }

    this.logger.info({ interval: this.pollInterval }, 'Starting Direct monitor polling');

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
    this.logger.info('Direct monitor polling stopped');
  }

  /**
   * Poll containers for hostnames
   */
  async poll(): Promise<void> {
    this.logger.debug('Polling containers for hostnames');

    try {
      // Get all container labels by hostname
      const labelsByHostname = this.dockerMonitor.getContainerLabelsByHostname();

      // Also look for explicit dns.hostname labels
      const explicitHostnames = this.extractExplicitHostnames();

      // Merge with explicit hostnames
      for (const [hostname, labels] of Object.entries(explicitHostnames)) {
        if (!labelsByHostname[hostname]) {
          labelsByHostname[hostname] = labels;
        }
      }

      const hostnames = Object.keys(labelsByHostname);

      // Check if hostnames changed
      const currentHostnamesSet = new Set(hostnames);
      const hasChanges = this.hostnamesChanged(currentHostnamesSet);

      if (hasChanges || hostnames.length > 0) {
        this.lastHostnames = currentHostnamesSet;

        this.logger.info({ hostnames: hostnames.length, changed: hasChanges }, 'Hostnames discovered');

        // Publish event (using same event type as Traefik monitor for compatibility)
        eventBus.publish(EventTypes.TRAEFIK_ROUTERS_UPDATED, {
          hostnames,
          containerLabels: labelsByHostname,
        });
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to poll containers');
      eventBus.publish(EventTypes.ERROR_OCCURRED, {
        source: 'DirectMonitor.poll',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Extract hostnames from explicit dns.hostname labels
   */
  private extractExplicitHostnames(): Record<string, ContainerLabels> {
    const result: Record<string, ContainerLabels> = {};
    const labelPrefix = this.config.docker.labelPrefix;
    const hostnameKey = `${labelPrefix}hostname`;
    const domainKey = `${labelPrefix}domain`;

    const containers = this.dockerMonitor.getRunningContainers();

    for (const container of containers) {
      const labels = container.labels;

      // Check for explicit hostname label
      const hostnameLabel = labels[hostnameKey];
      if (hostnameLabel) {
        // Can be comma-separated list
        const hostnames = hostnameLabel.split(',').map((h) => h.trim());
        for (const hostname of hostnames) {
          if (hostname) {
            result[hostname] = labels;
          }
        }
        continue;
      }

      // Check for domain label (uses container name as subdomain)
      const domainLabel = labels[domainKey];
      if (domainLabel) {
        const hostname = `${container.name}.${domainLabel}`;
        result[hostname] = labels;
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
    this.logger.debug('Direct monitor disposed');
  }
}
