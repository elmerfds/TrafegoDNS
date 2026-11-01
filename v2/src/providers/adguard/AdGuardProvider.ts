/**
 * AdGuard Home DNS Provider Implementation
 * Manages DNS records via AdGuard Home's rewrite API using HTTP Basic Auth
 */
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface AdGuardProviderCredentials extends ProviderCredentials {
  url: string;
  username: string;
  password: string;
  domain?: string; // Optional domain filter (e.g., "example.com")
}

interface AdGuardRewriteEntry {
  domain: string;
  answer: string;
}

/**
 * Detect DNS record type from an AdGuard rewrite answer value
 */
function detectRecordType(answer: string): DNSRecordType {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(answer)) return 'A';
  if (answer.includes(':')) return 'AAAA';
  return 'CNAME';
}

/**
 * AdGuard Home DNS Provider
 */
export class AdGuardProvider extends DNSProvider {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly domain?: string;

  constructor(
    providerId: string,
    providerName: string,
    credentials: AdGuardProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    // Normalize URL - add http:// if no protocol specified
    let url = credentials.url.trim();
    if (!url.match(/^https?:\/\//i)) {
      url = `http://${url}`;
    }
    this.baseUrl = url.replace(/\/$/, '');

    this.username = credentials.username;
    this.password = credentials.password;
    this.domain = credentials.domain?.trim() || undefined;

    // Validate credentials
    if (!this.username) {
      throw new Error('AdGuard Home username is required');
    }
    if (!this.password) {
      throw new Error('AdGuard Home password is required');
    }
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'adguard',
      version: '1.0.0',
      features: {
        proxied: false,
        ttlMin: 0,
        ttlMax: 0,
        supportedTypes: ['A', 'AAAA', 'CNAME'],
        batchOperations: false,
      },
    };
  }

  /**
   * AdGuard Home rewrites do not support comments/ownership markers
   */
  override supportsOwnershipMarker(): boolean {
    return false;
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing AdGuard Home provider');

    try {
      // Test connection
      const connected = await this.testConnection();
      if (!connected) {
        throw new Error('Failed to connect to AdGuard Home');
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info(
        { domain: this.domain ?? 'all' },
        'AdGuard Home provider initialized'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize AdGuard Home provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/control/status`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.domain ?? 'all';
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.logger.debug('Refreshing DNS record cache');

    try {
      const response = await fetch(`${this.baseUrl}/control/rewrite/list`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list rewrites: ${response.status} ${errorText}`);
      }

      const rewrites = (await response.json()) as AdGuardRewriteEntry[];

      const records: DNSRecord[] = [];
      for (const entry of rewrites) {
        // Filter by domain if configured
        if (this.domain && !entry.domain.toLowerCase().endsWith(`.${this.domain.toLowerCase()}`) && entry.domain.toLowerCase() !== this.domain.toLowerCase()) {
          continue;
        }

        const converted = this.convertFromAdGuard(entry);
        if (converted) {
          records.push(converted);
        }
      }

      this.recordCache = {
        records,
        lastUpdated: Date.now(),
      };

      this.logger.debug(
        {
          count: records.length,
          types: [...new Set(records.map(r => r.type))],
          sampleNames: records.slice(0, 5).map(r => r.name),
        },
        'DNS record cache refreshed'
      );
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

    const body: AdGuardRewriteEntry = {
      domain: input.name,
      answer: input.content,
    };

    this.logger.debug({ name: input.name, type: input.type }, 'Creating DNS rewrite');

    try {
      const response = await fetch(`${this.baseUrl}/control/rewrite/add`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create rewrite: ${response.status} ${errorText}`);
      }

      // Refresh cache and find the new record
      await this.refreshRecordCache();

      const created = this.recordCache.records.find(
        (r) =>
          r.name.toLowerCase() === input.name.toLowerCase() &&
          r.content === input.content
      );

      if (!created) {
        this.logger.warn(
          {
            searchedName: input.name,
            searchedType: input.type,
            cacheSize: this.recordCache.records.length,
          },
          'Rewrite created but not found in cache'
        );
        throw new Error('Rewrite created but not found in cache');
      }

      this.logger.info({ type: input.type, name: input.name }, 'DNS rewrite created');
      return created;
    } catch (error) {
      this.logger.error({ error, input }, 'Failed to create DNS rewrite');
      throw error;
    }
  }

  async updateRecord(id: string, input: DNSRecordUpdateInput): Promise<DNSRecord> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const target: AdGuardRewriteEntry = {
      domain: existing.name,
      answer: existing.content,
    };

    const update: AdGuardRewriteEntry = {
      domain: input.name ?? existing.name,
      answer: input.content ?? existing.content,
    };

    this.logger.debug(
      { target, update },
      'Updating DNS rewrite'
    );

    try {
      const response = await fetch(`${this.baseUrl}/control/rewrite/update`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ target, update }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update rewrite: ${response.status} ${errorText}`);
      }

      // Refresh cache and find the updated record
      await this.refreshRecordCache();

      const updated = this.recordCache.records.find(
        (r) =>
          r.name.toLowerCase() === update.domain.toLowerCase() &&
          r.content === update.answer
      );

      if (!updated) {
        throw new Error('Rewrite updated but not found in cache');
      }

      this.logger.info({ type: updated.type, name: updated.name }, 'DNS rewrite updated');
      return updated;
    } catch (error) {
      this.logger.error({ error, id }, 'Failed to update DNS rewrite');
      throw error;
    }
  }

  async deleteRecord(id: string): Promise<boolean> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const body: AdGuardRewriteEntry = {
      domain: existing.name,
      answer: existing.content,
    };

    this.logger.debug({ name: existing.name, type: existing.type }, 'Deleting DNS rewrite');

    try {
      const response = await fetch(`${this.baseUrl}/control/rewrite/delete`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete rewrite: ${response.status} ${errorText}`);
      }

      this.removeRecordFromCache(id);

      this.logger.info({ type: existing.type, name: existing.name }, 'DNS rewrite deleted');
      return true;
    } catch (error) {
      this.logger.error({ error, id }, 'Failed to delete DNS rewrite');
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

    const validTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME'];
    if (!validTypes.includes(record.type)) {
      throw new Error(`Invalid record type for AdGuard Home: ${record.type}. Only A, AAAA, and CNAME are supported.`);
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

      case 'CNAME':
        // CNAME content should be a valid hostname
        if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.?$/.test(record.content)) {
          throw new Error('Invalid hostname for CNAME record');
        }
        break;
    }
  }

  /**
   * Get HTTP Basic Auth headers
   */
  private getAuthHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Convert an AdGuard rewrite entry to internal DNSRecord format
   */
  private convertFromAdGuard(entry: AdGuardRewriteEntry): DNSRecord | null {
    const type = detectRecordType(entry.answer);

    // Generate a unique ID from domain+type+answer
    const id = Buffer.from(`${entry.domain}:${type}:${entry.answer}`).toString('base64');

    return {
      id,
      type,
      name: entry.domain,
      content: entry.answer,
      ttl: 0,
      providerId: this.providerId,
    };
  }
}
