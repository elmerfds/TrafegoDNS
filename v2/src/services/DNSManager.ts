/**
 * DNS Manager Service
 * Orchestrates DNS record management across providers
 */
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import { getDatabase } from '../database/connection.js';
import { dnsRecords, providers, preservedHostnames, hostnameOverrides } from '../database/schema/index.js';
import { eq, and, isNull, lt, or, like, sql } from 'drizzle-orm';
import { DNSProvider, createProvider, type BatchResult } from '../providers/index.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordType, ProviderType, ProviderDefaults, SettingSource } from '../types/index.js';
import type { Logger } from 'pino';
import { getSettingsService } from './SettingsService.js';

/**
 * Resolved defaults for creating a DNS record
 */
interface ResolvedDefaults {
  recordType: DNSRecordType;
  content: string;
  ttl: number;
  proxied: boolean;
  publicIp: string;
  publicIpv6: string;
  sources: {
    recordType: SettingSource;
    content: SettingSource;
    ttl: SettingSource;
    proxied: SettingSource;
  };
}

interface DNSManagerStats {
  created: number;
  updated: number;
  upToDate: number;
  errors: number;
  skipped: number;
  total: number;
}

interface ProcessedHostname {
  hostname: string;
  recordType: DNSRecordType;
  content: string;
  providerId: string;
}

interface ProviderRecordGroup {
  provider: DNSProvider;
  providerId: string;
  records: DNSRecordCreateInput[];
}

/**
 * Cached hostname override
 */
interface CachedHostnameOverride {
  hostname: string;
  proxied?: boolean | null;
  ttl?: number | null;
  recordType?: DNSRecordType | null;
  content?: string | null;
  providerId?: string | null;
}

export class DNSManager {
  private logger: Logger;
  private config: ConfigManager;
  private providerInstances: Map<string, DNSProvider> = new Map();
  private defaultProviderId: string | null = null;
  private hostnameOverridesCache: Map<string, CachedHostnameOverride> = new Map();
  private stats: DNSManagerStats = {
    created: 0,
    updated: 0,
    upToDate: 0,
    errors: 0,
    skipped: 0,
    total: 0,
  };
  private initialized: boolean = false;
  private previousHostnames: Set<string> = new Set();
  private syncCount: number = 0;
  private lastLoggedHostnameCount: number = 0;

  constructor(config: ConfigManager) {
    this.config = config;
    this.logger = createChildLogger({ service: 'DNSManager' });
    this.setupEventSubscriptions();
  }

  /**
   * Initialize the DNS Manager
   */
  async init(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('DNS Manager already initialized');
      return;
    }

    this.logger.debug('Initializing DNS Manager');

