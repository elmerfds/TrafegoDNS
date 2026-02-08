/**
 * Settings Service
 * Manages application settings with database persistence and runtime updates
 */
import { getDatabase, isDatabaseInitialized } from '../database/connection.js';
import { settings as settingsTable } from '../database/schema/index.js';
import { eq } from 'drizzle-orm';
import { eventBus, EventTypes } from '../core/EventBus.js';
import { logger, setLogLevel, type LogLevel } from '../core/Logger.js';

export type SettingType = 'string' | 'number' | 'boolean' | 'select';

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  default: string | number | boolean;
  options?: string[]; // For select type
  category: 'general' | 'dns' | 'cleanup' | 'traefik' | 'docker' | 'webhooks' | 'security' | 'tunnels';
  restartRequired: boolean; // Whether changing this requires restart
  envVar?: string; // Environment variable name (if different from key)
}

// Define all configurable settings
export const SETTINGS_SCHEMA: SettingDefinition[] = [
  // General settings
  {
    key: 'operation_mode',
    label: 'Operation Mode',
    description: 'How TrafegoDNS discovers hostnames (traefik or direct)',
    type: 'select',
    options: ['traefik', 'direct'],
    default: 'traefik',
    category: 'general',
    restartRequired: true,
    envVar: 'OPERATION_MODE',
  },
  {
    key: 'log_level',
    label: 'Log Level',
    description: 'Logging verbosity',
    type: 'select',
    options: ['error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
    category: 'general',
    restartRequired: false,
    envVar: 'LOG_LEVEL',
  },
  {
    key: 'poll_interval',
    label: 'Poll Interval (ms)',
    description: 'How often to check for hostname changes',
    type: 'number',
    default: 60000,
    category: 'general',
    restartRequired: false,
    envVar: 'POLL_INTERVAL',
  },

  // DNS settings
  {
    key: 'dns_default_type',
    label: 'Default Record Type',
    description: 'Default DNS record type when not specified',
    type: 'select',
    options: ['A', 'AAAA', 'CNAME'],
    default: 'CNAME',
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_TYPE',
  },
  {
    key: 'dns_default_ttl_override',
    label: 'Override Provider TTL',
    description: 'Use global TTL instead of provider-specific defaults',
    type: 'boolean',
    default: false,
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_TTL_OVERRIDE',
  },
  {
    key: 'dns_default_ttl',
    label: 'Default TTL',
    description: 'Default time-to-live for DNS records (seconds). Only used when Override Provider TTL is enabled. Will be clamped to provider limits.',
    type: 'number',
    default: 300,
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_TTL',
  },
  {
    key: 'dns_default_proxied',
    label: 'Default Proxied',
    description: 'Enable Cloudflare proxy by default',
    type: 'boolean',
    default: true,
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_PROXIED',
  },
  {
    key: 'dns_default_manage',
    label: 'Manage by Default',
    description: 'Manage DNS for containers without explicit labels',
    type: 'boolean',
    default: true,
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_MANAGE',
  },
  {
    key: 'dns_default_content',
    label: 'Default Record Content',
    description: 'Default value for record content (e.g., CNAME target)',
    type: 'string',
    default: '',
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_DEFAULT_CONTENT',
  },
  {
    key: 'dns_routing_mode',
    label: 'DNS Routing Mode',
    description: 'How hostnames are routed to providers: auto (zone-based, skip if no match), auto-with-fallback (zone-based with default fallback), default-only (always use default provider)',
    type: 'select',
    options: ['auto', 'auto-with-fallback', 'default-only'],
    default: 'auto-with-fallback',
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_ROUTING_MODE',
  },
  {
    key: 'dns_multi_provider_same_zone',
    label: 'Multi-Provider Same Zone',
    description: 'When multiple providers have the same zone, create records in ALL of them',
    type: 'boolean',
    default: true,
    category: 'dns',
    restartRequired: false,
    envVar: 'DNS_MULTI_PROVIDER_SAME_ZONE',
  },

  // Cleanup settings
  {
    key: 'cleanup_orphaned',
    label: 'Cleanup Orphaned Records',
    description: 'Automatically remove DNS records for stopped containers',
    type: 'boolean',
    default: false,
    category: 'cleanup',
    restartRequired: false,
    envVar: 'CLEANUP_ORPHANED',
  },
  {
    key: 'cleanup_grace_period',
    label: 'Cleanup Grace Period (minutes)',
    description: 'Wait time before deleting orphaned records',
    type: 'number',
    default: 15,
    category: 'cleanup',
    restartRequired: false,
    envVar: 'CLEANUP_GRACE_PERIOD',
  },

  // Traefik settings
  {
    key: 'traefik_api_url',
    label: 'Traefik API URL',
    description: 'URL to Traefik API endpoint',
    type: 'string',
    default: 'http://traefik:8080/api',
    category: 'traefik',
    restartRequired: true,
    envVar: 'TRAEFIK_API_URL',
  },
  {
    key: 'traefik_label_prefix',
    label: 'Traefik Label Prefix',
    description: 'Prefix for Traefik labels',
    type: 'string',
    default: 'traefik.',
    category: 'traefik',
    restartRequired: true,
    envVar: 'TRAEFIK_LABEL_PREFIX',
  },

  // Docker settings
  {
    key: 'docker_socket',
    label: 'Docker Socket Path',
    description: 'Path to Docker socket',
    type: 'string',
    default: '/var/run/docker.sock',
    category: 'docker',
    restartRequired: true,
    envVar: 'DOCKER_SOCKET',
  },
  {
    key: 'watch_docker_events',
    label: 'Watch Docker Events',
    description: 'Listen for Docker container events',
    type: 'boolean',
    default: true,
    category: 'docker',
    restartRequired: true,
    envVar: 'WATCH_DOCKER_EVENTS',
  },
  {
    key: 'dns_label_prefix',
    label: 'DNS Label Prefix',
    description: 'Prefix for DNS-related container labels',
    type: 'string',
    default: 'dns.',
    category: 'docker',
    restartRequired: true,
    envVar: 'DNS_LABEL_PREFIX',
  },

  // Webhook settings
  {
    key: 'webhook_retry_attempts',
    label: 'Webhook Retry Attempts',
    description: 'Number of retry attempts for failed webhook deliveries',
    type: 'number',
    default: 3,
    category: 'webhooks',
    restartRequired: false,
    envVar: 'WEBHOOK_RETRY_ATTEMPTS',
  },
  {
    key: 'webhook_retry_delay',
    label: 'Webhook Retry Delay (ms)',
    description: 'Base delay between webhook retry attempts',
    type: 'number',
    default: 5000,
    category: 'webhooks',
    restartRequired: false,
    envVar: 'WEBHOOK_RETRY_DELAY',
  },

  // IP settings
  {
    key: 'public_ip',
    label: 'Public IPv4',
    description: 'Override auto-detected public IPv4 address',
    type: 'string',
    default: '',
    category: 'general',
    restartRequired: false,
    envVar: 'PUBLIC_IP',
  },
  {
    key: 'public_ipv6',
    label: 'Public IPv6',
    description: 'Override auto-detected public IPv6 address',
    type: 'string',
    default: '',
    category: 'general',
    restartRequired: false,
    envVar: 'PUBLIC_IPV6',
  },
  {
    key: 'ip_refresh_interval',
    label: 'IP Refresh Interval (ms)',
    description: 'How often to refresh public IP (0 to disable)',
    type: 'number',
    default: 3600000,
    category: 'general',
    restartRequired: false,
    envVar: 'IP_REFRESH_INTERVAL',
  },
  // Tunnel settings
  {
    key: 'tunnel_mode',
    label: 'Tunnel Mode',
    description: 'Auto-management mode for tunnel ingress rules. "off" = disabled, "all" = route all hostnames through tunnel, "labeled" = only containers with dns.tunnel label',
    type: 'select',
    options: ['off', 'all', 'labeled'],
    default: 'off',
    category: 'tunnels',
    restartRequired: false,
  },
  {
    key: 'default_tunnel',
    label: 'Default Tunnel',
    description: 'Name of the default tunnel for auto-routing (must match an existing tunnel)',
    type: 'string',
    default: '',
    category: 'tunnels',
    restartRequired: false,
  },
  {
    key: 'default_tunnel_service',
    label: 'Default Service URL',
    description: 'Default backend service URL for tunnel routing (e.g., http://traefik:80)',
    type: 'string',
    default: '',
    category: 'tunnels',
    restartRequired: false,
  },
  // Security settings
  {
    key: 'allow_local_login',
    label: 'Allow Local Login',
    description: 'When OIDC authentication is enabled, allow users to also sign in with local credentials. Only applies when AUTH_MODE=oidc.',
    type: 'boolean',
    default: false,
    category: 'security',
    restartRequired: false,
    envVar: 'OIDC_ALLOW_LOCAL_LOGIN',
  },
];

// Group settings by category for UI
export const SETTINGS_BY_CATEGORY = SETTINGS_SCHEMA.reduce(
  (acc, setting) => {
    const category = setting.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category]!.push(setting);
    return acc;
  },
  {} as Record<string, SettingDefinition[]>
);

