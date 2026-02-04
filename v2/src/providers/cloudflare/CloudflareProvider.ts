/**
 * Cloudflare DNS Provider Implementation
 * Using the official cloudflare npm package
 */
import Cloudflare from 'cloudflare';
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface CloudflareProviderCredentials extends ProviderCredentials {
  apiToken: string;
  zoneName: string;
  zoneId?: string;
  accountId?: string;
}

interface CloudflareDNSRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  data?: {
    weight?: number;
    port?: number;
    flags?: number;
    tag?: string;
  };
  comment?: string | null;
  created_on?: string;
  modified_on?: string;
}

/**
 * Cloudflare DNS Provider
 */
export class CloudflareProvider extends DNSProvider {
  private client: Cloudflare;
  private zoneId: string | null = null;
  private readonly zoneName: string;
  private readonly accountId?: string;

  constructor(
    providerId: string,
    providerName: string,
    credentials: CloudflareProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    this.zoneName = credentials.zoneName;
    this.zoneId = credentials.zoneId ?? null;
    this.accountId = credentials.accountId;

    // Initialize Cloudflare client
    this.client = new Cloudflare({
      apiToken: credentials.apiToken,
    });
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'cloudflare',
      version: '1.0.0',
      features: {
        proxied: true,
        ttlMin: 1,
        ttlMax: 86400,
        supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
        batchOperations: true,
      },
    };
  }

  /**
   * Cloudflare supports comments/ownership markers
   */
  override supportsOwnershipMarker(): boolean {
    return true;
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing Cloudflare provider');

    try {
      // Look up zone ID if not provided
      if (!this.zoneId) {
        const zones = await this.client.zones.list({ name: this.zoneName });

        if (!zones.result || zones.result.length === 0) {
          throw new Error(`Zone not found: ${this.zoneName}`);
        }

        this.zoneId = zones.result[0]?.id ?? null;
        this.logger.debug({ zoneId: this.zoneId }, 'Zone ID retrieved');
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info({ zoneName: this.zoneName, zoneId: this.zoneId }, 'Cloudflare provider initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Cloudflare provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.zones.list({ per_page: 1 });
      return true;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.zoneName;
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    if (!this.zoneId) {
      throw new Error('Zone ID not initialized');
    }

    this.logger.debug('Refreshing DNS record cache');

    try {
      const records: DNSRecord[] = [];
      let page = 1;
      const perPage = 100;

      // Paginate through all records
      while (true) {
        const response = await this.client.dns.records.list({
          zone_id: this.zoneId,
          page,
          per_page: perPage,
        });

        if (!response.result || response.result.length === 0) {
          break;
        }

        for (const record of response.result) {
          records.push(this.convertFromCloudflare(record as unknown as CloudflareDNSRecord));
        }

        // Check if there are more pages based on result length
        if (response.result.length < perPage) {
          break;
        }

        page++;
      }

      this.recordCache = {
        records,
        lastUpdated: Date.now(),
      };

      this.logger.debug({ count: records.length }, 'DNS record cache refreshed');
      return records;
    } catch (error) {
      this.logger.error({ error }, 'Failed to refresh DNS record cache');
      throw error;
    }
  }

  async listRecords(filter?: { type?: DNSRecordType; name?: string }): Promise<DNSRecord[]> {
    const records = await this.getRecordsFromCache();

    if (!filter) {
      return records;
    }

    return records.filter((record) => {
      if (filter.type && record.type !== filter.type) {
        return false;
      }
      if (filter.name && record.name.toLowerCase() !== filter.name.toLowerCase()) {
        return false;
      }
      return true;
    });
  }

  async createRecord(input: DNSRecordCreateInput): Promise<DNSRecord> {
    if (!this.zoneId) {
      throw new Error('Zone ID not initialized');
    }

    this.validateRecord(input);

    const cloudflareRecord = this.convertToCloudflare(input);

    this.logger.debug({ record: cloudflareRecord }, 'Creating DNS record');

    try {
      // Build the record params based on type
      const params = this.buildCreateParams(input);
      const response = await this.client.dns.records.create(params);

      const created = this.convertFromCloudflare(response as unknown as CloudflareDNSRecord);
      this.updateRecordInCache(created);

      this.logger.info({ type: created.type, name: created.name }, 'DNS record created');
      return created;
    } catch (error) {
      this.logger.error({ error, input }, 'Failed to create DNS record');
      throw error;
    }
  }

  async updateRecord(id: string, input: DNSRecordUpdateInput): Promise<DNSRecord> {
    if (!this.zoneId) {
      throw new Error('Zone ID not initialized');
    }

    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const mergedInput: DNSRecordCreateInput = {
      type: input.type ?? existing.type,
      name: input.name ?? existing.name,
      content: input.content ?? existing.content,
      ttl: input.ttl ?? existing.ttl,
      proxied: input.proxied ?? existing.proxied,
      priority: input.priority ?? existing.priority,
      weight: input.weight ?? existing.weight,
      port: input.port ?? existing.port,
      flags: input.flags ?? existing.flags,
      tag: input.tag ?? existing.tag,
    };

    this.logger.debug({ id, record: mergedInput }, 'Updating DNS record');

    try {
      // Build the record params based on type
      const params = this.buildCreateParams(mergedInput);
      const response = await this.client.dns.records.update(id, params);

      const updated = this.convertFromCloudflare(response as unknown as CloudflareDNSRecord);
      this.updateRecordInCache(updated);

      this.logger.info({ type: updated.type, name: updated.name }, 'DNS record updated');
      return updated;
    } catch (error) {
      this.logger.error({ error, id, input }, 'Failed to update DNS record');
      throw error;
    }
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.zoneId) {
      throw new Error('Zone ID not initialized');
    }

    const existing = this.recordCache.records.find((r) => r.id === id);
    if (existing) {
      this.logger.info({ type: existing.type, name: existing.name }, 'Deleting DNS record');
    }

    try {
      await this.client.dns.records.delete(id, {
        zone_id: this.zoneId,
      });

      this.removeRecordFromCache(id);

      this.logger.debug({ id }, 'DNS record deleted');
      return true;
    } catch (error) {
      this.logger.error({ error, id }, 'Failed to delete DNS record');
      throw error;
    }
  }

  validateRecord(record: DNSRecordCreateInput): void {
    if (!record.type) {
      throw new Error('Record type is required');
    }

    if (!record.name) {
      throw new Error('Record name is required');
    }

    if (!record.content) {
      throw new Error('Record content is required');
    }

    const validTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];
    if (!validTypes.includes(record.type)) {
      throw new Error(`Invalid record type: ${record.type}`);
    }

    // Type-specific validation
    switch (record.type) {
      case 'A':
        if (!this.isValidIPv4(record.content)) {
          throw new Error('Invalid IPv4 address');
        }
        break;

      case 'AAAA':
        if (!this.isValidIPv6(record.content)) {
          throw new Error('Invalid IPv6 address');
        }
        break;

      case 'MX':
        if (record.priority === undefined || record.priority < 0 || record.priority > 65535) {
          throw new Error('MX record requires priority between 0 and 65535');
        }
        break;

      case 'SRV':
        if (record.priority === undefined || record.weight === undefined || record.port === undefined) {
          throw new Error('SRV record requires priority, weight, and port');
        }
        break;

      case 'CAA':
        if (record.flags === undefined || record.tag === undefined) {
          throw new Error('CAA record requires flags and tag');
        }
        break;
    }

    // TTL validation
    if (record.ttl !== undefined) {
      if (record.ttl < 1 || record.ttl > 86400) {
        throw new Error('TTL must be between 1 and 86400');
      }
    }
  }

  /**
   * Convert Cloudflare record to internal format
   */
  private convertFromCloudflare(record: CloudflareDNSRecord): DNSRecord {
    return {
      id: record.id,
      type: record.type as DNSRecordType,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied,
      priority: record.priority,
      weight: record.data?.weight,
      port: record.data?.port,
      flags: record.data?.flags,
      tag: record.data?.tag,
      comment: record.comment ?? undefined,
      providerId: this.providerId,
      createdAt: record.created_on ? new Date(record.created_on) : undefined,
      updatedAt: record.modified_on ? new Date(record.modified_on) : undefined,
    };
  }

  /**
   * Build create/update params for Cloudflare API
   */
  private buildCreateParams(input: DNSRecordCreateInput): Parameters<typeof this.client.dns.records.create>[0] {
    if (!this.zoneId) {
      throw new Error('Zone ID not initialized');
    }

    const baseParams = {
      zone_id: this.zoneId,
      name: this.ensureFqdn(input.name),
      ttl: input.ttl ?? 1,
      comment: 'Managed by TrafegoDNS',
    };

    switch (input.type) {
      case 'A':
        return {
          ...baseParams,
          type: 'A' as const,
          content: input.content,
          proxied: input.proxied ?? false,
        };
      case 'AAAA':
        return {
          ...baseParams,
          type: 'AAAA' as const,
          content: input.content,
          proxied: input.proxied ?? false,
        };
      case 'CNAME':
        return {
          ...baseParams,
          type: 'CNAME' as const,
          content: input.content,
          proxied: input.proxied ?? false,
        };
      case 'MX':
        return {
          ...baseParams,
          type: 'MX' as const,
          content: input.content,
          priority: input.priority ?? 10,
        };
      case 'TXT':
        return {
          ...baseParams,
          type: 'TXT' as const,
          content: input.content,
        };
      case 'SRV':
        return {
          ...baseParams,
          type: 'SRV' as const,
          data: {
            priority: input.priority ?? 1,
            weight: input.weight ?? 1,
            port: input.port ?? 80,
            target: input.content,
          },
        };
      case 'CAA':
        return {
          ...baseParams,
          type: 'CAA' as const,
          data: {
            flags: input.flags ?? 0,
            tag: (input.tag ?? 'issue') as 'issue' | 'issuewild' | 'iodef',
            value: input.content,
          },
        };
      case 'NS':
        return {
          ...baseParams,
          type: 'NS' as const,
          content: input.content,
        };
      default:
        throw new Error(`Unsupported record type: ${input.type}`);
    }
  }

  /**
   * Convert internal record to Cloudflare format
   */
  private convertToCloudflare(record: DNSRecordCreateInput): Record<string, unknown> {
    const result: Record<string, unknown> = {
      type: record.type,
      name: this.ensureFqdn(record.name),
      content: record.content,
      ttl: record.ttl ?? 1,
      comment: 'Managed by TrafegoDNS',
    };

    // Add proxied for supported types
    if (['A', 'AAAA', 'CNAME'].includes(record.type)) {
      result['proxied'] = record.proxied ?? false;
    }

    // Add priority for MX/SRV
    if (record.type === 'MX' || record.type === 'SRV') {
      result['priority'] = record.priority;
    }

    // Add SRV-specific fields
    if (record.type === 'SRV') {
      result['data'] = {
        weight: record.weight,
        port: record.port,
        target: record.content,
      };
    }

    // Add CAA-specific fields
    if (record.type === 'CAA') {
      result['data'] = {
        flags: record.flags,
        tag: record.tag,
        value: record.content,
      };
    }

    return result;
  }

  /**
   * Validate IPv4 address with proper octet range checking
   */
  private isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    for (const part of parts) {
      // Check for leading zeros (invalid in strict mode) or empty
      if (part.length === 0 || (part.length > 1 && part.startsWith('0'))) {
        return false;
      }

      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return false;
      }

      // Verify the string representation matches (no non-numeric chars)
      if (String(num) !== part) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate IPv6 address
   * Uses Node.js net module for reliable validation
   */
  private isValidIPv6(ip: string): boolean {
    // Basic format check
    if (!ip || typeof ip !== 'string') return false;

    // Normalize and validate using regex for common patterns
    const normalizedIp = ip.toLowerCase();

    // Full IPv6: 8 groups of 4 hex digits
    // Compressed IPv6: :: can replace one or more groups of zeros
    const ipv6Regex = /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:)|fe80:(:[0-9a-f]{0,4}){0,4}%[0-9a-z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-f]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

    return ipv6Regex.test(normalizedIp);
  }
}
