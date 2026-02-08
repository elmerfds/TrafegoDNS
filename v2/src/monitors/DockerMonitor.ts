/**
 * Docker Monitor
 * Watches Docker events and maintains container label cache
 */
import Docker from 'dockerode';
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { ContainerInfo, ContainerLabels } from '../types/index.js';
import type { Logger } from 'pino';

interface ContainerCache {
  id: string;
  name: string;
  labels: ContainerLabels;
  state: 'running' | 'stopped' | 'paused';
}

export class DockerMonitor {
  private logger: Logger;
  private config: ConfigManager;
  private docker: Docker;
  private containerCache: Map<string, ContainerCache> = new Map();
  private eventStream: NodeJS.ReadableStream | null = null;
  private initialized: boolean = false;
  private watching: boolean = false;

  constructor(config: ConfigManager) {
    this.config = config;
    this.logger = createChildLogger({ service: 'DockerMonitor' });

    // Initialize Docker client
    this.docker = new Docker({
      socketPath: config.docker.socketPath,
    });
  }

  /**
   * Initialize the Docker monitor
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Docker monitor already initialized');
      return;
    }

    this.logger.debug('Initializing Docker monitor');

    try {
      // Test Docker connection
      await this.docker.ping();

      // Load existing containers
      await this.loadContainers();

      this.initialized = true;
      this.logger.info({ containerCount: this.containerCache.size }, 'Docker monitor initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Docker monitor');
      throw error;
    }
  }

  /**
   * Load all running containers
   */
  private async loadContainers(): Promise<void> {
    const containers = await this.docker.listContainers({ all: true });

    for (const container of containers) {
      const id = container.Id;
      const name = container.Names?.[0]?.replace(/^\//, '') ?? id.slice(0, 12);
      const labels = container.Labels ?? {};
      const state = this.mapState(container.State ?? 'unknown');

      this.containerCache.set(id, {
        id,
        name,
        labels,
        state,
      });
    }

    this.logger.debug({ count: this.containerCache.size }, 'Loaded containers');
  }

  /**
   * Start watching Docker events
   */
  async startWatching(): Promise<void> {
    if (this.watching) {
      this.logger.warn('Already watching Docker events');
      return;
    }

    if (!this.config.docker.watchEvents) {
      this.logger.info('Docker event watching disabled');
      return;
    }

    this.logger.info('Starting Docker event stream');

    try {
      this.eventStream = await this.docker.getEvents({
        filters: {
          type: ['container'],
          event: ['start', 'stop', 'die', 'pause', 'unpause', 'destroy'],
        },
      });

      this.eventStream.on('data', (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString()) as DockerEvent;
          void this.handleDockerEvent(event);
        } catch (error) {
          this.logger.error({ error }, 'Failed to parse Docker event');
        }
      });

      this.eventStream.on('error', (error: Error) => {
        this.logger.error({ error }, 'Docker event stream error');
        this.watching = false;

        // Attempt to reconnect after delay
        setTimeout(() => {
          void this.startWatching();
        }, 5000);
      });

      this.eventStream.on('end', () => {
        this.logger.warn('Docker event stream ended');
        this.watching = false;
      });

      this.watching = true;
      this.logger.info('Docker event stream started');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start Docker event stream');
      throw error;
    }
  }

  /**
   * Stop watching Docker events
   */
  stopWatching(): void {
    if (this.eventStream) {
      // Cast to any to access destroy method which exists on the Dockerode stream
      (this.eventStream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      this.eventStream = null;
    }
    this.watching = false;
    this.logger.info('Docker event stream stopped');
  }

  /**
   * Handle a Docker event
   */
  private async handleDockerEvent(event: DockerEvent): Promise<void> {
    const containerId = event.Actor?.ID;
    if (!containerId) return;

    const containerName = event.Actor?.Attributes?.name ?? containerId.slice(0, 12);

    this.logger.debug({ event: event.Action, containerId, containerName }, 'Docker event received');

    switch (event.Action) {
      case 'start':
        await this.handleContainerStart(containerId);
        break;

      case 'stop':
      case 'die':
        await this.handleContainerStop(containerId, containerName);
        break;

      case 'pause':
        this.handleContainerPause(containerId);
        break;

      case 'unpause':
        this.handleContainerUnpause(containerId);
        break;

      case 'destroy':
        this.handleContainerDestroy(containerId, containerName);
        break;
    }
  }

  /**
   * Handle container start event
   */
  private async handleContainerStart(containerId: string): Promise<void> {
    try {
      // Fetch container details
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();

      const name = info.Name.replace(/^\//, '');
      const labels = info.Config?.Labels ?? {};

      // Update cache
      this.containerCache.set(containerId, {
        id: containerId,
        name,
        labels,
        state: 'running',
      });

      this.logger.info({ containerId, name }, 'Container started');

      // Publish event
      eventBus.publish(EventTypes.DOCKER_CONTAINER_STARTED, {
        containerId,
        containerName: name,
        labels,
      });

      // Also publish labels update
      eventBus.publish(EventTypes.DOCKER_LABELS_UPDATED, {
        containerId,
        labels,
      });
    } catch (error) {
      this.logger.error({ error, containerId }, 'Failed to handle container start');
    }
  }

  /**
   * Handle container stop event
   */
  private async handleContainerStop(containerId: string, containerName: string): Promise<void> {
    const cached = this.containerCache.get(containerId);
    if (cached) {
      cached.state = 'stopped';
    }

    this.logger.info({ containerId, containerName }, 'Container stopped');

    eventBus.publish(EventTypes.DOCKER_CONTAINER_STOPPED, {
      containerId,
      containerName,
    });
  }

  /**
   * Handle container pause event
   */
  private handleContainerPause(containerId: string): void {
    const cached = this.containerCache.get(containerId);
    if (cached) {
      cached.state = 'paused';
    }
  }

  /**
   * Handle container unpause event
   */
  private handleContainerUnpause(containerId: string): void {
    const cached = this.containerCache.get(containerId);
    if (cached) {
      cached.state = 'running';
    }
  }

  /**
   * Handle container destroy event
   */
  private handleContainerDestroy(containerId: string, containerName: string): void {
    this.containerCache.delete(containerId);
    this.logger.debug({ containerId, containerName }, 'Container removed from cache');
  }

  /**
   * Get all running containers
   */
  getRunningContainers(): ContainerCache[] {
    return Array.from(this.containerCache.values()).filter((c) => c.state === 'running');
  }

  /**
   * Get labels for a container by ID or name
   */
  getContainerLabels(containerIdOrName: string): ContainerLabels | undefined {
    // Try by ID first
    let container = this.containerCache.get(containerIdOrName);

    if (!container) {
      // Try by name
      container = Array.from(this.containerCache.values()).find(
        (c) => c.name === containerIdOrName || c.name === containerIdOrName.replace(/^\//, '')
      );
    }

    return container?.labels;
  }

  /**
   * Get all container labels mapped by hostname
   * Extracts hostnames from Traefik labels or dns.hostname labels
   */
  getContainerLabelsByHostname(): Record<string, ContainerLabels> {
    const result: Record<string, ContainerLabels> = {};
    const labelPrefix = this.config.docker.labelPrefix;
    const traefikPrefix = this.config.traefik.labelPrefix;

    for (const container of this.containerCache.values()) {
      if (container.state !== 'running') continue;

      const labels = container.labels;

      // Check for dns.hostname label
      const hostnameLabel = labels[`${labelPrefix}hostname`];
      if (hostnameLabel) {
        for (const hostname of hostnameLabel.split(',').map((h) => h.trim())) {
          result[hostname] = labels;
        }
      }

      // Also extract hostnames from Traefik labels
      for (const [key, value] of Object.entries(labels)) {
        if (key.startsWith(traefikPrefix) && key.includes('.rule') && value.includes('Host(')) {
          const hosts = this.extractHostsFromTraefikRule(value);
          for (const host of hosts) {
            result[host] = labels;
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract hostnames from Traefik rule
   */
  private extractHostsFromTraefikRule(rule: string): string[] {
    const hosts: string[] = [];
    const hostMatch = rule.match(/Host\(`([^`]+)`\)/g);

    if (hostMatch) {
      for (const match of hostMatch) {
        const hostValue = match.match(/Host\(`([^`]+)`\)/)?.[1];
        if (hostValue) {
          // Handle multiple hosts separated by ||
          hosts.push(...hostValue.split('||').map((h) => h.trim().replace(/`/g, '')));
        }
      }
    }

    // Filter out invalid hostnames (regex patterns, templates, etc.)
    return hosts.filter((h) => {
      if (!h) return false;
      if (h.includes('{') || h.includes('*')) return false;
      // Must look like a valid hostname (alphanumeric, dots, hyphens)
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(h)) return false;
      return true;
    });
  }

  /**
   * Map Docker state string to our state type
   */
  private mapState(state: string): 'running' | 'stopped' | 'paused' {
    switch (state.toLowerCase()) {
      case 'running':
        return 'running';
      case 'paused':
        return 'paused';
      default:
        return 'stopped';
    }
  }

  /**
   * Refresh the container cache
   */
  async refresh(): Promise<void> {
    this.containerCache.clear();
    await this.loadContainers();
    this.logger.debug({ count: this.containerCache.size }, 'Container cache refreshed');
  }

  /**
   * Check if monitoring
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    this.stopWatching();
    this.containerCache.clear();
    this.initialized = false;
    this.logger.debug('Docker monitor disposed');
  }
}

interface DockerEvent {
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes?: {
      name?: string;
      [key: string]: string | undefined;
    };
  };
  time: number;
  timeNano: number;
}
