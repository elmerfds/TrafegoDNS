/**
 * Configuration Manager
 * Centralized configuration loading and validation
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { logger, setLogLevel, type LogLevel } from '../core/Logger.js';
import {
  appConfigSchema,
  traefikConfigSchema,
  dockerConfigSchema,
  dnsDefaultsSchema,
  type AppConfig,
  type TraefikConfig,
  type DockerConfig,
  type DNSDefaults,
} from './schema.js';
import type { DNSRecordType } from '../types/index.js';

interface IPCache {
  ipv4: string | null;
  ipv6: string | null;
  lastCheck: number;
}

interface RecordTypeDefaults {
  content: string;
  proxied?: boolean;
  ttl: number;
  priority?: number;
  weight?: number;
  port?: number;
  flags?: number;
  tag?: string;
}

/**
 * Read environment variable with optional default
 */
function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Read environment variable as integer
 */
function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Read environment variable as boolean
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Read secret from file (Docker secrets support) or environment
 */
function getSecret(key: string): string | undefined {
  // Check for Docker secret file
  const secretPath = `/run/secrets/${key.toLowerCase()}`;
  if (existsSync(secretPath)) {
    try {
      return readFileSync(secretPath, 'utf-8').trim();
    } catch (error) {
      logger.warn({ key, error }, 'Failed to read Docker secret');
    }
  }

  // Fall back to environment variable
  return process.env[key];
}

/**
 * Generate a cryptographically secure random secret key
 * Uses crypto.randomBytes() instead of Math.random() for security
 */
function generateSecret(length: number = 32): string {
  return randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
}

export class ConfigManager {
  private _app: AppConfig;
  private _traefik: TraefikConfig;
  private _docker: DockerConfig;
  private _dnsDefaults: DNSDefaults;
  private _recordTypeDefaults: Map<DNSRecordType, RecordTypeDefaults>;
  private _ipCache: IPCache;
  private _ipRefreshInterval: number;
  private _ipUpdateInProgress: boolean = false;

  constructor() {
    // Load and validate app config
    this._app = appConfigSchema.parse({
      operationMode: getEnv('OPERATION_MODE', 'traefik'),
      logLevel: getEnv('LOG_LEVEL', 'info')?.toLowerCase(),
      dataDir: getEnv('DATA_DIR', '/config/data'),
      databasePath: getEnv('DATABASE_PATH'),
      apiPort: getEnvInt('API_PORT', 3000),
      apiHost: getEnv('API_HOST', '0.0.0.0'),
      jwtSecret: getSecret('JWT_SECRET') ?? generateSecret(64),
      jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '24h'),
      encryptionKey: getSecret('ENCRYPTION_KEY') ?? generateSecret(32),
      pollInterval: getEnvInt('POLL_INTERVAL', 60000),
      cleanupOrphaned: getEnvBool('CLEANUP_ORPHANED', false),
      cleanupGracePeriod: getEnvInt('CLEANUP_GRACE_PERIOD', 15),
      webhookRetryAttempts: getEnvInt('WEBHOOK_RETRY_ATTEMPTS', 3),
      webhookRetryDelay: getEnvInt('WEBHOOK_RETRY_DELAY', 5000),
    });

    // Set database path default based on data dir
    if (!this._app.databasePath) {
      this._app.databasePath = join(this._app.dataDir, 'trafegodns.db');
    }

    // Set log level
    setLogLevel(this._app.logLevel as LogLevel);

    // Load Traefik config
    this._traefik = traefikConfigSchema.parse({
      apiUrl: getEnv('TRAEFIK_API_URL', 'http://traefik:8080/api'),
      apiUsername: getEnv('TRAEFIK_API_USERNAME'),
      apiPassword: getSecret('TRAEFIK_API_PASSWORD'),
      labelPrefix: getEnv('TRAEFIK_LABEL_PREFIX', 'traefik.'),
    });

    // Load Docker config
    this._docker = dockerConfigSchema.parse({
      socketPath: getEnv('DOCKER_SOCKET', '/var/run/docker.sock'),
      watchEvents: getEnvBool('WATCH_DOCKER_EVENTS', true),
      labelPrefix: getEnv('DNS_LABEL_PREFIX', 'dns.'),
    });

