/**
 * Dependency Injection Container
 * Provides a simple IoC container for managing service instances
 */
import { logger } from './Logger.js';

type Constructor<T = unknown> = new (...args: unknown[]) => T;
type Factory<T = unknown> = () => T | Promise<T>;

interface ServiceRegistration<T = unknown> {
  factory?: Factory<T>;
  instance?: T;
  singleton: boolean;
}

/**
 * Service Container for dependency injection
 */
export class ServiceContainer {
  private services: Map<string | symbol, ServiceRegistration> = new Map();
  private resolving: Set<string | symbol> = new Set();

  /**
   * Register a service factory
   */
  register<T>(
    token: string | symbol,
    factory: Factory<T>,
    options: { singleton?: boolean } = {}
  ): void {
    const { singleton = true } = options;
    this.services.set(token, { factory, singleton });
    logger.debug({ token: String(token), singleton }, 'Service registered');
  }

  /**
   * Register a class constructor
   */
  registerClass<T>(
    token: string | symbol,
    ctor: Constructor<T>,
    options: { singleton?: boolean } = {}
  ): void {
    this.register(token, () => new ctor(), options);
  }

  /**
   * Register an existing instance
   */
  registerInstance<T>(token: string | symbol, instance: T): void {
    this.services.set(token, { instance, singleton: true });
    logger.debug({ token: String(token) }, 'Service instance registered');
  }

  /**
   * Resolve a service
   */
  async resolve<T>(token: string | symbol): Promise<T> {
    const registration = this.services.get(token);

    if (!registration) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // Return existing instance for singletons
    if (registration.instance !== undefined) {
      return registration.instance as T;
    }

    // Check for circular dependencies
    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected for: ${String(token)}`);
    }

    if (!registration.factory) {
      throw new Error(`No factory registered for: ${String(token)}`);
    }

    this.resolving.add(token);

    try {
      const instance = await registration.factory();

      // Store instance for singletons
      if (registration.singleton) {
        registration.instance = instance;
      }

      logger.debug({ token: String(token) }, 'Service resolved');
      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  /**
   * Resolve a service synchronously (only works if already instantiated or sync factory)
   */
  resolveSync<T>(token: string | symbol): T {
    const registration = this.services.get(token);

    if (!registration) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    if (registration.instance !== undefined) {
      return registration.instance as T;
    }

    throw new Error(`Service not yet instantiated: ${String(token)}. Use resolve() for async resolution.`);
  }

  /**
   * Check if a service is registered
   */
  has(token: string | symbol): boolean {
    return this.services.has(token);
  }

  /**
   * Check if a service is instantiated
   */
  isInstantiated(token: string | symbol): boolean {
    const registration = this.services.get(token);
    return registration?.instance !== undefined;
  }

  /**
   * Remove a service registration
   */
  remove(token: string | symbol): boolean {
    const result = this.services.delete(token);
    if (result) {
      logger.debug({ token: String(token) }, 'Service removed');
    }
    return result;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.resolving.clear();
    logger.debug('Service container cleared');
  }

  /**
   * Initialize all registered singletons
   */
  async initializeAll(): Promise<void> {
    const tokens = Array.from(this.services.keys());
    for (const token of tokens) {
      const registration = this.services.get(token);
      if (registration?.singleton && !registration.instance && registration.factory) {
        await this.resolve(token);
      }
    }
    logger.info({ count: tokens.length }, 'All services initialized');
  }

  /**
   * Dispose all services that have a dispose method
   */
  async disposeAll(): Promise<void> {
    const tokens = Array.from(this.services.keys());
    for (const token of tokens) {
      const registration = this.services.get(token);
      if (registration?.instance && typeof (registration.instance as { dispose?: () => void | Promise<void> }).dispose === 'function') {
        await (registration.instance as { dispose: () => void | Promise<void> }).dispose();
        logger.debug({ token: String(token) }, 'Service disposed');
      }
    }
  }
}

// Service tokens
export const ServiceTokens = {
  CONFIG: Symbol('Config'),
  DATABASE: Symbol('Database'),
  EVENT_BUS: Symbol('EventBus'),
  DNS_MANAGER: Symbol('DNSManager'),
  TRAEFIK_MONITOR: Symbol('TraefikMonitor'),
  DIRECT_MONITOR: Symbol('DirectMonitor'),
  DOCKER_MONITOR: Symbol('DockerMonitor'),
  WEBHOOK_SERVICE: Symbol('WebhookService'),
  TUNNEL_MANAGER: Symbol('TunnelManager'),
  SETTINGS_SERVICE: Symbol('SettingsService'),
  AUDIT_SERVICE: Symbol('AuditService'),
  AUTH_SERVICE: Symbol('AuthService'),
  PROVIDER_FACTORY: Symbol('ProviderFactory'),
  RECORD_REPOSITORY: Symbol('RecordRepository'),
  PROVIDER_REPOSITORY: Symbol('ProviderRepository'),
  WEBHOOK_REPOSITORY: Symbol('WebhookRepository'),
  TUNNEL_REPOSITORY: Symbol('TunnelRepository'),
  USER_REPOSITORY: Symbol('UserRepository'),
  AUDIT_REPOSITORY: Symbol('AuditRepository'),
  SETTINGS_REPOSITORY: Symbol('SettingsRepository'),
} as const;

// Export singleton instance
export const container = new ServiceContainer();
