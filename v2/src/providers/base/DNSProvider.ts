/**
 * Abstract DNS Provider Interface
 * Base class for all DNS provider implementations
 */
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';
import { logger, createChildLogger } from '../../core/Logger.js';
import type { Logger } from 'pino';

/**
 * Ownership marker used to identify records created by TrafegoDNS
 * Providers that support comments will include this marker when creating records
 */
export const TRAFEGO_OWNERSHIP_MARKER = 'Managed by TrafegoDNS';

export interface ProviderCredentials {
  [key: string]: string | undefined;
}

export interface RecordCache {
  records: DNSRecord[];
  lastUpdated: number;
}

export interface BatchResult {
  created: DNSRecord[];
  updated: DNSRecord[];
  unchanged: DNSRecord[];
  errors: Array<{ record: DNSRecordCreateInput; error: string }>;
}

export interface ProviderInfo {
  name: string;
  type: string;
  version: string;
  features: {
    proxied: boolean;
    ttlMin: number;
    ttlMax: number;
    supportedTypes: DNSRecordType[];
    batchOperations: boolean;
  };
}

/**
 * Abstract DNS Provider base class
 */
export abstract class DNSProvider {
  protected logger: Logger;
  protected recordCache: RecordCache;
  protected cacheRefreshInterval: number;
  protected initialized: boolean = false;
  protected settings: ProviderSettingsData;

  constructor(
    protected readonly providerId: string,
    protected readonly providerName: string,
    protected readonly credentials: ProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    this.logger = createChildLogger({ provider: providerName, providerId });
    this.recordCache = {
      records: [],
      lastUpdated: 0,
    };
    this.cacheRefreshInterval = options.cacheRefreshInterval ?? 3600000; // 1 hour default
    this.settings = options.settings ?? {};
  }

  /**
   * Get provider settings (including defaults for DNS records)
   */
  getSettings(): ProviderSettingsData {
    return this.settings;
  }

  /**
   * Update provider settings
   */
  updateSettings(settings: ProviderSettingsData): void {
    this.settings = settings;
  }

  /**
   * Get provider information
   */
  abstract getInfo(): ProviderInfo;

  /**
   * Initialize the provider (validate credentials, etc.)
   */
  abstract init(): Promise<void>;

  /**
   * Test the provider connection
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get the zone/domain name
   */
  abstract getZoneName(): string;

  /**
   * Refresh the DNS record cache from the provider
   */
  abstract refreshRecordCache(): Promise<DNSRecord[]>;

  /**
   * List all DNS records (optionally filtered)
   */
  abstract listRecords(filter?: {
    type?: DNSRecordType;
    name?: string;
  }): Promise<DNSRecord[]>;

  /**
   * Create a new DNS record
   */
  abstract createRecord(record: DNSRecordCreateInput): Promise<DNSRecord>;

  /**
   * Update an existing DNS record
   */
  abstract updateRecord(id: string, record: DNSRecordUpdateInput): Promise<DNSRecord>;

  /**
   * Delete a DNS record
   */
  abstract deleteRecord(id: string): Promise<boolean>;

  /**
   * Validate a record configuration
   */
  abstract validateRecord(record: DNSRecordCreateInput): void;

  /**
   * Get records from cache, refreshing if necessary
   */
  async getRecordsFromCache(forceRefresh: boolean = false): Promise<DNSRecord[]> {
    const cacheAge = Date.now() - this.recordCache.lastUpdated;

    if (forceRefresh || cacheAge > this.cacheRefreshInterval || this.recordCache.records.length === 0) {
      await this.refreshRecordCache();
    }

    return this.recordCache.records;
  }