    // Load DNS defaults
    this._dnsDefaults = dnsDefaultsSchema.parse({
      recordType: getEnv('DNS_DEFAULT_TYPE', 'CNAME'),
      ttl: getEnvInt('DNS_DEFAULT_TTL', 1),
      proxied: getEnvBool('DNS_DEFAULT_PROXIED', true),
      manage: getEnvBool('DNS_DEFAULT_MANAGE', true),
    });

    // Initialize IP cache
    this._ipCache = {
      ipv4: getEnv('PUBLIC_IP') ?? null,
      ipv6: getEnv('PUBLIC_IPV6') ?? null,
      lastCheck: 0,
    };

    this._ipRefreshInterval = getEnvInt('IP_REFRESH_INTERVAL', 3600000);

    // Initialize record type defaults
    this._recordTypeDefaults = new Map();
    this.initializeRecordTypeDefaults();

    logger.info({
      operationMode: this._app.operationMode,
      logLevel: this._app.logLevel,
      dataDir: this._app.dataDir,
    }, 'Configuration loaded');
  }

  private initializeRecordTypeDefaults(): void {
    // A record defaults
    this._recordTypeDefaults.set('A', {
      content: getEnv('DNS_DEFAULT_A_CONTENT', '') ?? '',
      proxied: getEnvBool('DNS_DEFAULT_A_PROXIED', this._dnsDefaults.proxied),
      ttl: getEnvInt('DNS_DEFAULT_A_TTL', this._dnsDefaults.ttl),
    });

    // AAAA record defaults
    this._recordTypeDefaults.set('AAAA', {
      content: getEnv('DNS_DEFAULT_AAAA_CONTENT', '') ?? '',
      proxied: getEnvBool('DNS_DEFAULT_AAAA_PROXIED', this._dnsDefaults.proxied),
      ttl: getEnvInt('DNS_DEFAULT_AAAA_TTL', this._dnsDefaults.ttl),
    });

    // CNAME record defaults
    this._recordTypeDefaults.set('CNAME', {
      content: getEnv('DNS_DEFAULT_CNAME_CONTENT', '') ?? '',
      proxied: getEnvBool('DNS_DEFAULT_CNAME_PROXIED', this._dnsDefaults.proxied),
      ttl: getEnvInt('DNS_DEFAULT_CNAME_TTL', this._dnsDefaults.ttl),
    });

    // MX record defaults
    this._recordTypeDefaults.set('MX', {
      content: getEnv('DNS_DEFAULT_MX_CONTENT', '') ?? '',
      ttl: getEnvInt('DNS_DEFAULT_MX_TTL', this._dnsDefaults.ttl),
      priority: getEnvInt('DNS_DEFAULT_MX_PRIORITY', 10),
    });

    // TXT record defaults
    this._recordTypeDefaults.set('TXT', {
      content: getEnv('DNS_DEFAULT_TXT_CONTENT', '') ?? '',
      ttl: getEnvInt('DNS_DEFAULT_TXT_TTL', this._dnsDefaults.ttl),
    });

    // SRV record defaults
    this._recordTypeDefaults.set('SRV', {
      content: getEnv('DNS_DEFAULT_SRV_CONTENT', '') ?? '',
      ttl: getEnvInt('DNS_DEFAULT_SRV_TTL', this._dnsDefaults.ttl),
      priority: getEnvInt('DNS_DEFAULT_SRV_PRIORITY', 1),
      weight: getEnvInt('DNS_DEFAULT_SRV_WEIGHT', 1),
      port: getEnvInt('DNS_DEFAULT_SRV_PORT', 80),
    });

    // CAA record defaults
    this._recordTypeDefaults.set('CAA', {
      content: getEnv('DNS_DEFAULT_CAA_CONTENT', '') ?? '',
      ttl: getEnvInt('DNS_DEFAULT_CAA_TTL', this._dnsDefaults.ttl),
      flags: getEnvInt('DNS_DEFAULT_CAA_FLAGS', 0),
      tag: getEnv('DNS_DEFAULT_CAA_TAG', 'issue'),
    });
  }

  // Getters for configuration sections
  get app(): Readonly<AppConfig> {
    return this._app;
  }

  get traefik(): Readonly<TraefikConfig> {
    return this._traefik;
  }

  get docker(): Readonly<DockerConfig> {
    return this._docker;
  }

  get dnsDefaults(): Readonly<DNSDefaults> {
    return this._dnsDefaults;
  }

  /**
   * Get defaults for a specific record type
   */
  getRecordTypeDefaults(type: DNSRecordType): RecordTypeDefaults {
    return this._recordTypeDefaults.get(type) ?? {
      content: '',
      ttl: this._dnsDefaults.ttl,
    };
  }

  /**
   * Get public IPv4 from cache
   */
  getPublicIPSync(): string | null {
    if (!this._ipCache.ipv4) {
      // Trigger async update for next time
      void this.updatePublicIPs();
    }
    return this._ipCache.ipv4;
  }

  /**
   * Get public IPv6 from cache
   */
  getPublicIPv6Sync(): string | null {
    if (!this._ipCache.ipv6) {
      void this.updatePublicIPs();
    }
    return this._ipCache.ipv6;
  }

  /**
   * Get public IP address asynchronously
   */
  async getPublicIP(): Promise<string | null> {
    const cacheAge = Date.now() - this._ipCache.lastCheck;
    if (this._ipCache.ipv4 && cacheAge < this._ipRefreshInterval) {
      return this._ipCache.ipv4;
    }

    await this.updatePublicIPs();
    return this._ipCache.ipv4;
  }

  /**
   * Update public IP cache
   */
  async updatePublicIPs(): Promise<IPCache> {
    if (this._ipUpdateInProgress) {
      // Wait for ongoing update
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this._ipUpdateInProgress) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      return this._ipCache;
    }

    this._ipUpdateInProgress = true;

    try {
      const oldIpv4 = this._ipCache.ipv4;
      const oldIpv6 = this._ipCache.ipv6;

      // Use environment variables if set
      let ipv4 = process.env['PUBLIC_IP'];
      let ipv6 = process.env['PUBLIC_IPV6'];

      // Fetch IPv4 if not set
      if (!ipv4) {
        try {
          const response = await fetch('https://api.ipify.org', {
            signal: AbortSignal.timeout(5000),
          });
          ipv4 = await response.text();
        } catch {
          try {
            const response = await fetch('https://ifconfig.me/ip', {
              signal: AbortSignal.timeout(5000),
            });
            ipv4 = await response.text();
          } catch (error) {
            logger.error({ error }, 'Failed to fetch public IPv4');
          }
        }
      }

      // Fetch IPv6 if not set
      if (!ipv6) {
        try {
          const response = await fetch('https://api6.ipify.org', {
            signal: AbortSignal.timeout(5000),
          });
          ipv6 = await response.text();
        } catch {
          logger.debug('IPv6 not available');
        }
      }

      // Update cache
      this._ipCache = {
        ipv4: ipv4 ?? null,
        ipv6: ipv6 ?? null,
        lastCheck: Date.now(),
      };

      // Update A/AAAA defaults
      if (ipv4) {
        const aDefaults = this._recordTypeDefaults.get('A');
        if (aDefaults && !aDefaults.content) {
          aDefaults.content = ipv4;
        }
      }

      if (ipv6) {
        const aaaaDefaults = this._recordTypeDefaults.get('AAAA');
        if (aaaaDefaults && !aaaaDefaults.content) {
          aaaaDefaults.content = ipv6;
        }
      }

      // Log IP changes
      if (ipv4 && ipv4 !== oldIpv4) {
        logger.info({ ipv4 }, 'Public IPv4 updated');
      }
      if (ipv6 && ipv6 !== oldIpv6) {
        logger.debug({ ipv6 }, 'Public IPv6 updated');
      }

      return this._ipCache;
    } finally {
      this._ipUpdateInProgress = false;
    }
  }

  /**
   * Start periodic IP refresh
   */
  startIPRefresh(): void {
    if (this._ipRefreshInterval > 0) {
      setInterval(() => {
        void this.updatePublicIPs();
      }, this._ipRefreshInterval);
    }
  }
}

// Export singleton instance
let configInstance: ConfigManager | null = null;

export function getConfig(): ConfigManager {
  if (!configInstance) {
    configInstance = new ConfigManager();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
