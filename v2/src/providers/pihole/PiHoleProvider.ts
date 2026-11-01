/**
 * Pi-hole v6 DNS Provider Implementation
 * Manages local DNS records (A/AAAA) and CNAME records via Pi-hole v6's REST API
 * Uses session-based authentication with SID tokens
 */
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface PiHoleProviderCredentials extends ProviderCredentials {
  url: string;
  password: string;
  domain?: string; // Optional domain filter
}

/**
 * Pi-hole v6 DNS Provider
 *
 * Pi-hole v6 manages two types of local DNS entries:
 * - Local DNS Records (A/AAAA): stored as "IP hostname" strings at /api/config/dns/hosts
 * - Local CNAME Records: stored as "hostname,target" strings at /api/config/dns/cnameRecords
 *
 * There is no zone concept — all records are global. An optional domain filter
 * can be used to limit which records TrafegoDNS manages.
 *
 * Pi-hole does not expose TTL for local DNS records and does not support
 * ownership markers (comments).
 */
export class PiHoleProvider extends DNSProvider {
  private readonly baseUrl: string;
  private readonly password: string;
  private readonly domain: string;
  private sid: string | null = null;
  private sessionExpiry: number = 0;

  constructor(
    providerId: string,
    providerName: string,
    credentials: PiHoleProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    // Normalize URL - add http:// if no protocol specified, strip trailing slash
    let url = credentials.url.trim();
    if (!url.match(/^https?:\/\//i)) {
      url = `http://${url}`;
    }
    this.baseUrl = url.replace(/\/$/, '');

    this.password = credentials.password;
    this.domain = credentials.domain ?? '';

    if (!this.password) {
      throw new Error('Pi-hole password is required');
    }
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'pihole',
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
   * Pi-hole local DNS does not support comments/ownership markers
   */
  override supportsOwnershipMarker(): boolean {
    return false;
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing Pi-hole provider');

    try {
      // Authenticate and test connection
      await this.authenticate();

      // Verify connectivity by fetching version info
      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/api/info/version`, { headers });

      if (!response.ok) {
        throw new Error(`Failed to connect to Pi-hole: HTTP ${response.status}`);
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info(
        { domain: this.domain || 'all' },
        'Pi-hole provider initialized'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Pi-hole provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();

      const headers = await this.getAuthHeaders();
      const response = await fetch(`${this.baseUrl}/api/info/version`, { headers });

      return response.ok;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.domain || 'all';
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.logger.debug('Refreshing DNS record cache');

    try {
      const headers = await this.getAuthHeaders();
      const records: DNSRecord[] = [];

      // Fetch local DNS records (A/AAAA)
      const hostsResponse = await fetch(`${this.baseUrl}/api/config/dns/hosts`, { headers });
      if (!hostsResponse.ok) {
        throw new Error(`Failed to fetch DNS hosts: HTTP ${hostsResponse.status}`);
      }
      const hostsData = await hostsResponse.json() as { config?: { dns?: { hosts?: string[] } } };
      const hostEntries = hostsData?.config?.dns?.hosts ?? [];

      for (const entry of hostEntries) {
        const parsed = this.parseHostEntry(entry);
        if (!parsed) continue;

        // Apply domain filter if set
        if (this.domain && !parsed.hostname.toLowerCase().endsWith(`.${this.domain.toLowerCase()}`) &&
            parsed.hostname.toLowerCase() !== this.domain.toLowerCase()) {
          continue;
        }

        const type: DNSRecordType = this.isIPv6(parsed.ip) ? 'AAAA' : 'A';
        const id = Buffer.from(`${parsed.hostname}:${type}:${parsed.ip}`).toString('base64');

        records.push({
          id,
          type,
          name: parsed.hostname,
          content: parsed.ip,
          ttl: 0,
          providerId: this.providerId,
        });
      }

      // Fetch local CNAME records
      const cnameResponse = await fetch(`${this.baseUrl}/api/config/dns/cnameRecords`, { headers });
      if (!cnameResponse.ok) {
        throw new Error(`Failed to fetch CNAME records: HTTP ${cnameResponse.status}`);
      }
      const cnameData = await cnameResponse.json() as { config?: { dns?: { cnameRecords?: string[] } } };
      const cnameEntries = cnameData?.config?.dns?.cnameRecords ?? [];

      for (const entry of cnameEntries) {
        const parsed = this.parseCnameEntry(entry);
        if (!parsed) continue;

        // Apply domain filter if set
        if (this.domain && !parsed.hostname.toLowerCase().endsWith(`.${this.domain.toLowerCase()}`) &&
            parsed.hostname.toLowerCase() !== this.domain.toLowerCase()) {
          continue;
        }

        const id = Buffer.from(`${parsed.hostname}:CNAME:${parsed.target}`).toString('base64');

        records.push({
          id,
          type: 'CNAME',
          name: parsed.hostname,
          content: parsed.target,
          ttl: 0,
          providerId: this.providerId,
        });
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

    const headers = await this.getAuthHeaders();

    this.logger.debug({ name: input.name, type: input.type, content: input.content }, 'Creating DNS record');

    try {
      if (input.type === 'CNAME') {
        // CNAME records: "hostname,target"
        const entry = `${input.name},${input.content}`;
        const encodedEntry = encodeURIComponent(entry);
        const response = await fetch(
          `${this.baseUrl}/api/config/dns/cnameRecords/${encodedEntry}`,
          { method: 'PUT', headers }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to create CNAME record: HTTP ${response.status} - ${errorBody}`);
        }
      } else {
        // A/AAAA records: "content name" (IP first, then hostname)
        const entry = `${input.content} ${input.name}`;
        const encodedEntry = encodeURIComponent(entry);
        const response = await fetch(
          `${this.baseUrl}/api/config/dns/hosts/${encodedEntry}`,
          { method: 'PUT', headers }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to create ${input.type} record: HTTP ${response.status} - ${errorBody}`);
        }
      }

      // Refresh cache and find the new record
      await this.refreshRecordCache();

      const id = Buffer.from(`${input.name}:${input.type}:${input.content}`).toString('base64');
      const created = this.recordCache.records.find((r) => r.id === id);

      if (!created) {
        this.logger.warn(
          {
            searchedName: input.name,
            searchedType: input.type,
            cacheSize: this.recordCache.records.length,
          },
          'Record created but not found in cache'
        );
        throw new Error('Record created but not found in cache');
      }

      this.logger.info({ type: input.type, name: input.name }, 'DNS record created');
      return created;
    } catch (error) {
      this.logger.error({ error, input }, 'Failed to create DNS record');
      throw error;
    }
  }

  async updateRecord(id: string, input: DNSRecordUpdateInput): Promise<DNSRecord> {
    // Pi-hole doesn't have a direct update API, so we delete and recreate
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

    // Delete old record
    await this.deleteRecordByDetails(existing);

    // Create new record
    return this.createRecord(mergedInput);
  }

  async deleteRecord(id: string): Promise<boolean> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    return this.deleteRecordByDetails(existing);
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
      throw new Error(`Invalid record type for Pi-hole: ${record.type}. Only A, AAAA, and CNAME are supported`);
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
        if (!/^[a-zA-Z0-9._-]+$/.test(record.content)) {
          throw new Error('Invalid CNAME target');
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Authenticate with Pi-hole v6 and obtain a session SID
   */
  private async authenticate(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: this.password }),
    });

    if (!response.ok) {
      throw new Error(`Pi-hole authentication request failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      session?: {
        valid?: boolean;
        sid?: string;
        validity?: number;
        totp?: boolean;
      };
    };

    if (!data.session?.valid || !data.session?.sid) {
      throw new Error('Pi-hole authentication failed: invalid credentials');
    }

    this.sid = data.session.sid;
    // Refresh 30 seconds before actual expiry to avoid edge-case failures
    this.sessionExpiry = Date.now() + (data.session.validity ?? 300) * 1000 - 30000;

    this.logger.debug('Pi-hole session authenticated');
  }

  /**
   * Return auth headers, re-authenticating if the session has expired
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.sid || Date.now() >= this.sessionExpiry) {
      await this.authenticate();
    }
    return { 'X-FTL-SID': this.sid! };
  }

  /**
   * Delete a record using its details (type determines which API endpoint to call)
   */
  private async deleteRecordByDetails(record: DNSRecord): Promise<boolean> {
    const headers = await this.getAuthHeaders();

    this.logger.debug({ name: record.name, type: record.type }, 'Deleting DNS record');

    try {
      if (record.type === 'CNAME') {
        // CNAME records: "hostname,target"
        const entry = `${record.name},${record.content}`;
        const encodedEntry = encodeURIComponent(entry);
        const response = await fetch(
          `${this.baseUrl}/api/config/dns/cnameRecords/${encodedEntry}`,
          { method: 'DELETE', headers }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to delete CNAME record: HTTP ${response.status} - ${errorBody}`);
        }
      } else {
        // A/AAAA records: "content name" (IP first, then hostname)
        const entry = `${record.content} ${record.name}`;
        const encodedEntry = encodeURIComponent(entry);
        const response = await fetch(
          `${this.baseUrl}/api/config/dns/hosts/${encodedEntry}`,
          { method: 'DELETE', headers }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to delete ${record.type} record: HTTP ${response.status} - ${errorBody}`);
        }
      }

      this.removeRecordFromCache(record.id!);

      this.logger.info({ type: record.type, name: record.name }, 'DNS record deleted');
      return true;
    } catch (error) {
      this.logger.error({ error, record }, 'Failed to delete DNS record');
      throw error;
    }
  }

  /**
   * Parse a host entry string from Pi-hole's /api/config/dns/hosts
   * Format: "IP hostname" (e.g., "192.168.1.100 myhost.local")
   */
  private parseHostEntry(entry: string): { ip: string; hostname: string } | null {
    const parts = entry.trim().split(/\s+/);
    if (parts.length < 2) return null;
    return { ip: parts[0]!, hostname: parts[1]! };
  }

  /**
   * Parse a CNAME entry string from Pi-hole's /api/config/dns/cnameRecords
   * Format: "hostname,target" (e.g., "alias.local,real.local")
   */
  private parseCnameEntry(entry: string): { hostname: string; target: string } | null {
    const parts = entry.trim().split(',');
    if (parts.length < 2) return null;
    return { hostname: parts[0]!, target: parts[1]! };
  }

  /**
   * Check whether an IP address is IPv6
   */
  private isIPv6(ip: string): boolean {
    return ip.includes(':');
  }
}
