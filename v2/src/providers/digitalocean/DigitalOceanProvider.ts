/**
 * DigitalOcean DNS Provider Implementation
 */
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType } from '../../types/index.js';

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
    options: { cacheRefreshInterval?: number } = {}
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
    this.validateRecord(input);

    const doRecord = this.convertToDigitalOcean(input);

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
      this.logger.error({ error, input }, 'Failed to create DNS record');
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

    const doRecord = this.convertToDigitalOcean(mergedInput);

    this.logger.debug({ id, record: doRecord }, 'Updating DNS record');

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
      this.logger.error({ error, id, input }, 'Failed to update DNS record');
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

    // TTL validation (DigitalOcean minimum is 30)
    if (record.ttl !== undefined) {
      if (record.ttl < 30 || record.ttl > 86400) {
        throw new Error('TTL must be between 30 and 86400');
      }
    }
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
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error((error as { message?: string }).message ?? `API error: ${response.status}`);
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

    return {
      id: String(record.id),
      type,
      name,
      content: record.data,
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

    const result: Record<string, unknown> = {
      type: record.type,
      name,
      data: record.content,
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
