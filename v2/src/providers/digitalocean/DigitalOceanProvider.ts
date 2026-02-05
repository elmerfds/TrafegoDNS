/**
 * DigitalOcean DNS Provider Implementation
 */
import { DNSProvider, type ProviderCredentials, type ProviderInfo, type BatchResult } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface DigitalOceanProviderCredentials extends ProviderCredentials {
  apiToken: string;
  domain: string;
}

interface DODNSRecord {
  id: number;
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
  flags?: number;
  tag?: string;
}

interface DOResponse<T> {
  domain_records?: T[];
  domain_record?: T;
  message?: string;
}

/**
 * DigitalOcean DNS Provider
 */
export class DigitalOceanProvider extends DNSProvider {
  private readonly apiToken: string;
  private readonly domain: string;
  private readonly baseUrl = 'https://api.digitalocean.com/v2';

  constructor(
    providerId: string,
    providerName: string,
    credentials: DigitalOceanProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    this.apiToken = credentials.apiToken;
    this.domain = credentials.domain;
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'digitalocean',
      version: '1.0.0',
      features: {
        proxied: false,
        ttlMin: 30,
        ttlMax: 86400,
        supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
        batchOperations: false,
      },
    };
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing DigitalOcean provider');

    try {
      // Verify domain exists
      const response = await this.makeRequest(`/domains/${this.domain}`);

      if (!response.domain) {
        throw new Error(`Domain not found: ${this.domain}`);
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info({ domain: this.domain }, 'DigitalOcean provider initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize DigitalOcean provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/domains', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.domain;
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.logger.debug('Refreshing DNS record cache');

    try {
      const records: DNSRecord[] = [];
      let page = 1;
      const perPage = 100;

      while (true) {
        const response = await this.makeRequest(
          `/domains/${this.domain}/records?page=${page}&per_page=${perPage}`
        );

        if (!response.domain_records || response.domain_records.length === 0) {
          break;
        }

        for (const record of response.domain_records) {
          const converted = this.convertFromDigitalOcean(record);
          if (converted) {
            records.push(converted);
          }
        }

        if (response.domain_records.length < perPage) {
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
    // Normalize TTL for DigitalOcean (minimum 30 seconds)
    const normalizedInput = this.normalizeTTL(input);
    this.validateRecord(normalizedInput);

    const doRecord = this.convertToDigitalOcean(normalizedInput);

    this.logger.debug({ record: doRecord }, 'Creating DNS record');

    try {
      const response = await this.makeRequest(`/domains/${this.domain}/records`, {
        method: 'POST',
        body: JSON.stringify(doRecord),
      });

      if (!response.domain_record) {
        throw new Error('Failed to create record');
      }

      const created = this.convertFromDigitalOcean(response.domain_record);
      if (!created) {
        throw new Error('Failed to convert created record');
      }

      this.updateRecordInCache(created);

      this.logger.info({ type: created.type, name: created.name }, 'DNS record created');
      return created;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ input }, `Failed to create DNS record: ${errorMessage}`);
      throw error;
    }
  }

  async updateRecord(id: string, input: DNSRecordUpdateInput): Promise<DNSRecord> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const mergedInput: DNSRecordCreateInput = {
      type: input.type ?? existing.type,
      name: input.name ?? existing.name,
      content: input.content ?? existing.content,
      ttl: input.ttl ?? existing.ttl,
      priority: input.priority ?? existing.priority,
      weight: input.weight ?? existing.weight,
      port: input.port ?? existing.port,
      flags: input.flags ?? existing.flags,
      tag: input.tag ?? existing.tag,
    };

    // Normalize TTL for DigitalOcean (minimum 30 seconds)
    const normalizedInput = this.normalizeTTL(mergedInput);
    const doRecord = this.convertToDigitalOcean(normalizedInput);

    this.logger.debug({
      id,
      existing: { type: existing.type, name: existing.name, content: existing.content },
      sending: doRecord
    }, 'Updating DNS record');

    try {
      const response = await this.makeRequest(`/domains/${this.domain}/records/${id}`, {
        method: 'PUT',
        body: JSON.stringify(doRecord),
      });

      if (!response.domain_record) {
        throw new Error('Failed to update record');
      }

      const updated = this.convertFromDigitalOcean(response.domain_record);
      if (!updated) {
        throw new Error('Failed to convert updated record');
      }

      this.updateRecordInCache(updated);

      this.logger.info({ type: updated.type, name: updated.name }, 'DNS record updated');
      return updated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ id, input }, `Failed to update DNS record: ${errorMessage}`);
      throw error;
    }
  }

  async deleteRecord(id: string): Promise<boolean> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (existing) {
      this.logger.info({ type: existing.type, name: existing.name }, 'Deleting DNS record');
    }

