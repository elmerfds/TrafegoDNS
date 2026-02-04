/**
 * DNS Manager Service
 * Orchestrates DNS record management across providers
 */
import { v4 as uuidv4 } from 'uuid';
import { logger, createChildLogger } from '../core/Logger.js';
import { eventBus, EventTypes } from '../core/EventBus.js';
import { getDatabase } from '../database/connection.js';
import { dnsRecords, providers, preservedHostnames } from '../database/schema/index.js';
import { eq, and, isNull, lt } from 'drizzle-orm';
import { DNSProvider, createProvider, type BatchResult } from '../providers/index.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordType, ProviderType } from '../types/index.js';
import type { Logger } from 'pino';

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

export class DNSManager {
  private logger: Logger;
  private config: ConfigManager;
  private providerInstances: Map<string, DNSProvider> = new Map();
  private defaultProviderId: string | null = null;
  private stats: DNSManagerStats = {
    created: 0,
    updated: 0,
    upToDate: 0,
    errors: 0,
    skipped: 0,
    total: 0,
  };
  private initialized: boolean = false;

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

      this.initialized = true;
      this.logger.info('DNS Manager initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize DNS Manager');
      throw error;
    }
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

        const provider = createProvider({
          id: record.id,
          name: record.name,
          type: record.type as ProviderType,
          credentials,
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
        const providerNames = zoneMatches.map(m => m.provider.getProviderName()).join(', ');
        this.logger.info(
          { hostname, providers: providerNames, count: zoneMatches.length },
          'Auto-routed to multiple providers by zone (multi-provider mode)'
        );
        return zoneMatches;
      } else {
        // Return only the best match (most specific zone)
        const bestMatch = zoneMatches[0]!; // Safe: we checked length > 0
        this.logger.info(
          { hostname, providerId: bestMatch.id, providerName: bestMatch.provider.getProviderName(), zone: bestMatch.provider.getZoneName() },
          'Auto-routed to provider by zone'
        );
        return [bestMatch];
      }
    }

    // No matching zone - check if we should fallback to default
    if (routingMode === 'auto-with-fallback' && this.defaultProviderId) {
      const defaultProvider = this.providerInstances.get(this.defaultProviderId);
      if (defaultProvider) {
        this.logger.info(
          { hostname, providerId: this.defaultProviderId, providerName: defaultProvider.getProviderName(), mode: 'fallback' },
          'No zone match - using default provider (auto-with-fallback mode)'
        );
        return [{ id: this.defaultProviderId, provider: defaultProvider }];
      }
    }

    // No matching zone and no fallback - skip this hostname
    const configuredZones = Array.from(this.providerInstances.values())
      .map(p => ({ name: p.getProviderName(), zone: p.getZoneName() }))
      .filter(z => z.zone);
    this.logger.info(
      { hostname, configuredZones, routingMode },
      'Skipping hostname - no matching zone configured'
    );
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
    // Log all hostnames being processed and available providers
    const availableProviders = Array.from(this.providerInstances.entries()).map(([id, p]) => ({
      id,
      name: p.getProviderName(),
      zone: p.getZoneName(),
    }));
    this.logger.info({ count: hostnames.length, hostnames, providers: availableProviders }, 'Processing hostnames from Traefik');

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
        this.logger.error({ error, providerId }, 'Error processing records for provider');
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
      this.logger.info({ hostname, reason: 'skip label set to true' }, 'Skipping hostname');
      return false;
    }

    // Check manage label
    const manageLabel = labels[manageKey]?.toLowerCase();
    const defaultManage = this.config.dnsDefaults.manage;

    if (!defaultManage && manageLabel !== 'true') {
      this.logger.info({ hostname, defaultManage, manageLabel, reason: 'default manage=false and no manage=true label' }, 'Not managing hostname');
      return false;
    }

    return true;
  }

  /**
   * Extract DNS configuration from container labels
   */
  private extractDnsConfig(
    fqdn: string,
    labels: Record<string, string>,
    labelPrefix: string,
    provider?: DNSProvider
  ): DNSRecordCreateInput {
    // Get record type
    const typeKey = `${labelPrefix}type`;
    const type = (labels[typeKey]?.toUpperCase() ?? this.config.dnsDefaults.recordType) as DNSRecordType;

    // Get type-specific defaults
    const typeDefaults = this.config.getRecordTypeDefaults(type);

    // Get content
    const contentKey = `${labelPrefix}content`;
    let content = labels[contentKey] ?? typeDefaults.content;

    // For A records, use public IP if no content specified
    if (type === 'A' && !content) {
      content = this.config.getPublicIPSync() ?? '';
    }

    // For AAAA records, use public IPv6 if no content specified
    if (type === 'AAAA' && !content) {
      content = this.config.getPublicIPv6Sync() ?? '';
    }

    // For CNAME records, use the zone as default
    // But skip if this would create a self-referencing CNAME (hostname equals zone)
    if (type === 'CNAME' && !content) {
      const zoneName = provider?.getZoneName() ?? this.getDefaultProvider()?.getZoneName() ?? '';
      // Check if this would be a self-reference (apex domain CNAME pointing to itself)
      if (fqdn.toLowerCase() === zoneName.toLowerCase()) {
        // For apex domains, use A record with public IP instead of self-referencing CNAME
        this.logger.debug({ hostname: fqdn }, 'Apex domain detected, skipping self-referencing CNAME');
        content = '__SKIP__'; // Special marker to skip this record
      } else {
        content = zoneName;
      }
    }

    // Build record config
    const config: DNSRecordCreateInput = {
      type,
      name: fqdn,
      content,
      ttl: parseInt(labels[`${labelPrefix}ttl`] ?? String(typeDefaults.ttl), 10),
    };

    // Add proxied for supported types (only for Cloudflare)
    if (['A', 'AAAA', 'CNAME'].includes(type)) {
      const proxiedKey = `${labelPrefix}proxied`;
      const proxiedLabel = labels[proxiedKey];
      config.proxied = proxiedLabel !== undefined ? proxiedLabel.toLowerCase() === 'true' : typeDefaults.proxied;
    }

    // Add priority for MX/SRV
    if (type === 'MX' || type === 'SRV') {
      config.priority = parseInt(labels[`${labelPrefix}priority`] ?? String(typeDefaults.priority ?? 10), 10);
    }

    // Add SRV-specific fields
    if (type === 'SRV') {
      config.weight = parseInt(labels[`${labelPrefix}weight`] ?? String(typeDefaults.weight ?? 1), 10);
      config.port = parseInt(labels[`${labelPrefix}port`] ?? String(typeDefaults.port ?? 80), 10);
    }

    // Add CAA-specific fields
    if (type === 'CAA') {
      config.flags = parseInt(labels[`${labelPrefix}flags`] ?? String(typeDefaults.flags ?? 0), 10);
      config.tag = labels[`${labelPrefix}tag`] ?? typeDefaults.tag ?? 'issue';
    }

    return config;
  }

  /**
   * Track DNS records in database
   */
  private async trackRecords(result: BatchResult, providerId: string): Promise<void> {
    const db = getDatabase();
    const now = new Date();

    // Track created records
    for (const record of result.created) {
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
        // Check if record exists in database
        const existing = await db
          .select({ id: dnsRecords.id })
          .from(dnsRecords)
          .where(eq(dnsRecords.externalId, record.id))
          .limit(1);

        if (existing.length > 0) {
          // Update existing record
          await db
            .update(dnsRecords)
            .set({
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied,
              priority: record.priority,
              lastSyncedAt: now,
              orphanedAt: null, // Clear orphaned status
            })
            .where(eq(dnsRecords.externalId, record.id));
        } else {
          // Insert record that exists at provider but not in our database
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
            source: 'traefik',
            lastSyncedAt: now,
          });
          this.logger.debug({ name: record.name, type: record.type }, 'Imported existing provider record to database');
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

        if (isActive) {
          // Record is active - clear orphaned status if set
          if (record.orphanedAt) {
            await db
              .update(dnsRecords)
              .set({ orphanedAt: null })
              .where(eq(dnsRecords.id, record.id));
            totalReactivated++;
            this.logger.info({ name: record.name, type: record.type, providerId }, 'Record reactivated');
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
          this.logger.debug({ name: record.name, type: record.type, providerId }, 'Record preserved from deletion');
        } else {
          // Record is not active and not preserved
          if (!record.orphanedAt) {
            // Mark as orphaned
            await db
              .update(dnsRecords)
              .set({ orphanedAt: now })
              .where(eq(dnsRecords.id, record.id));
            totalOrphaned++;
            this.logger.info({ name: record.name, type: record.type, providerId }, 'Record marked as orphaned');

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

              this.logger.info({ name: record.name, type: record.type, providerId }, 'Orphaned record deleted');

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
              this.logger.error({ error, name: record.name, providerId }, 'Failed to delete orphaned record');
            }
          }
        }
      }
    }

    if (totalOrphaned > 0 || totalDeleted > 0 || totalReactivated > 0 || totalPreserved > 0) {
      this.logger.info(
        { orphanedCount: totalOrphaned, deletedCount: totalDeleted, reactivatedCount: totalReactivated, preservedCount: totalPreserved },
        'Orphaned records cleanup summary'
      );
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
      // Log individual change types at info level when there are changes
      if (this.stats.created > 0) {
        this.logger.info({ count: this.stats.created }, 'DNS records created');
      }
      if (this.stats.updated > 0) {
        this.logger.info({ count: this.stats.updated }, 'DNS records updated');
      }
      if (this.stats.errors > 0) {
        this.logger.warn({ count: this.stats.errors }, 'DNS record errors');
      }
    } else {
      // Log summary at info level when everything is in sync (but only on first sync or periodically)
      this.logger.debug(
        {
          total: this.stats.total,
          upToDate: this.stats.upToDate,
          skipped: this.stats.skipped,
        },
        'DNS sync complete - all records in sync'
      );
    }
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
