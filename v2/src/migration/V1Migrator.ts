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
import { detectProvidersFromEnv, type DetectedProviderConfig } from '../providers/ProviderFactory.js';
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

      // Create all providers from environment variables
      const providerMap = await this.createProvidersFromEnv();
      if (providerMap.size === 0) {
        return { success: false, message: 'No providers configured in environment' };
      }

      // Get default provider (first one created)
      const defaultProviderId = providerMap.values().next().value as string;

      // Import DNS records
      const recordsImported = await this.importRecords(defaultProviderId);

      // Import settings from environment
      await this.importSettings();

      // Import preserved hostnames from environment
      await this.importPreservedHostnames();

      // Import managed hostnames from environment
      await this.importManagedHostnames(providerMap);

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
   * Create all providers from environment variables
   * Returns a Map of zone -> providerId for routing
   */
  private async createProvidersFromEnv(): Promise<Map<string, string>> {
    const db = getDatabase();
    const detected = detectProvidersFromEnv();
    const providerMap = new Map<string, string>();

    if (detected.length === 0) {
      this.logger.warn('No provider configuration found in environment');
      return providerMap;
    }

    this.logger.info(
      { count: detected.length, providers: detected.map(d => `${d.type}:${d.zone}`) },
      'Detected providers from environment'
    );

    const now = new Date();
    let isFirst = true;

    for (const config of detected) {
      try {
        const providerId = uuidv4();

        await db.insert(providers).values({
          id: providerId,
          name: config.name,
          type: config.type,
          isDefault: isFirst, // First provider is default
          credentials: JSON.stringify(config.credentials),
          settings: JSON.stringify({}),
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });

        providerMap.set(config.zone.toLowerCase(), providerId);

        this.logger.info(
          { providerId, providerType: config.type, zone: config.zone, isDefault: isFirst },
          'Created provider from environment'
        );

        isFirst = false;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          { providerType: config.type, zone: config.zone, error: message },
          'Failed to create provider from environment'
        );
      }
    }

    return providerMap;
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
   * Automatically routes hostnames to the correct provider based on zone matching
   */
  private async importManagedHostnames(providerMap: Map<string, string>): Promise<void> {
    const managedStr = process.env.MANAGED_HOSTNAMES;
    if (!managedStr) {
      return;
    }

    const db = getDatabase();
    const now = new Date();

    // Get default provider (first entry in map)
    const defaultProviderId = providerMap.values().next().value as string | undefined;
    if (!defaultProviderId) {
      this.logger.warn('No default provider available for managed hostnames');
      return;
    }

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
        const normalizedHostname = hostname!.toLowerCase();

        // Find the best matching provider for this hostname
        const providerId = this.findProviderForHostname(normalizedHostname, providerMap) ?? defaultProviderId;

        await db.insert(managedHostnames).values({
          id: uuidv4(),
          hostname: normalizedHostname,
          providerId,
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

  /**
   * Find the provider that manages a given hostname based on zone matching
   * Uses longest suffix match for most specific routing
   */
  private findProviderForHostname(hostname: string, providerMap: Map<string, string>): string | undefined {
    let bestMatch: { zone: string; providerId: string } | undefined;

    for (const [zone, providerId] of providerMap) {
      // Check if hostname matches this zone (exact match or subdomain)
      if (hostname === zone || hostname.endsWith(`.${zone}`)) {
        // Keep the longest matching zone (most specific)
        if (!bestMatch || zone.length > bestMatch.zone.length) {
          bestMatch = { zone, providerId };
        }
      }
    }

    return bestMatch?.providerId;
  }
}