  /**
   * Find a record in the cache
   */
  findRecordInCache(type: DNSRecordType, name: string): DNSRecord | undefined {
    return this.recordCache.records.find(
      (record) => record.type === type && record.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * Update a record in the cache
   */
  protected updateRecordInCache(record: DNSRecord): void {
    const index = this.recordCache.records.findIndex((r) => r.id === record.id);

    if (index !== -1) {
      this.recordCache.records[index] = record;
    } else {
      this.recordCache.records.push(record);
    }
  }

  /**
   * Remove a record from the cache
   */
  protected removeRecordFromCache(id: string): void {
    this.recordCache.records = this.recordCache.records.filter((r) => r.id !== id);
  }

  /**
   * Check if a record needs to be updated
   */
  recordNeedsUpdate(existing: DNSRecord, newRecord: DNSRecordCreateInput): boolean {
    // Log comparison details at debug level for diagnosing sync issues
    this.logger.debug(
      {
        name: newRecord.name,
        type: newRecord.type,
        existing: {
          content: existing.content,
          ttl: existing.ttl,
          proxied: existing.proxied,
        },
        new: {
          content: newRecord.content,
          ttl: newRecord.ttl,
          proxied: newRecord.proxied,
        },
      },
      'Comparing record for update check'
    );

    // Basic field comparison
    if (existing.content !== newRecord.content) {
      this.logger.debug(
        { name: newRecord.name, oldContent: existing.content, newContent: newRecord.content },
        'Content changed - update needed'
      );
      return true;
    }

    // TTL comparison (skip for proxied records on Cloudflare)
    if (newRecord.ttl !== undefined && existing.ttl !== newRecord.ttl) {
      // Cloudflare proxied records always have TTL=1, so skip this check
      if (!(existing.proxied === true && newRecord.proxied === true)) {
        this.logger.debug(
          { name: newRecord.name, oldTtl: existing.ttl, newTtl: newRecord.ttl },
          'TTL changed - update needed'
        );
        return true;
      }
    }

    // Proxied comparison (for A, AAAA, CNAME only)
    // Only compare if BOTH have proxied defined - providers that don't support proxied will have undefined
    if (['A', 'AAAA', 'CNAME'].includes(newRecord.type)) {
      // Skip comparison if existing.proxied is undefined (provider doesn't support proxied)
      // This prevents false positives for non-Cloudflare providers
      if (
        newRecord.proxied !== undefined &&
        existing.proxied !== undefined &&
        existing.proxied !== newRecord.proxied
      ) {
        this.logger.debug(
          { name: newRecord.name, oldProxied: existing.proxied, newProxied: newRecord.proxied },
          'Proxied status changed - update needed'
        );
        return true;
      }
    }

    // Type-specific comparisons
    switch (newRecord.type) {
      case 'MX':
        if (newRecord.priority !== undefined && existing.priority !== newRecord.priority) {
          return true;
        }
        break;

      case 'SRV':
        if (
          (newRecord.priority !== undefined && existing.priority !== newRecord.priority) ||
          (newRecord.weight !== undefined && existing.weight !== newRecord.weight) ||
          (newRecord.port !== undefined && existing.port !== newRecord.port)
        ) {
          return true;
        }
        break;

      case 'CAA':
        if (
          (newRecord.flags !== undefined && existing.flags !== newRecord.flags) ||
          (newRecord.tag !== undefined && existing.tag !== newRecord.tag)
        ) {
          return true;
        }
        break;
    }

    this.logger.debug({ name: newRecord.name, type: newRecord.type }, 'No update needed');
    return false;
  }

  /**
   * Batch process multiple DNS records
   */
  async batchEnsureRecords(recordConfigs: DNSRecordCreateInput[]): Promise<BatchResult> {
    if (!recordConfigs || recordConfigs.length === 0) {
      return { created: [], updated: [], unchanged: [], errors: [] };
    }

    // Log all incoming records for debugging
    this.logger.debug(
      {
        count: recordConfigs.length,
        records: recordConfigs.map((r) => ({ name: r.name, type: r.type, ttl: r.ttl, content: r.content?.substring(0, 50) })),
      },
      'Batch processing DNS records'
    );

    // Check for duplicate records in input
    const seen = new Map<string, number>();
    for (const config of recordConfigs) {
      const key = `${config.type}:${config.name}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) {
        this.logger.warn({ type: config.type, name: config.name, count }, 'Duplicate record in batch input');
      }
    }

    const result: BatchResult = {
      created: [],
      updated: [],
      unchanged: [],
      errors: [],
    };

    // Refresh cache before processing
    await this.getRecordsFromCache();
    this.logger.debug({ cacheSize: this.recordCache.records.length }, 'Cache refreshed');

    for (const recordConfig of recordConfigs) {
      try {
        // Validate the record
        this.validateRecord(recordConfig);

        // Find existing record
        const existing = this.findRecordInCache(recordConfig.type, recordConfig.name);
        this.logger.debug(
          {
            type: recordConfig.type,
            name: recordConfig.name,
            found: !!existing,
            existingId: existing?.id,
          },
          'Cache lookup result'
        );

        if (existing) {
          // Check if update is needed
          if (this.recordNeedsUpdate(existing, recordConfig)) {
            const updated = await this.updateRecord(existing.id!, recordConfig);
            result.updated.push(updated);
            this.logger.debug({ name: recordConfig.name }, 'Record updated');
          } else {
            result.unchanged.push(existing);
          }
        } else {
          // Create new record
          const created = await this.createRecord(recordConfig);
          result.created.push(created);
          this.logger.debug({ name: recordConfig.name }, 'Record created');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({ record: recordConfig, error: errorMessage });
        this.logger.error(
          { type: recordConfig.type, name: recordConfig.name },
          `Failed to process DNS record: ${errorMessage}`
        );
      }
    }

    // Only log at info level if there were actual changes
    const hasChanges = result.created.length > 0 || result.updated.length > 0 || result.errors.length > 0;
    if (hasChanges) {
      // Build a concise summary
      const parts: string[] = [];
      if (result.created.length > 0) parts.push(`+${result.created.length} created`);
      if (result.updated.length > 0) parts.push(`~${result.updated.length} updated`);
      if (result.errors.length > 0) parts.push(`!${result.errors.length} errors`);
      this.logger.info({ zone: this.getZoneName() }, `DNS sync: ${parts.join(', ')}`);
    }
    // Don't log anything when in sync - that's the expected state

    return result;
  }

  /**
   * Ensure FQDN has the zone suffix
   */
  protected ensureFqdn(hostname: string): string {
    const zone = this.getZoneName().toLowerCase();
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname === zone || normalizedHostname === '@') {
      return zone;
    }

    if (normalizedHostname.endsWith(`.${zone}`)) {
      return normalizedHostname;
    }

    return `${normalizedHostname}.${zone}`;
  }

  /**
   * Get the provider ID
   */
  getProviderId(): string {
    return this.providerId;
  }

  /**
   * Get the provider name
   */
  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Check if provider is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    this.recordCache = { records: [], lastUpdated: 0 };
    this.initialized = false;
    this.logger.debug('Provider disposed');
  }

  /**
   * Check if this provider supports ownership markers (comments)
   * Override in subclasses that support comments
   */
  supportsOwnershipMarker(): boolean {
    return false;
  }

  /**
   * Check if a record was created/owned by TrafegoDNS
   * Uses the comment field to detect the ownership marker
   */
  isOwnedByTrafego(record: DNSRecord): boolean {
    if (!this.supportsOwnershipMarker()) {
      return false;
    }
    return record.comment?.includes(TRAFEGO_OWNERSHIP_MARKER) ?? false;
  }
}
