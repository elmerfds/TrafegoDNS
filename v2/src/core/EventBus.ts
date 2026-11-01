/**
 * Typed Event Bus for application-wide event handling
 * Implements a pub/sub pattern with full TypeScript support
 */
import { EventEmitter } from 'events';
import { logger } from './Logger.js';

/**
 * Event type constants
 */
export const EventTypes = {
  // Config events
  CONFIG_UPDATED: 'config:updated',
  IP_UPDATED: 'ip:updated',

  // Traefik events
  TRAEFIK_POLL_STARTED: 'traefik:poll:started',
  TRAEFIK_POLL_COMPLETED: 'traefik:poll:completed',
  TRAEFIK_ROUTERS_UPDATED: 'traefik:routers:updated',

  // Docker events
  DOCKER_CONTAINER_STARTED: 'docker:container:started',
  DOCKER_CONTAINER_STOPPED: 'docker:container:stopped',
  DOCKER_LABELS_UPDATED: 'docker:labels:updated',

  // DNS events
  DNS_RECORDS_UPDATED: 'dns:records:updated',
  DNS_RECORD_CREATED: 'dns:record:created',
  DNS_RECORD_UPDATED: 'dns:record:updated',
  DNS_RECORD_DELETED: 'dns:record:deleted',
  DNS_RECORD_ORPHANED: 'dns:record:orphaned',
  DNS_CACHE_REFRESHED: 'dns:cache:refreshed',
  DNS_SYNC_STARTED: 'dns:sync:started',
  DNS_SYNC_COMPLETED: 'dns:sync:completed',

  // Tunnel events
  TUNNEL_CREATED: 'tunnel:created',
  TUNNEL_UPDATED: 'tunnel:updated',
  TUNNEL_DELETED: 'tunnel:deleted',
  TUNNEL_DEPLOYED: 'tunnel:deployed',

  // Webhook events
  WEBHOOK_DELIVERY_SUCCESS: 'webhook:delivery:success',
  WEBHOOK_DELIVERY_FAILED: 'webhook:delivery:failed',

  // Status events
  STATUS_UPDATE: 'status:update',
  ERROR_OCCURRED: 'error:occurred',

  // Settings events
  SETTINGS_CHANGED: 'settings:changed',

  // System events
  SYSTEM_STARTED: 'system:started',
  SYSTEM_SHUTDOWN: 'system:shutdown',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

/**
 * Event payload type mapping
 */
export interface EventPayloadMap {
  [EventTypes.CONFIG_UPDATED]: { key: string; value: unknown };
  [EventTypes.IP_UPDATED]: { ipv4?: string; ipv6?: string };
  [EventTypes.TRAEFIK_POLL_STARTED]: { timestamp: Date };
  [EventTypes.TRAEFIK_POLL_COMPLETED]: { routerCount: number; duration: number };
  [EventTypes.TRAEFIK_ROUTERS_UPDATED]: {
    hostnames: string[];
    containerLabels: Record<string, Record<string, string>>;
  };
  [EventTypes.DOCKER_CONTAINER_STARTED]: { containerId: string; containerName: string; labels: Record<string, string> };
  [EventTypes.DOCKER_CONTAINER_STOPPED]: { containerId: string; containerName: string };
  [EventTypes.DOCKER_LABELS_UPDATED]: { containerId: string; labels: Record<string, string> };
  [EventTypes.DNS_RECORDS_UPDATED]: { stats: DNSStats; processedHostnames: string[] };
  [EventTypes.DNS_RECORD_CREATED]: { record: DNSRecordEvent; providerId: string };
  [EventTypes.DNS_RECORD_UPDATED]: { record: DNSRecordEvent; providerId: string };
  [EventTypes.DNS_RECORD_DELETED]: { record: DNSRecordEvent; providerId: string };
  [EventTypes.DNS_RECORD_ORPHANED]: { record: DNSRecordEvent; gracePeriodMinutes: number };
  [EventTypes.DNS_CACHE_REFRESHED]: { providerId: string; recordCount: number };
  [EventTypes.DNS_SYNC_STARTED]: { providerId: string };
  [EventTypes.DNS_SYNC_COMPLETED]: {
    providerId: string;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsDeleted: number;
    errors: string[];
  };
  [EventTypes.TUNNEL_CREATED]: { tunnelId: string; name: string };
  [EventTypes.TUNNEL_UPDATED]: { tunnelId: string; name: string };
  [EventTypes.TUNNEL_DELETED]: { tunnelId: string; name: string };
  [EventTypes.TUNNEL_DEPLOYED]: { tunnelId: string; ingressRules: number };
  [EventTypes.WEBHOOK_DELIVERY_SUCCESS]: { webhookId: string; deliveryId: string };
  [EventTypes.WEBHOOK_DELIVERY_FAILED]: { webhookId: string; deliveryId: string; error: string };
  [EventTypes.STATUS_UPDATE]: { message: string; level: 'info' | 'warn' | 'error' };
  [EventTypes.ERROR_OCCURRED]: { source: string; error: string; stack?: string };
  [EventTypes.SETTINGS_CHANGED]: { key: string; value: string; restartRequired: boolean; reset?: boolean };
  [EventTypes.SYSTEM_STARTED]: { version: string; mode: string };
  [EventTypes.SYSTEM_SHUTDOWN]: { reason: string };
}

interface DNSStats {
  created: number;
  updated: number;
  upToDate: number;
  errors: number;
  total: number;
}

interface DNSRecordEvent {
  id?: string;
  type: string;
  name: string;
  content: string;
}

type EventHandler<T extends EventType> = (data: EventPayloadMap[T]) => void | Promise<void>;

/**
 * Typed Event Bus implementation
 */
export class EventBus {
  private emitter: EventEmitter;
  private subscriberCounts: Map<EventType, number>;
  private debugLogging: boolean;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.subscriberCounts = new Map();
    this.debugLogging = false;
  }

  /**
   * Enable debug logging for all events
   */
  enableDebugLogging(): void {
    if (this.debugLogging) return;
    this.debugLogging = true;

    for (const eventType of Object.values(EventTypes)) {
      this.emitter.on(eventType, (data: unknown) => {
        logger.trace({ event: eventType, data }, `Event: ${eventType}`);
      });
    }
    logger.debug('Event debug logging enabled');
  }

  /**
   * Subscribe to an event with type-safe handler
   */
  subscribe<T extends EventType>(eventType: T, handler: EventHandler<T>): () => void {
    const validEventTypes = Object.values(EventTypes) as string[];
    if (!validEventTypes.includes(eventType)) {
      logger.warn({ eventType }, 'Subscribing to unknown event type');
    }

    this.emitter.on(eventType, handler);

    const currentCount = this.subscriberCounts.get(eventType) ?? 0;
    this.subscriberCounts.set(eventType, currentCount + 1);
    logger.debug({ eventType, subscribers: currentCount + 1 }, 'Subscribed to event');

    // Return unsubscribe function
    return (): void => {
      this.emitter.off(eventType, handler);
      const count = this.subscriberCounts.get(eventType) ?? 1;
      this.subscriberCounts.set(eventType, count - 1);
      logger.debug({ eventType, subscribers: count - 1 }, 'Unsubscribed from event');
    };
  }

  /**
   * Subscribe to an event once
   */
  once<T extends EventType>(eventType: T, handler: EventHandler<T>): void {
    const currentCount = this.subscriberCounts.get(eventType) ?? 0;
    this.subscriberCounts.set(eventType, currentCount + 1);

    const wrappedHandler = (data: EventPayloadMap[T]): void => {
      // Decrement count when handler is called
      const count = this.subscriberCounts.get(eventType) ?? 1;
      this.subscriberCounts.set(eventType, count - 1);
      handler(data);
    };

    this.emitter.once(eventType, wrappedHandler);
  }

  /**
   * Publish an event with type-safe payload
   */
  publish<T extends EventType>(eventType: T, data: EventPayloadMap[T]): void {
    const validEventTypes = Object.values(EventTypes) as string[];
    if (!validEventTypes.includes(eventType)) {
      logger.warn({ eventType }, 'Publishing unknown event type');
    }

    const subscriberCount = this.subscriberCounts.get(eventType) ?? 0;
    if (subscriberCount > 0) {
      logger.debug({ eventType, subscribers: subscriberCount }, 'Publishing event');
      this.emitter.emit(eventType, data);
    } else {
      logger.trace({ eventType }, 'No subscribers for event');
    }
  }

  /**
   * Publish an event and wait for all async handlers to complete
   */
  async publishAsync<T extends EventType>(eventType: T, data: EventPayloadMap[T]): Promise<void> {
    const listeners = this.emitter.listeners(eventType);
    const promises = listeners.map((listener) => {
      try {
        const result = (listener as EventHandler<T>)(data);
        return result instanceof Promise ? result : Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    });
    await Promise.all(promises);
  }

  /**
   * Get the number of subscribers for an event
   */
  getSubscriberCount(eventType: EventType): number {
    return this.subscriberCounts.get(eventType) ?? 0;
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
      this.subscriberCounts.set(eventType, 0);
    } else {
      this.emitter.removeAllListeners();
      this.subscriberCounts.clear();
    }
  }
}

// Export singleton instance
export const eventBus = new EventBus();
