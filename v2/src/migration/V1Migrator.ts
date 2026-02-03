/**
 * V1 Migrator
 * Handles migration from TrafegoDNS v1 to v2
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../core/Logger.js';
import { getDatabase } from '../database/connection.js';
import { dnsRecords, providers, settings, preservedHostnames, managedHostnames } from '../database/schema/index.js';
import type { ProviderType } from '../types/index.js';
import type { Logger } from 'pino';

interface V1DNSRecord {
  hostname: string;
  type: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  providerId?: string;
  recordId?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface V1RecordFile {
  version?: number;
  records: V1DNSRecord[];
}

export class V1Migrator {
  private logger: Logger;
  private configPath: string;
  private dataPath: string;

  constructor(configPath: string = '/config') {
    this.logger = createChildLogger({ service: 'V1Migrator' });
    this.configPath = configPath;
    this.dataPath = join(configPath, 'data');
  }

  /**
   * Check if v1 data exists
   */
  hasV1Data(): boolean {
    const recordsFile = join(this.dataPath, 'dns-records.json');
    return existsSync(recordsFile);
  }

  /**
   * Run migration from v1 to v2
   */
  async migrate(): Promise<{ success: boolean; message: string }> {
    if (!this.hasV1Data()) {
      return { success: true, message: 'No v1 data found, skipping migration' };
    }

    this.logger.info('Starting v1 to v2 migration');

    const db = getDatabase();

    try {
      // Check if migration was already performed
      const existingRecords = await db.select().from(dnsRecords);
      if (existingRecords.length > 0) {
        this.logger.info('Database already has records, skipping migration');
        return { success: true, message: 'Migration already performed' };
      }

      // Create default provider from environment variables
      const providerId = await this.createDefaultProvider();
      if (!providerId) {
        return { success: false, message: 'Failed to create provider from environment' };
      }

      // Import DNS records
      const recordsImported = await this.importRecords(providerId);

      // Import settings from environment
      await this.importSettings();

      // Import preserved hostnames from environment
      await this.importPreservedHostnames();

      // Import managed hostnames from environment
      await this.importManagedHostnames(providerId);

      this.logger.info({ recordsImported }, 'Migration completed successfully');

      return {
        success: true,
        message: `Migration complete: ${recordsImported} records imported`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Migration failed');
      return { success: false, message: `Migration failed: ${message}` };
    }
  }

  /**
   * Create default provider from v1 environment variables
   */
  private async createDefaultProvider(): Promise<string | null> {
    const db = getDatabase();
    const env = process.env;

    // Determine provider type from environment
    let providerType: ProviderType | null = null;
    let credentials: Record<string, string> = {};
    let providerSettings: Record<string, unknown> = {};

    // Cloudflare
    if (env.CLOUDFLARE_TOKEN || env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN) {
      providerType = 'cloudflare';
      credentials = {
        apiToken: env.CLOUDFLARE_TOKEN || env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || '',
      };
      if (env.CLOUDFLARE_ZONE || env.CF_ZONE_ID) {
        credentials.zoneId = env.CLOUDFLARE_ZONE || env.CF_ZONE_ID || '';
      }
      if (env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID) {
        credentials.accountId = env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '';
      }
    }
    // DigitalOcean
    else if (env.DO_TOKEN || env.DIGITALOCEAN_TOKEN) {
      providerType = 'digitalocean';
      credentials = {
        token: env.DO_TOKEN || env.DIGITALOCEAN_TOKEN || '',
      };
      if (env.DO_DOMAIN) {
        providerSettings.domain = env.DO_DOMAIN;
      }
    }
    // Route53
    else if (env.ROUTE53_ACCESS_KEY || env.AWS_ACCESS_KEY_ID) {
      providerType = 'route53';
      credentials = {
        accessKey: env.ROUTE53_ACCESS_KEY || env.AWS_ACCESS_KEY_ID || '',
        secretKey: env.ROUTE53_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY || '',
        hostedZoneId: env.ROUTE53_ZONE || env.ROUTE53_HOSTED_ZONE_ID || '',
        region: env.ROUTE53_REGION || env.AWS_REGION || 'us-east-1',
      };
    }
    // Technitium
    else if (env.TECHNITIUM_URL) {
      providerType = 'technitium';
      credentials = {
        url: env.TECHNITIUM_URL,
        apiToken: env.TECHNITIUM_API_TOKEN || '',
        zone: env.TECHNITIUM_ZONE || '',
      };
    }

    if (!providerType) {
      this.logger.warn('No provider configuration found in environment');
      return null;
    }

    const providerId = uuidv4();
    const now = new Date();

    await db.insert(providers).values({
      id: providerId,
      name: `${providerType} (migrated)`,
      type: providerType,
      isDefault: true,
      credentials: JSON.stringify(credentials),
      settings: JSON.stringify(providerSettings),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.info({ providerId, providerType }, 'Created provider from environment');

    return providerId;
  }

  /**
   * Import DNS records from v1 JSON file
   */
  private async importRecords(defaultProviderId: string): Promise<number> {
    const recordsFile = join(this.dataPath, 'dns-records.json');

    if (!existsSync(recordsFile)) {
      return 0;
    }

    const content = readFileSync(recordsFile, 'utf-8');
    const data = JSON.parse(content) as V1RecordFile;

    const records = Array.isArray(data) ? data : data.records || [];
    const db = getDatabase();

    let imported = 0;

    for (const record of records) {
      try {
        const id = uuidv4();
        const now = new Date();

        await db.insert(dnsRecords).values({
          id,
          providerId: defaultProviderId,
          externalId: record.recordId,
          type: record.type.toUpperCase() as 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS',
          name: record.hostname,
          content: record.content,
          ttl: record.ttl ?? 300,
          priority: record.priority,
          proxied: record.proxied ?? false,
          source: (record.source as 'traefik' | 'direct' | 'api' | 'managed') ?? 'managed',
          createdAt: record.createdAt ? new Date(record.createdAt) : now,
          updatedAt: record.updatedAt ? new Date(record.updatedAt) : now,
        });

        imported++;
      } catch (error) {
        this.logger.warn(
          { hostname: record.hostname, error },
          'Failed to import record, skipping'
        );
      }
    }

    return imported;
  }

  /**
   * Import settings from environment variables
   */
  private async importSettings(): Promise<void> {
    const db = getDatabase();
    const env = process.env;
    const now = new Date();

    const settingsToImport: Array<{ key: string; value: string; description?: string }> = [];

    // Operation mode
    if (env.OPERATION_MODE) {
      settingsToImport.push({
        key: 'operation_mode',
        value: env.OPERATION_MODE,
        description: 'Operation mode (traefik or direct)',
      });
    }

    // Poll interval
    if (env.POLL_INTERVAL) {
      settingsToImport.push({
        key: 'poll_interval',
        value: env.POLL_INTERVAL,
        description: 'Poll interval in milliseconds',
      });
    }

    // Log level
    if (env.LOG_LEVEL) {
      settingsToImport.push({
        key: 'log_level',
        value: env.LOG_LEVEL,
        description: 'Logging level',
      });
    }

    // Default TTL
    if (env.DEFAULT_TTL) {
      settingsToImport.push({
        key: 'default_ttl',
        value: env.DEFAULT_TTL,
        description: 'Default DNS record TTL',
      });
    }

    // Cleanup settings
    if (env.CLEANUP_ORPHANED) {
      settingsToImport.push({
        key: 'cleanup_orphaned',
        value: env.CLEANUP_ORPHANED,
        description: 'Enable automatic orphan cleanup',
      });
    }

    if (env.CLEANUP_GRACE_PERIOD) {
      settingsToImport.push({
        key: 'cleanup_grace_period',
        value: env.CLEANUP_GRACE_PERIOD,
        description: 'Grace period before deleting orphaned records (minutes)',
      });
    }

    // Traefik settings
    if (env.TRAEFIK_API_URL) {
      settingsToImport.push({
        key: 'traefik_api_url',
        value: env.TRAEFIK_API_URL,
        description: 'Traefik API URL',
      });
    }

    for (const setting of settingsToImport) {
      await db.insert(settings).values({
        key: setting.key,
        value: setting.value,
        description: setting.description ?? null,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
    }

    if (settingsToImport.length > 0) {
      this.logger.info(
        { count: settingsToImport.length },
        'Imported settings from environment'
      );
    }
  }

  /**
   * Import preserved hostnames from environment variable
   * Format: PRESERVED_HOSTNAMES=host1.example.com,host2.example.com,*.example.com
   */
  private async importPreservedHostnames(): Promise<void> {
    const preservedStr = process.env.PRESERVED_HOSTNAMES;
    if (!preservedStr) {
      return;
    }

    const db = getDatabase();
    const now = new Date();

    const hostnames = preservedStr
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0);

    let imported = 0;
    for (const hostname of hostnames) {
      try {
        await db.insert(preservedHostnames).values({
          id: uuidv4(),
          hostname,
          reason: 'Imported from PRESERVED_HOSTNAMES environment variable',
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();
        imported++;
      } catch (error) {
        this.logger.warn({ hostname, error }, 'Failed to import preserved hostname');
      }
    }

    if (imported > 0) {
      this.logger.info({ count: imported }, 'Imported preserved hostnames from environment');
    }
  }

  /**
   * Import managed hostnames from environment variable
   * Format: MANAGED_HOSTNAMES=hostname:type:content:ttl,hostname2:type2:content2
   * Example: mail.example.com:MX:mailserver.example.com:300:10
   */
  private async importManagedHostnames(defaultProviderId: string): Promise<void> {
    const managedStr = process.env.MANAGED_HOSTNAMES;
    if (!managedStr) {
      return;
    }

    const db = getDatabase();
    const now = new Date();

    const configs = managedStr.split(',').map((c) => c.trim()).filter((c) => c.length > 0);

    let imported = 0;
    for (const config of configs) {
      try {
        const parts = config.split(':');
        if (parts.length < 3) {
          this.logger.warn({ config }, 'Invalid managed hostname format, skipping');
          continue;
        }

        const [hostname, recordType, content, ttlStr, priorityStr] = parts;

        await db.insert(managedHostnames).values({
          id: uuidv4(),
          hostname: hostname!.toLowerCase(),
          providerId: defaultProviderId,
          recordType: (recordType!.toUpperCase() as 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS'),
          content: content!,
          ttl: ttlStr ? parseInt(ttlStr, 10) : 300,
          priority: priorityStr ? parseInt(priorityStr, 10) : undefined,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();
        imported++;
      } catch (error) {
        this.logger.warn({ config, error }, 'Failed to import managed hostname');
      }
    }

    if (imported > 0) {
      this.logger.info({ count: imported }, 'Imported managed hostnames from environment');
    }
  }
}