    try {
      // Load providers from database
      await this.loadProviders();

      // Load hostname overrides
      await this.loadHostnameOverrides();

      this.initialized = true;
      this.logger.info('DNS Manager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize DNS Manager');
      throw error;
    }
  }

  /**
   * Load hostname overrides from database into cache
   */
  private async loadHostnameOverrides(): Promise<void> {
    const db = getDatabase();
    const overrides = await db
      .select()
      .from(hostnameOverrides)
      .where(eq(hostnameOverrides.enabled, true));

    this.hostnameOverridesCache.clear();
    for (const override of overrides) {
      this.hostnameOverridesCache.set(override.hostname.toLowerCase(), {
        hostname: override.hostname,
        proxied: override.proxied,
        ttl: override.ttl,
        recordType: override.recordType as DNSRecordType | null,
        content: override.content,
        providerId: override.providerId,
      });
    }

    this.logger.debug({ count: overrides.length }, 'Loaded hostname overrides');
  }

  /**
   * Refresh hostname overrides cache (call after changes)
   */
  async refreshHostnameOverrides(): Promise<void> {
    await this.loadHostnameOverrides();
  }

  /**
   * Get hostname override from cache
   * Supports exact match and wildcard patterns (*.example.com)
   */
  private getHostnameOverride(hostname: string): CachedHostnameOverride | undefined {
    const lowerHostname = hostname.toLowerCase();

    // Try exact match first
    const exact = this.hostnameOverridesCache.get(lowerHostname);
    if (exact) return exact;

    // Try wildcard matches (*.example.com matches sub.example.com)
    for (const [pattern, override] of this.hostnameOverridesCache) {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1); // .example.com
        if (lowerHostname.endsWith(suffix) && lowerHostname.length > suffix.length) {
          return override;
        }
      }
    }

    return undefined;
  }

  /**
   * Load providers from database and initialize them
   */
  private async loadProviders(): Promise<void> {
    const db = getDatabase();
    const providerRecords = await db.select().from(providers).where(eq(providers.enabled, true));

    this.logger.debug({ count: providerRecords.length }, 'Loading providers from database');

    for (const record of providerRecords) {
      try {
        // Decrypt credentials
        const credentials = JSON.parse(record.credentials) as Record<string, string>;

        // Parse settings JSON (includes defaults configuration)
        const settings = record.settings ? JSON.parse(record.settings) : {};

        const provider = createProvider({
          id: record.id,
          name: record.name,
          type: record.type as ProviderType,
          credentials,
          settings,
        });

        await provider.init();
        this.providerInstances.set(record.id, provider);

        if (record.isDefault) {
          this.defaultProviderId = record.id;
        }

        this.logger.info({ providerId: record.id, name: record.name, type: record.type }, 'Provider loaded');
      } catch (error) {
        this.logger.error({ error, providerId: record.id }, 'Failed to initialize provider');
      }
    }
  }

  /**
   * Get a provider instance by ID
   */
  getProvider(providerId: string): DNSProvider | undefined {
    return this.providerInstances.get(providerId);
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): DNSProvider | undefined {
    if (!this.defaultProviderId) return undefined;
    return this.providerInstances.get(this.defaultProviderId);
  }

  /**
   * Get all enabled providers
   */
  getAllProviders(): Map<string, DNSProvider> {
    return this.providerInstances;
  }

  /**
   * Force re-sync all managed records with current provider defaults
   * This re-applies default content/TTL from provider settings to existing records
   */
  async forceResyncRecords(providerId?: string): Promise<{
    total: number;
    updated: number;
    unchanged: number;
    errors: number;
    details: Array<{ hostname: string; field: string; oldValue: string; newValue: string }>;
  }> {
    const db = getDatabase();
    const result = {
      total: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      details: [] as Array<{ hostname: string; field: string; oldValue: string; newValue: string }>,
    };

    this.logger.info({ providerId: providerId ?? 'all' }, 'Starting force re-sync of DNS records');

    // Get all managed records (optionally filtered by provider)
    const conditions = [eq(dnsRecords.managed, true)];
    if (providerId) {
      conditions.push(eq(dnsRecords.providerId, providerId));
    }

    const records = await db
      .select()
      .from(dnsRecords)
      .where(and(...conditions));

    result.total = records.length;
    this.logger.info({ count: records.length }, 'Found managed records to re-sync');

    for (const record of records) {
      try {
        const provider = this.providerInstances.get(record.providerId);
        if (!provider) {
          this.logger.warn({ providerId: record.providerId, hostname: record.name }, 'Provider not found for record');
          result.errors++;
          continue;
        }

        // Re-resolve defaults for this record's type
        const defaults = this.resolveRecordDefaults(record.type as DNSRecordType, provider);

        // Determine what the content should be based on current defaults
        let expectedContent = record.content;
        if (record.source === 'traefik' || record.source === 'direct' || record.source === 'managed') {
          // Only update content for auto-managed records, not manually created ones
          if (record.type === 'A') {
            expectedContent = defaults.publicIp;
          } else if (record.type === 'AAAA') {
            expectedContent = defaults.publicIpv6;
          } else if (record.type === 'CNAME') {
            expectedContent = defaults.content || provider.getZoneName() || '';
          }
        }

        const expectedTtl = defaults.ttl;
        const expectedProxied = ['A', 'AAAA', 'CNAME'].includes(record.type) ? defaults.proxied : undefined;

        // Check if update is needed
        const contentChanged = expectedContent && record.content !== expectedContent;
        const ttlChanged = record.ttl !== expectedTtl;
        const proxiedChanged = expectedProxied !== undefined && record.proxied !== expectedProxied;

        if (!contentChanged && !ttlChanged && !proxiedChanged) {
          result.unchanged++;
          continue;
        }

        // Log what's changing
        if (contentChanged) {
          result.details.push({
            hostname: record.name,
            field: 'content',
            oldValue: record.content,
            newValue: expectedContent,
          });
          this.logger.info(
            { hostname: record.name, oldContent: record.content, newContent: expectedContent },
            'Updating record content'
          );
        }
        if (ttlChanged) {
          result.details.push({
            hostname: record.name,
            field: 'ttl',
            oldValue: String(record.ttl),
            newValue: String(expectedTtl),
          });
        }

        // Update at provider
        if (record.externalId) {
          await provider.updateRecord(record.externalId, {
            type: record.type as DNSRecordType,
            name: record.name,
            content: expectedContent,
            ttl: expectedTtl,
            proxied: expectedProxied,
          });
        }

        // Update in database
        await db
          .update(dnsRecords)
          .set({
            content: expectedContent,
            ttl: expectedTtl,
            proxied: expectedProxied ?? record.proxied,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dnsRecords.id, record.id));

        result.updated++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error({ hostname: record.name, error: errorMessage }, 'Failed to re-sync record');
        result.errors++;
      }
    }

    this.logger.info(
      { total: result.total, updated: result.updated, unchanged: result.unchanged, errors: result.errors },
      'Force re-sync completed'
    );

    return result;
  }

  /**
   * Find provider by name (case-insensitive)
   */
  getProviderByName(name: string): { id: string; provider: DNSProvider } | undefined {
    const lowerName = name.toLowerCase();
    for (const [id, provider] of this.providerInstances) {
      if (provider.getProviderName().toLowerCase() === lowerName) {
        return { id, provider };
      }
    }
    return undefined;
  }

  /**
   * Find provider that manages a given hostname based on zone
   * Returns the single best match (most specific zone)
   */
  getProviderForZone(hostname: string): { id: string; provider: DNSProvider } | undefined {
    const matches = this.getProvidersForZone(hostname);
    return matches.length > 0 ? matches[0] : undefined;
  }

  /**
   * Find ALL providers that can manage a given hostname based on zone
   * Returns providers sorted by zone specificity (most specific first)
   */
  getProvidersForZone(hostname: string): Array<{ id: string; provider: DNSProvider }> {
    const lowerHostname = hostname.toLowerCase();
    const matches: Array<{ id: string; provider: DNSProvider; zoneLength: number }> = [];

    for (const [id, provider] of this.providerInstances) {
      const zone = provider.getZoneName()?.toLowerCase();
      if (!zone) continue;

      // Check if hostname ends with the zone or equals the zone
      if (lowerHostname === zone || lowerHostname.endsWith(`.${zone}`)) {
        matches.push({ id, provider, zoneLength: zone.length });
      }
    }

    // Sort by zone length descending (most specific first)
    matches.sort((a, b) => b.zoneLength - a.zoneLength);

    return matches.map(m => ({ id: m.id, provider: m.provider }));
  }

  /**
   * Determine which providers should handle a hostname based on labels
   * Supports:
   *   - dns.provider=<name> (single provider by name)
   *   - dns.provider.id=<uuid> (single provider by ID)
   *   - dns.providers=all (broadcast to all enabled providers)
   *   - dns.providers=cloudflare,technitium (broadcast to specific providers)
   *   - No label: auto-detect by zone, fallback to default
   */
  getProvidersForHostname(
    hostname: string,
    labels: Record<string, string>,
    labelPrefix: string
  ): Array<{ id: string; provider: DNSProvider }> {
    const results: Array<{ id: string; provider: DNSProvider }> = [];
    const lowerHostname = hostname.toLowerCase();

    // Check for broadcast mode: dns.providers=all or dns.providers=name1,name2
    const broadcastKey = `${labelPrefix}providers`;
    const broadcastValue = labels[broadcastKey];

    if (broadcastValue) {
      if (broadcastValue.toLowerCase() === 'all') {
        // Broadcast to ALL enabled providers
        for (const [id, provider] of this.providerInstances) {
          results.push({ id, provider });
        }
        this.logger.debug({ hostname, mode: 'broadcast-all', count: results.length }, 'Broadcasting to all providers');
        return results;
      } else {
        // Broadcast to specific providers (comma-separated names)
        const providerNames = broadcastValue.split(',').map((n) => n.trim().toLowerCase());
        for (const name of providerNames) {
          const found = this.getProviderByName(name);
          if (found) {
            results.push(found);
          } else {
            this.logger.warn({ hostname, providerName: name }, 'Broadcast provider not found');
          }
        }
        if (results.length > 0) {
          this.logger.debug({ hostname, mode: 'broadcast-specific', providers: providerNames }, 'Broadcasting to specific providers');
          return results;
        }
      }
    }

    // Check for single provider override by ID
    const providerIdKey = `${labelPrefix}provider.id`;
    const providerIdValue = labels[providerIdKey];
    if (providerIdValue) {
      const provider = this.providerInstances.get(providerIdValue);
      if (provider) {
        this.logger.debug({ hostname, providerId: providerIdValue }, 'Using provider by ID label');
        return [{ id: providerIdValue, provider }];
      } else {
        this.logger.warn({ hostname, providerId: providerIdValue }, 'Provider ID from label not found');
      }
    }

    // Check for single provider override by name
    const providerKey = `${labelPrefix}provider`;
    const providerName = labels[providerKey];
    if (providerName) {
      const found = this.getProviderByName(providerName);
      if (found) {
        this.logger.debug({ hostname, providerName }, 'Using provider by name label');
        return [found];
      } else {
        this.logger.warn({ hostname, providerName }, 'Provider name from label not found');
      }
    }

    // Get routing mode from config
    const routingMode = this.config.app.dnsRoutingMode;

    // If default-only mode, skip zone matching entirely
    if (routingMode === 'default-only') {
      if (this.defaultProviderId) {
        const defaultProvider = this.providerInstances.get(this.defaultProviderId);
        if (defaultProvider) {
          this.logger.debug({ hostname, providerId: this.defaultProviderId, mode: 'default-only' }, 'Using default provider (default-only mode)');
          return [{ id: this.defaultProviderId, provider: defaultProvider }];
        }
      }
      this.logger.warn({ hostname }, 'No default provider configured (default-only mode)');
      return [];
    }

    // Auto-detect by zone (for 'auto' and 'auto-with-fallback' modes)
    const multiProviderSameZone = this.config.app.dnsMultiProviderSameZone;
    const zoneMatches = this.getProvidersForZone(hostname);

    if (zoneMatches.length > 0) {
      if (multiProviderSameZone) {
        // Return ALL matching providers
        this.logger.debug(
          { hostname, count: zoneMatches.length },
          'Auto-routed to multiple providers'
        );
        return zoneMatches;
      } else {
        // Return only the best match (most specific zone)
        const bestMatch = zoneMatches[0]!; // Safe: we checked length > 0
        this.logger.debug(
          { hostname, provider: bestMatch.provider.getProviderName() },
          'Auto-routed to provider'
        );
        return [bestMatch];
      }
    }

    // No matching zone - check if we should fallback to default
    // IMPORTANT: Fallback should only apply if hostname can be a valid record in the default provider's zone
    if (routingMode === 'auto-with-fallback' && this.defaultProviderId) {
      const defaultProvider = this.providerInstances.get(this.defaultProviderId);
      if (defaultProvider) {
        const defaultZone = defaultProvider.getZoneName()?.toLowerCase();
        // Only fallback if hostname ends with the default provider's zone
        // This prevents creating invalid cross-zone records
        if (defaultZone && (lowerHostname === defaultZone || lowerHostname.endsWith(`.${defaultZone}`))) {
          this.logger.debug({ hostname, provider: defaultProvider.getProviderName() }, 'Using fallback provider');
          return [{ id: this.defaultProviderId, provider: defaultProvider }];
        } else {
          this.logger.debug({ hostname }, 'Hostname does not match default provider zone');
        }
      }
    }

    // No matching zone and no fallback - skip this hostname (only log at debug, this is normal)
    this.logger.debug({ hostname }, 'No matching provider zone');
    return [];
  }

  /**
   * Setup event subscriptions
   */
  private setupEventSubscriptions(): void {
    // Subscribe to Traefik router updates
    eventBus.subscribe(EventTypes.TRAEFIK_ROUTERS_UPDATED, async (data) => {
      const { hostnames, containerLabels } = data;
      await this.processHostnames(hostnames, containerLabels);
    });
  }

  /**
   * Process a list of hostnames and ensure DNS records exist
   * Supports multi-provider routing based on zones and labels
   */
  async processHostnames(
    hostnames: string[],
    containerLabels: Record<string, Record<string, string>>
  ): Promise<{ stats: DNSManagerStats; processedHostnames: ProcessedHostname[] }> {
    this.syncCount++;

    // Detect if hostnames changed since last sync
    const currentHostnamesSet = new Set(hostnames);
    const hostnamesChanged = this.hasHostnamesChanged(currentHostnamesSet);

    // Only log hostname details when they change or on first sync
    if (hostnamesChanged || this.syncCount === 1) {
      const added = hostnames.filter(h => !this.previousHostnames.has(h));
      const removed = Array.from(this.previousHostnames).filter(h => !currentHostnamesSet.has(h));

      if (added.length > 0 || removed.length > 0) {
        this.logger.info(
          { total: hostnames.length, added: added.length, removed: removed.length },
          'Hostname changes detected'
        );
        if (added.length > 0 && added.length <= 5) {
          this.logger.info({ hostnames: added }, 'New hostnames');
        }
        if (removed.length > 0 && removed.length <= 5) {
          this.logger.info({ hostnames: removed }, 'Removed hostnames');
        }
      }
      this.previousHostnames = currentHostnamesSet;
      this.lastLoggedHostnameCount = hostnames.length;
    }

    // Reset stats
    this.resetStats();

    const processedHostnames: ProcessedHostname[] = [];
    const labelPrefix = this.config.docker.labelPrefix;

    // Group records by provider
    const providerGroups = new Map<string, ProviderRecordGroup>();

    for (const hostname of hostnames) {
      try {
        this.stats.total++;

        // Get labels for this hostname
        const labels = containerLabels[hostname] ?? {};

        // Check if we should manage this hostname
        if (!this.shouldManageHostname(hostname, labels, labelPrefix)) {
          this.stats.skipped++;
          continue;
        }

        // Determine which providers should handle this hostname
        const targetProviders = this.getProvidersForHostname(hostname, labels, labelPrefix);

        if (targetProviders.length === 0) {
          this.stats.skipped++;
          continue;
        }

        // Process for each target provider
        for (const { id: providerId, provider } of targetProviders) {
          const providerZone = provider.getZoneName();

          // Create fully qualified domain name
          const fqdn = this.ensureFqdn(hostname, providerZone);

          // Extract DNS config from labels (provider-specific content if needed)
          const recordConfig = this.extractDnsConfig(fqdn, labels, labelPrefix, provider);

          // Skip records marked for skipping (e.g., self-referencing CNAMEs)
          if (recordConfig.content === '__SKIP__') {
            this.stats.skipped++;
            continue;
          }

          // Add to provider group
          if (!providerGroups.has(providerId)) {
            providerGroups.set(providerId, {
              provider,
              providerId,
              records: [],
            });
          }
          providerGroups.get(providerId)!.records.push(recordConfig);

          processedHostnames.push({
            hostname: fqdn,
            recordType: recordConfig.type,
            content: recordConfig.content,
            providerId,
          });
        }
      } catch (error) {
        this.stats.errors++;
        this.logger.error({ error, hostname }, 'Error processing hostname');
      }
    }

    // Process each provider's records
    for (const [providerId, group] of providerGroups) {
      if (group.records.length === 0) continue;

      this.logger.debug(
        { providerId, providerName: group.provider.getProviderName(), recordCount: group.records.length },
        'Processing records for provider'
      );

      try {
        const result = await group.provider.batchEnsureRecords(group.records);
        this.updateStatsFromBatchResult(result);

        // Track records in database
        await this.trackRecords(result, providerId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          { providerId, providerName: group.provider.getProviderName(), recordCount: group.records.length },
          `Error processing records for provider: ${errorMessage}`
        );
        if (errorStack) {
          this.logger.debug({ stack: errorStack }, 'Error stack trace');
        }
        this.stats.errors += group.records.length;
      }
    }

    // Log stats
    this.logStats();

    // Cleanup orphaned records if enabled (check all providers)
    if (this.config.app.cleanupOrphaned && processedHostnames.length > 0) {
      await this.cleanupOrphanedRecords(processedHostnames);
    }

    // Publish event
    eventBus.publish(EventTypes.DNS_RECORDS_UPDATED, {
      stats: this.stats,
      processedHostnames: processedHostnames.map((h) => h.hostname),
    });

    return { stats: this.stats, processedHostnames };
  }

  /**
   * Check if a hostname should be managed
   */
  private shouldManageHostname(
    hostname: string,
    labels: Record<string, string>,
    labelPrefix: string
  ): boolean {
    const manageKey = `${labelPrefix}manage`;
    const skipKey = `${labelPrefix}skip`;

    // Check skip label first (takes precedence)
    if (labels[skipKey]?.toLowerCase() === 'true') {
      this.logger.debug({ hostname }, 'Skipping hostname (skip label)');
      return false;
    }

    // Check manage label
    const manageLabel = labels[manageKey]?.toLowerCase();
    const defaultManage = this.config.dnsDefaults.manage;

    if (!defaultManage && manageLabel !== 'true') {
      this.logger.debug({ hostname }, 'Not managing hostname (manage=false)');
      return false;
    }

    return true;
  }

  /**
   * Resolve default settings for a DNS record
   * Priority: label > provider-type-specific > provider-general > global-setting > env-var > builtin
   */
  private resolveRecordDefaults(
    recordType: DNSRecordType,
    provider?: DNSProvider
  ): ResolvedDefaults {
    const settingsService = getSettingsService();

    // Get provider settings if available
    const providerSettings = provider?.getSettings() as { defaults?: ProviderDefaults } | undefined;
    const providerDefaults = providerSettings?.defaults;
    const typeDefaults = providerDefaults?.byType?.[recordType];

    // Get env var defaults from ConfigManager
    const envDefaults = this.config.getRecordTypeDefaults(recordType);

    // Builtin defaults
    const BUILTIN = {
      recordType: 'CNAME' as DNSRecordType,
      content: '',
      ttl: 1,
      proxied: true,
      publicIp: '',
      publicIpv6: '',
    };

    // Resolve each setting with priority chain
    const result: ResolvedDefaults = {
      recordType: BUILTIN.recordType,
      content: BUILTIN.content,
      ttl: BUILTIN.ttl,
      proxied: BUILTIN.proxied,
      publicIp: BUILTIN.publicIp,
      publicIpv6: BUILTIN.publicIpv6,
      sources: {
        recordType: 'builtin',
        content: 'builtin',
        ttl: 'builtin',
        proxied: 'builtin',
      },
    };

    // Resolve recordType
    // 1. Provider type-specific (N/A for recordType)
    // 2. Provider general
    if (providerDefaults?.recordType !== undefined) {
      result.recordType = providerDefaults.recordType;
      result.sources.recordType = 'provider';
    }
    // 3. Global setting
    else {
      const globalType = settingsService.get('dns_default_type');
      if (globalType) {
        result.recordType = globalType as DNSRecordType;
        result.sources.recordType = 'global';
      }
      // 4. Env var (via ConfigManager dnsDefaults)
      else if (this.config.dnsDefaults.recordType) {
        result.recordType = this.config.dnsDefaults.recordType;
        result.sources.recordType = 'env';
      }
    }

    // Resolve content
    // 1. Provider type-specific
    if (typeDefaults?.content !== undefined && typeDefaults.content !== '') {
      result.content = typeDefaults.content;
      result.sources.content = 'provider-type';
    }
    // 2. Provider general
    else if (providerDefaults?.content !== undefined && providerDefaults.content !== '') {
      result.content = providerDefaults.content;
      result.sources.content = 'provider';
    }
    // 3. Global setting
    else {
      const globalContent = settingsService.get('dns_default_content');
      if (globalContent) {
        result.content = String(globalContent);
        result.sources.content = 'global';
      }
      // 4. Env var (via ConfigManager type defaults)
      else if (envDefaults.content) {
        result.content = envDefaults.content;
        result.sources.content = 'env';
      }
    }

    // Resolve TTL
    // First check if global override is enabled
    const globalTtlOverride = settingsService.get<boolean>('dns_default_ttl_override');
    const isGlobalOverrideEnabled = globalTtlOverride === true;

    // Get provider TTL constraints for clamping
    const providerInfo = provider?.getInfo();
    const ttlMin = providerInfo?.features?.ttlMin ?? 1;
    const ttlMax = providerInfo?.features?.ttlMax ?? 86400;

    // Helper to clamp TTL to provider limits
    const clampTtl = (ttl: number): number => Math.min(Math.max(ttl, ttlMin), ttlMax);

    if (isGlobalOverrideEnabled) {
      // Global override is enabled - use global TTL (clamped to provider limits)
      const globalTtl = settingsService.get('dns_default_ttl');
      if (globalTtl !== undefined) {
        const ttlValue = typeof globalTtl === 'number' ? globalTtl : parseInt(String(globalTtl), 10);
        result.ttl = clampTtl(ttlValue);
        result.sources.ttl = 'global';
      }
    } else {
      // Normal priority chain (provider-specific > provider-general > env > builtin)
      // 1. Provider type-specific
      if (typeDefaults?.ttl !== undefined) {
        result.ttl = clampTtl(typeDefaults.ttl);
        result.sources.ttl = 'provider-type';
      }
      // 2. Provider general
      else if (providerDefaults?.ttl !== undefined) {
        result.ttl = clampTtl(providerDefaults.ttl);
        result.sources.ttl = 'provider';
      }
      // 3. Env var (when global override is disabled, skip global setting)
      else if (envDefaults.ttl !== undefined) {
        result.ttl = clampTtl(envDefaults.ttl);
        result.sources.ttl = 'env';
      }
      // 4. Provider type default (from provider info)
      else if (providerInfo?.features?.ttlMin !== undefined) {
        // Use provider's recommended default (ttlMin for Cloudflare=1=auto, or a sensible value)
        const providerDefault = providerInfo.features.ttlMin === 1 ? 1 : Math.max(300, providerInfo.features.ttlMin);
        result.ttl = providerDefault;
        result.sources.ttl = 'builtin';
      }
    }

    // Resolve proxied
    // 1. Provider type-specific
    if (typeDefaults?.proxied !== undefined) {
      result.proxied = typeDefaults.proxied;
      result.sources.proxied = 'provider-type';
    }
    // 2. Provider general
    else if (providerDefaults?.proxied !== undefined) {
      result.proxied = providerDefaults.proxied;
      result.sources.proxied = 'provider';
    }
    // 3. Global setting
    else {
      const globalProxied = settingsService.get<boolean>('dns_default_proxied');
      if (globalProxied !== undefined) {
        result.proxied = globalProxied;
        result.sources.proxied = 'global';
      }
      // 4. Env var
      else if (envDefaults.proxied !== undefined) {
        result.proxied = envDefaults.proxied;
        result.sources.proxied = 'env';
      }
    }

    // Resolve publicIp (for A records)
    // 1. Provider setting
    if (providerDefaults?.publicIp) {
      result.publicIp = providerDefaults.publicIp;
    }
    // 2. Global / auto-detected
    else {
      result.publicIp = this.config.getPublicIPSync() ?? '';
    }

    // Resolve publicIpv6 (for AAAA records)
    // 1. Provider setting
    if (providerDefaults?.publicIpv6) {
      result.publicIpv6 = providerDefaults.publicIpv6;
    }
    // 2. Global / auto-detected
    else {
      result.publicIpv6 = this.config.getPublicIPv6Sync() ?? '';
    }

    return result;
  }

  /**
   * Extract DNS configuration from container labels
   * Uses the new settings resolution hierarchy for defaults
   */
  private extractDnsConfig(
    fqdn: string,
    labels: Record<string, string>,
    labelPrefix: string,
    provider?: DNSProvider
  ): DNSRecordCreateInput {
    // Get record type from label or resolved defaults
    const typeKey = `${labelPrefix}type`;
    const labelType = labels[typeKey]?.toUpperCase() as DNSRecordType | undefined;

    // Resolve all defaults for this provider/type combination
    // If type specified in label, use that for type-specific resolution
    const tempType = labelType ?? 'CNAME'; // Use CNAME as temp for initial resolution
    const defaults = this.resolveRecordDefaults(tempType, provider);

    // Final record type: label > resolved default
    const type = labelType ?? defaults.recordType;

    // Re-resolve if type changed (to get correct type-specific defaults)
    const finalDefaults = (type !== tempType) ? this.resolveRecordDefaults(type, provider) : defaults;

    // Get content from label or use resolved defaults
    const contentKey = `${labelPrefix}content`;
    let content = labels[contentKey];

    // Apply content defaults based on record type
    if (!content) {
      if (type === 'A') {
        // Use provider-specific or global public IP
        content = finalDefaults.publicIp;
      } else if (type === 'AAAA') {
        // Use provider-specific or global public IPv6
        content = finalDefaults.publicIpv6;
      } else if (type === 'CNAME') {
        // Use resolved default content, or fall back to zone name
        content = finalDefaults.content || provider?.getZoneName() || this.getDefaultProvider()?.getZoneName() || '';

        // Check for self-referencing CNAME (apex domain)
        if (fqdn.toLowerCase() === content.toLowerCase()) {
          this.logger.debug({ hostname: fqdn }, 'Apex domain detected, skipping self-referencing CNAME');
          content = '__SKIP__'; // Special marker to skip this record
        }
      } else {
        // For other types (MX, TXT, SRV, CAA, NS) use resolved default
        content = finalDefaults.content;
      }
    }

    // Check for hostname overrides (persistent per-hostname settings)
    const override = this.getHostnameOverride(fqdn);
    if (override) {
      this.logger.debug({ hostname: fqdn, override }, 'Applying hostname override');
    }

    // Build record config with override support
    // Priority: label > override > default
    const ttlLabel = labels[`${labelPrefix}ttl`];
    const config: DNSRecordCreateInput = {
      type,
      name: fqdn,
      content: override?.content ?? content,
      ttl: ttlLabel !== undefined
        ? parseInt(ttlLabel, 10)
        : (override?.ttl ?? finalDefaults.ttl),
    };

    // Add proxied for supported types (Cloudflare only)
    // Priority: label > override > default
    // Only set proxied if provider supports it (to avoid false update detections)
    const providerSupportsProxied = provider?.getInfo().features.proxied === true;
    if (['A', 'AAAA', 'CNAME'].includes(type) && providerSupportsProxied) {
      const proxiedKey = `${labelPrefix}proxied`;
      const proxiedLabel = labels[proxiedKey];
      if (proxiedLabel !== undefined) {
        // Label has highest priority
        config.proxied = proxiedLabel.toLowerCase() === 'true';
      } else if (override?.proxied !== undefined && override?.proxied !== null) {
        // Override is second priority
        config.proxied = override.proxied;
      } else {
        // Fall back to defaults
        config.proxied = finalDefaults.proxied;
      }
    }

    // Add priority for MX/SRV (use env defaults for these special fields)
    const envDefaults = this.config.getRecordTypeDefaults(type);
    if (type === 'MX' || type === 'SRV') {
      config.priority = parseInt(labels[`${labelPrefix}priority`] ?? String(envDefaults.priority ?? 10), 10);
    }

    // Add SRV-specific fields
    if (type === 'SRV') {
      config.weight = parseInt(labels[`${labelPrefix}weight`] ?? String(envDefaults.weight ?? 1), 10);
      config.port = parseInt(labels[`${labelPrefix}port`] ?? String(envDefaults.port ?? 80), 10);
    }

    // Add CAA-specific fields
    if (type === 'CAA') {
      config.flags = parseInt(labels[`${labelPrefix}flags`] ?? String(envDefaults.flags ?? 0), 10);
      config.tag = labels[`${labelPrefix}tag`] ?? envDefaults.tag ?? 'issue';
    }

    return config;
  }

  /**
   * Track DNS records in database
   */
  private async trackRecords(result: BatchResult, providerId: string): Promise<void> {
    const db = getDatabase();
    const now = new Date();
    const provider = this.providerInstances.get(providerId);

    // Track created records
    for (const record of result.created) {
      // Check if record already exists in database (prevent duplicates)
      const existingByNameType = await db
        .select({ id: dnsRecords.id })
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.providerId, providerId),
            eq(dnsRecords.name, record.name),
            eq(dnsRecords.type, record.type)
          )
        )
        .limit(1);

      if (existingByNameType.length > 0) {
        // Update existing record instead of creating duplicate
        await db
          .update(dnsRecords)
          .set({
            externalId: record.id,
            content: record.content,
            ttl: record.ttl,
            proxied: record.proxied,
            priority: record.priority,
            lastSyncedAt: now,
            orphanedAt: null,
          })
          .where(eq(dnsRecords.id, existingByNameType[0]!.id));
        this.logger.debug(
          { name: record.name, type: record.type },
          'Updated existing database entry (duplicate prevention)'
        );
        continue;
      }

      const recordId = uuidv4();
      await db.insert(dnsRecords).values({
        id: recordId,
        providerId,
        externalId: record.id,
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied,
        priority: record.priority,
        weight: record.weight,
        port: record.port,
        flags: record.flags,
        tag: record.tag,
        source: 'traefik',
        managed: true, // Records we create are always managed
        lastSyncedAt: now,
      });

      // Publish event for notifications and audit
      eventBus.publish(EventTypes.DNS_RECORD_CREATED, {
        record: {
          id: recordId,
          type: record.type,
          name: record.name,
          content: record.content,
        },
        providerId,
      });
    }

    // Upsert updated and unchanged records
    // (unchanged records may exist at provider but not in our database - e.g., fresh v2 install)
    for (const record of [...result.updated, ...result.unchanged]) {
      if (record.id) {
        // First try to find by externalId (works for providers with stable IDs like DigitalOcean/Cloudflare)
        let existing = await db
          .select({ id: dnsRecords.id })
          .from(dnsRecords)
          .where(eq(dnsRecords.externalId, record.id))
          .limit(1);

        // If not found by externalId, try by providerId + name + type
        // This handles providers like Technitium where externalId is generated client-side
        // and may change if content normalization differs between syncs
        if (existing.length === 0) {
          existing = await db
            .select({ id: dnsRecords.id })
            .from(dnsRecords)
            .where(
              and(
                eq(dnsRecords.providerId, providerId),
                eq(dnsRecords.name, record.name),
                eq(dnsRecords.type, record.type)
              )
            )
            .limit(1);
        }

        if (existing.length > 0) {
          // Update existing record (also update externalId in case it changed)
          // Also reclaim "discovered" records that are now being actively synced from Traefik
          await db
            .update(dnsRecords)
            .set({
              externalId: record.id, // Update externalId in case it changed
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied,
              priority: record.priority,
              lastSyncedAt: now,
              orphanedAt: null, // Clear orphaned status
              source: 'traefik', // Reclaim as Traefik-managed
              managed: true, // Mark as managed since we're actively syncing
            })
            .where(eq(dnsRecords.id, existing[0]!.id));
        } else {
          // Insert record that exists at provider but not in our database
          // Since we're actively syncing from Traefik, mark as managed
          // (The ownership marker check is only for manual "discover" operations)
          await db.insert(dnsRecords).values({
            id: uuidv4(),
            providerId,
            externalId: record.id,
            type: record.type,
            name: record.name,
            content: record.content,
            ttl: record.ttl,
            proxied: record.proxied,
            priority: record.priority,
            weight: record.weight,
            port: record.port,
            flags: record.flags,
            tag: record.tag,
            comment: record.comment,
            source: 'traefik',
            managed: true, // Record is being actively synced from Traefik
            lastSyncedAt: now,
          });
          this.logger.debug(
            { name: record.name, type: record.type },
            'Claimed existing record at provider'
          );
        }
      }
    }
  }

  /**
   * Cleanup orphaned DNS records across all providers
   */
  private async cleanupOrphanedRecords(processedHostnames: ProcessedHostname[]): Promise<void> {
    const db = getDatabase();
    const gracePeriodMs = this.config.app.cleanupGracePeriod * 60 * 1000;
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - gracePeriodMs);

    this.logger.debug('Checking for orphaned DNS records');

    // Load preserved hostnames from database
    const preservedList = await db.select().from(preservedHostnames);
    const preservedPatterns = preservedList.map((p) => p.hostname.toLowerCase());

    // Build a map of active hostnames per provider
    const activeByProvider = new Map<string, Set<string>>();
    for (const { hostname, providerId } of processedHostnames) {
      if (!activeByProvider.has(providerId)) {
        activeByProvider.set(providerId, new Set());
      }
      activeByProvider.get(providerId)!.add(hostname.toLowerCase());
    }

    let totalOrphaned = 0;
    let totalDeleted = 0;
    let totalReactivated = 0;
    let totalPreserved = 0;

    // Process each provider that has active records
    for (const [providerId, activeHostnames] of activeByProvider) {
      const provider = this.providerInstances.get(providerId);
      if (!provider) continue;

      // Get all tracked records for this provider
      const trackedRecords = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.providerId, providerId),
            eq(dnsRecords.source, 'traefik')
          )
        );

      for (const record of trackedRecords) {
        const normalizedHostname = record.name.toLowerCase();
        const isActive = activeHostnames.has(normalizedHostname);
        const isPreserved = this.isHostnamePreserved(normalizedHostname, preservedPatterns);

        // Skip unmanaged records - they were pre-existing and should never be deleted
        if (!record.managed) {
          this.logger.debug(
            { name: record.name, type: record.type, providerId },
            'Skipping unmanaged record (not created by TrafegoDNS)'
          );
          continue;
        }

        if (isActive) {
          // Record is active - clear orphaned status if set
          if (record.orphanedAt) {
            await db
              .update(dnsRecords)
              .set({ orphanedAt: null })
              .where(eq(dnsRecords.id, record.id));
            totalReactivated++;
            this.logger.debug({ name: record.name }, 'Record reactivated');
          }
        } else if (isPreserved) {
          // Record is preserved - never delete
          if (record.orphanedAt) {
            await db
              .update(dnsRecords)
              .set({ orphanedAt: null })
              .where(eq(dnsRecords.id, record.id));
          }
          totalPreserved++;
        } else {
          // Record is not active and not preserved
          if (!record.orphanedAt) {
            // Mark as orphaned
            await db
              .update(dnsRecords)
              .set({ orphanedAt: now })
              .where(eq(dnsRecords.id, record.id));
            totalOrphaned++;
            this.logger.debug({ name: record.name }, 'Record marked orphaned');

            eventBus.publish(EventTypes.DNS_RECORD_ORPHANED, {
              record: {
                id: record.id,
                type: record.type,
                name: record.name,
                content: record.content,
              },
              gracePeriodMinutes: this.config.app.cleanupGracePeriod,
            });
          } else if (new Date(record.orphanedAt) < cutoffTime) {
            // Grace period elapsed - delete
            try {
              if (record.externalId) {
                await provider.deleteRecord(record.externalId);
              }
              await db.delete(dnsRecords).where(eq(dnsRecords.id, record.id));
              totalDeleted++;
              this.logger.debug({ name: record.name }, 'Orphaned record deleted');

              eventBus.publish(EventTypes.DNS_RECORD_DELETED, {
                record: {
                  id: record.id,
                  type: record.type,
                  name: record.name,
                  content: record.content,
                },
                providerId,
              });
            } catch (error) {
              this.logger.error({ error, name: record.name }, 'Failed to delete orphaned record');
            }
          }
        }
      }
    }

    // Only log if there were any changes
    if (totalOrphaned > 0 || totalDeleted > 0 || totalReactivated > 0) {
      const parts: string[] = [];
      if (totalOrphaned > 0) parts.push(`${totalOrphaned} orphaned`);
      if (totalDeleted > 0) parts.push(`${totalDeleted} deleted`);
      if (totalReactivated > 0) parts.push(`${totalReactivated} reactivated`);
      this.logger.info({}, `Cleanup: ${parts.join(', ')}`);
    }
  }

  /**
   * Check if a hostname matches any preserved patterns
   * Supports exact matches and wildcard patterns (*.example.com)
   */
  private isHostnamePreserved(hostname: string, preservedPatterns: string[]): boolean {
    for (const pattern of preservedPatterns) {
      // Exact match
      if (pattern === hostname) {
        return true;
      }

      // Wildcard match (*.example.com matches sub.example.com but not example.com)
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1); // .example.com
        if (hostname.endsWith(suffix) && hostname.length > suffix.length) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Ensure hostname is fully qualified
   */
  private ensureFqdn(hostname: string, zone: string): string {
    if (hostname.includes('.')) {
      return hostname;
    }
    return `${hostname}.${zone}`;
  }

  /**
   * Update stats from batch result
   */
  private updateStatsFromBatchResult(result: BatchResult): void {
    this.stats.created += result.created.length;
    this.stats.updated += result.updated.length;
    this.stats.upToDate += result.unchanged.length;
    this.stats.errors += result.errors.length;
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      created: 0,
      updated: 0,
      upToDate: 0,
      errors: 0,
      skipped: 0,
      total: 0,
    };
  }

  /**
   * Log statistics
   */
  private logStats(): void {
    if (this.stats.total === 0) return;

    const hasChanges = this.stats.created > 0 || this.stats.updated > 0 || this.stats.errors > 0;

    if (hasChanges) {
      // Build a concise one-line summary
      const parts: string[] = [];
      if (this.stats.created > 0) parts.push(`+${this.stats.created} created`);
      if (this.stats.updated > 0) parts.push(`~${this.stats.updated} updated`);
      if (this.stats.upToDate > 0) parts.push(`${this.stats.upToDate} in sync`);
      if (this.stats.errors > 0) parts.push(`!${this.stats.errors} errors`);

      if (this.stats.errors > 0) {
        this.logger.warn({ total: this.stats.total }, `Sync: ${parts.join(', ')}`);
      } else {
        this.logger.info({ total: this.stats.total }, `Sync: ${parts.join(', ')}`);
      }
    }
    // Don't log when everything is in sync - that's the expected normal state
  }

  /**
   * Check if the set of hostnames has changed since last sync
   */
  private hasHostnamesChanged(current: Set<string>): boolean {
    if (current.size !== this.previousHostnames.size) return true;
    for (const hostname of current) {
      if (!this.previousHostnames.has(hostname)) return true;
    }
    return false;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    for (const [id, provider] of this.providerInstances) {
      await provider.dispose();
      this.logger.debug({ providerId: id }, 'Provider disposed');
    }
    this.providerInstances.clear();
    this.initialized = false;
  }
}