export class SettingsService {
  private cache: Map<string, string> = new Map();
  private initialized: boolean = false;
  private listeners: Map<string, Array<(value: string) => void>> = new Map();

  /**
   * Initialize the settings service
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Load all settings into cache
    await this.loadAllSettings();
    this.initialized = true;

    logger.debug('SettingsService initialized');
  }

  /**
   * Load all settings from database into cache
   */
  private async loadAllSettings(): Promise<void> {
    if (!isDatabaseInitialized()) {
      // Database not ready, use defaults only
      return;
    }

    const db = getDatabase();
    const dbSettings = await db.select().from(settingsTable);

    for (const setting of dbSettings) {
      this.cache.set(setting.key, setting.value);
    }
  }

  /**
   * Get a setting value with type coercion
   */
  get<T extends string | number | boolean>(key: string): T {
    const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
    if (!definition) {
      throw new Error(`Unknown setting: ${key}`);
    }

    // Priority: cache (database) > environment variable > default
    let value: string;

    if (this.cache.has(key)) {
      value = this.cache.get(key)!;
    } else {
      const envVar = definition.envVar ?? key.toUpperCase().replace(/-/g, '_');
      const envValue = process.env[envVar];
      value = envValue ?? String(definition.default);
    }

    // Coerce to appropriate type
    switch (definition.type) {
      case 'boolean':
        return (value.toLowerCase() === 'true' || value === '1') as T;
      case 'number':
        return parseInt(value, 10) as T;
      default:
        return value as T;
    }
  }