    try {
      await this.makeRequest(`/domains/${this.domain}/records/${id}`, {
        method: 'DELETE',
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
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(record.content)) {
          throw new Error('Invalid IPv4 address');
        }
        break;

      case 'AAAA':
        if (!/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(record.content)) {
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

    // Note: TTL validation is skipped here because normalization happens
    // in batchEnsureRecords override before validation
  }

  /**
   * Override batchEnsureRecords to normalize TTL values before validation
   * DigitalOcean requires TTL between 30-86400, but Cloudflare uses TTL=1 for "auto"
   */
  override async batchEnsureRecords(recordConfigs: DNSRecordCreateInput[]): Promise<BatchResult> {
    // Normalize TTL for all records before processing
    const normalizedConfigs = recordConfigs.map(config => this.normalizeTTL(config));
    return super.batchEnsureRecords(normalizedConfigs);
  }

  /**
   * Normalize TTL to DigitalOcean's valid range (30-86400)
   * Cloudflare uses TTL=1 for "auto", which is invalid for DigitalOcean
   */
  private normalizeTTL(input: DNSRecordCreateInput): DNSRecordCreateInput {
    const { ttlMin, ttlMax } = this.getInfo().features;
    let ttl = input.ttl;

    if (ttl === undefined || ttl < ttlMin) {
      // Use minimum valid TTL (30 for DigitalOcean)
      ttl = ttlMin;
      this.logger.debug({ originalTtl: input.ttl, normalizedTtl: ttl }, 'Normalized TTL to provider minimum');
    } else if (ttl > ttlMax) {
      ttl = ttlMax;
      this.logger.debug({ originalTtl: input.ttl, normalizedTtl: ttl }, 'Normalized TTL to provider maximum');
    }

    return { ...input, ttl };
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<DOResponse<DODNSRecord> & { domain?: { name: string } }> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: response.statusText }));
      const errorResponse = errorBody as { id?: string; message?: string; errors?: Record<string, string[]> };

      // Build detailed error message
      let errorMessage = errorResponse.message ?? `API error: ${response.status}`;

      // Include error ID if present (e.g., "bad_request", "unauthorized")
      if (errorResponse.id) {
        errorMessage = `[${errorResponse.id}] ${errorMessage}`;
      }

      // Include field-specific errors if present
      if (errorResponse.errors) {
        const fieldErrors = Object.entries(errorResponse.errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        if (fieldErrors) {
          errorMessage += ` (${fieldErrors})`;
        }
      }

      // Log the full error details
      this.logger.debug({
        status: response.status,
        endpoint,
        errorBody
      }, 'DigitalOcean API error response');

      throw new Error(errorMessage);
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return {};
    }

    return response.json() as Promise<DOResponse<DODNSRecord> & { domain?: { name: string } }>;
  }

  /**
   * Convert DigitalOcean record to internal format
   */
  private convertFromDigitalOcean(record: DODNSRecord): DNSRecord | null {
    const type = record.type.toUpperCase() as DNSRecordType;
    const validTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];

    if (!validTypes.includes(type)) {
      return null;
    }

    // Convert name - DigitalOcean uses @ for apex
    let name = record.name;
    if (name === '@') {
      name = this.domain;
    } else if (!name.endsWith(this.domain)) {
      name = `${name}.${this.domain}`;
    }

    // DigitalOcean returns FQDN data with trailing dots - strip them for internal consistency
    let content = record.data;
    const hostnameRecordTypes = ['CNAME', 'NS', 'MX', 'SRV'];
    if (hostnameRecordTypes.includes(type) && content && content.endsWith('.')) {
      content = content.slice(0, -1);
    }

    return {
      id: String(record.id),
      type,
      name,
      content,
      ttl: record.ttl,
      priority: record.priority,
      weight: record.weight,
      port: record.port,
      flags: record.flags,
      tag: record.tag,
      providerId: this.providerId,
    };
  }

  /**
   * Convert internal record to DigitalOcean format
   */
  private convertToDigitalOcean(record: DNSRecordCreateInput): Record<string, unknown> {
    // Convert name - DigitalOcean expects @ for apex or subdomain only
    let name = record.name;
    const fqdn = this.ensureFqdn(record.name);

    if (fqdn === this.domain) {
      name = '@';
    } else if (fqdn.endsWith(`.${this.domain}`)) {
      name = fqdn.slice(0, -(this.domain.length + 1));
    }

    // DigitalOcean requires FQDN data values (hostnames) to end with a trailing dot
    let data = record.content;
    const hostnameRecordTypes = ['CNAME', 'NS', 'MX', 'SRV'];
    if (hostnameRecordTypes.includes(record.type) && data && !data.endsWith('.')) {
      data = data + '.';
      this.logger.debug({ type: record.type, original: record.content, normalized: data }, 'Added trailing dot to FQDN data');
    }

    const result: Record<string, unknown> = {
      type: record.type,
      name,
      data,
      ttl: record.ttl ?? 30,
    };

    // Add priority for MX/SRV
    if (record.type === 'MX' || record.type === 'SRV') {
      result['priority'] = record.priority ?? 10;
    }

    // Add SRV-specific fields
    if (record.type === 'SRV') {
      result['weight'] = record.weight ?? 1;
      result['port'] = record.port ?? 80;
    }

    // Add CAA-specific fields
    if (record.type === 'CAA') {
      result['flags'] = record.flags ?? 0;
      result['tag'] = record.tag ?? 'issue';
    }

    return result;
  }
}