  /**
   * Get raw string value
   */
  getRaw(key: string): string | undefined {
    const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
    if (!definition) {
      return undefined;
    }

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const envVar = definition.envVar ?? key.toUpperCase().replace(/-/g, '_');
    return process.env[envVar] ?? String(definition.default);
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: string): Promise<{ restartRequired: boolean }> {
    const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
    if (!definition) {
      throw new Error(`Unknown setting: ${key}`);
    }

    // Validate value
    if (definition.type === 'select' && definition.options) {
      if (!definition.options.includes(value)) {
        throw new Error(`Invalid value for ${key}. Must be one of: ${definition.options.join(', ')}`);
      }
    } else if (definition.type === 'number') {
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid number value for ${key}`);
      }
    } else if (definition.type === 'boolean') {
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        throw new Error(`Invalid boolean value for ${key}. Use true/false or 1/0`);
      }
    }

    // Save to database
    if (isDatabaseInitialized()) {
      const db = getDatabase();
      const now = new Date();

      const [existing] = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);

      if (existing) {
        await db.update(settingsTable).set({ value, updatedAt: now }).where(eq(settingsTable.key, key));
      } else {
        await db.insert(settingsTable).values({
          key,
          value,
          description: definition.description,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Update cache
    const oldValue = this.cache.get(key);
    this.cache.set(key, value);

    // Apply runtime update if supported
    if (!definition.restartRequired && oldValue !== value) {
      await this.applyRuntimeUpdate(key, value);
    }

    // Notify listeners
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        try {
          listener(value);
        } catch (error) {
          logger.error({ error, key }, 'Setting listener error');
        }
      }
    }

    // Publish event
    eventBus.publish(EventTypes.SETTINGS_CHANGED, {
      key,
      value,
      restartRequired: definition.restartRequired,
    });

    return { restartRequired: definition.restartRequired };
  }

  /**
   * Apply runtime updates for settings that don't require restart
   */
  private async applyRuntimeUpdate(key: string, value: string): Promise<void> {
    switch (key) {
      case 'log_level':
        setLogLevel(value as LogLevel);
        logger.info({ level: value }, 'Log level updated');
        break;
      // Other runtime-updatable settings handled by their respective services
      // via the SETTINGS_CHANGED event
    }
  }

  /**
   * Register a listener for setting changes
   */
  onSettingChange(key: string, listener: (value: string) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(listener);

    // Return unsubscribe function
    return () => {
      const keyListeners = this.listeners.get(key);
      if (keyListeners) {
        const index = keyListeners.indexOf(listener);
        if (index > -1) {
          keyListeners.splice(index, 1);
        }
      }
    };
  }

  /**
   * Get all settings with their current values and metadata
   */
  getAllSettings(): Array<SettingDefinition & { value: string | number | boolean; source: 'database' | 'env' | 'default' }> {
    return SETTINGS_SCHEMA.map((definition) => {
      let source: 'database' | 'env' | 'default' = 'default';
      let rawValue: string;

      if (this.cache.has(definition.key)) {
        source = 'database';
        rawValue = this.cache.get(definition.key)!;
      } else {
        const envVar = definition.envVar ?? definition.key.toUpperCase().replace(/-/g, '_');
        if (process.env[envVar] !== undefined) {
          source = 'env';
          rawValue = process.env[envVar]!;
        } else {
          rawValue = String(definition.default);
        }
      }

      // Coerce to appropriate type
      let value: string | number | boolean = rawValue;
      if (definition.type === 'boolean') {
        value = rawValue.toLowerCase() === 'true' || rawValue === '1';
      } else if (definition.type === 'number') {
        value = parseInt(rawValue, 10);
      }

      return {
        ...definition,
        value,
        source,
      };
    });
  }

  /**
   * Get settings schema (for UI to know what's configurable)
   */
  getSchema(): SettingDefinition[] {
    return SETTINGS_SCHEMA;
  }

  /**
   * Get settings grouped by category
   */
  getSettingsByCategory(): Record<string, Array<SettingDefinition & { value: string | number | boolean }>> {
    const allSettings = this.getAllSettings();
    return allSettings.reduce(
      (acc, setting) => {
        const category = setting.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category]!.push(setting);
        return acc;
      },
      {} as Record<string, Array<SettingDefinition & { value: string | number | boolean }>>
    );
  }

  /**
   * Reset a setting to its default value
   */
  async reset(key: string): Promise<void> {
    const definition = SETTINGS_SCHEMA.find((s) => s.key === key);
    if (!definition) {
      throw new Error(`Unknown setting: ${key}`);
    }

    // Remove from database
    if (isDatabaseInitialized()) {
      const db = getDatabase();
      await db.delete(settingsTable).where(eq(settingsTable.key, key));
    }

    // Remove from cache (will fall back to env or default)
    this.cache.delete(key);

    // Apply runtime update
    const newValue = this.getRaw(key) ?? String(definition.default);
    if (!definition.restartRequired) {
      await this.applyRuntimeUpdate(key, newValue);
    }

    eventBus.publish(EventTypes.SETTINGS_CHANGED, {
      key,
      value: newValue,
      reset: true,
      restartRequired: definition.restartRequired,
    });
  }
}

// Singleton instance
let settingsServiceInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = new SettingsService();
  }
  return settingsServiceInstance;
}

export function resetSettingsService(): void {
  settingsServiceInstance = null;
}
