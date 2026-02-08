/**
 * Technitium DNS Server Provider Implementation
 * Supports both API token and session-based authentication
 */
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface TechnitiumProviderCredentials extends ProviderCredentials {
  url: string;
  authMethod: 'token' | 'session';
  apiToken?: string;
  username?: string;
  password?: string;
  zone: string;
}

interface TechnitiumRecord {
  name: string;
  type: string;
  ttl: number;
  rData: {
    ipAddress?: string;
    cname?: string;
    exchange?: string;
    preference?: number;
    text?: string;
    priority?: number;
    weight?: number;
    port?: number;
    target?: string;
    flags?: number;
    tag?: string;
    value?: string;
  };
  disabled: boolean;
  comments?: string;
}

interface TechnitiumResponse<T> {
  status: 'ok' | 'error';
  errorMessage?: string;
  response?: T;
}

/**
 * Technitium DNS Provider
 */
export class TechnitiumProvider extends DNSProvider {
  private readonly baseUrl: string;
  private readonly authMethod: 'token' | 'session';
  private readonly apiToken?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly zoneName: string;
  private sessionToken: string | null = null;
  private sessionExpiry: number = 0;

  constructor(
    providerId: string,
    providerName: string,
    credentials: TechnitiumProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    // Normalize URL - add http:// if no protocol specified
    let url = credentials.url.trim();
    if (!url.match(/^https?:\/\//i)) {
      url = `http://${url}`;
    }
    this.baseUrl = url.replace(/\/$/, '');

    // Auto-detect auth method if not specified
    // If apiToken is provided, use token auth; otherwise use session
    this.authMethod = credentials.authMethod ?? (credentials.apiToken ? 'token' : 'session');
    this.apiToken = credentials.apiToken;
    this.username = credentials.username;
    this.password = credentials.password;
    this.zoneName = credentials.zone;

    // Validate credentials based on auth method
    if (this.authMethod === 'token' && !this.apiToken) {
      throw new Error('API token required for token authentication');
    }
    if (this.authMethod === 'session' && (!this.username || !this.password)) {
      throw new Error('Username and password required for session authentication');
    }
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'technitium',
      version: '1.0.0',
      features: {
        proxied: false,
        ttlMin: 1,
        ttlMax: 604800,
        supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
        batchOperations: false,
      },
    };
  }

  /**
   * Technitium supports comments/ownership markers
   */
  override supportsOwnershipMarker(): boolean {
    return true;
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing Technitium provider');

    try {
      // Test connection and authenticate
      await this.authenticate();

      // Verify zone exists
      const zones = await this.listZones();
      const zoneExists = zones.some((z) => z.toLowerCase() === this.zoneName.toLowerCase());

      if (!zoneExists) {
        throw new Error(`Zone not found: ${this.zoneName}`);
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info({ zoneName: this.zoneName }, 'Technitium provider initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Technitium provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.zoneName;
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.logger.debug('Refreshing DNS record cache');

    try {
      const token = await this.getAuthToken();
      // Use listZone=true to get ALL records in the zone, not just the apex
      const url = `${this.baseUrl}/api/zones/records/get?token=${token}&domain=${this.zoneName}&zone=${this.zoneName}&listZone=true`;

      const response = await fetch(url);
      const data = (await response.json()) as TechnitiumResponse<{ records: TechnitiumRecord[] }>;

      if (data.status !== 'ok') {
        throw new Error(data.errorMessage ?? 'Failed to list records');
      }

      const records: DNSRecord[] = [];
      for (const record of data.response?.records ?? []) {
        const converted = this.convertFromTechnitium(record);
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
          sampleNames: records.slice(0, 5).map(r => r.name)
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

  /**
   * Override findRecordInCache to handle Technitium's name format
   * Technitium stores records with FQDN, so we need to check both formats
   */
  override findRecordInCache(type: DNSRecordType, name: string): DNSRecord | undefined {
    const normalizedName = name.toLowerCase();
    const fqdn = this.ensureFqdn(name).toLowerCase();
    const zone = this.zoneName.toLowerCase();

    return this.recordCache.records.find((record) => {
      if (record.type !== type) {
        return false;
      }

      const recordName = record.name.toLowerCase();

      // Exact match
      if (recordName === normalizedName || recordName === fqdn) {
        return true;
      }

      // Check if the record name without zone suffix matches
      const recordNameWithoutZone = recordName.endsWith(`.${zone}`)
        ? recordName.slice(0, -(zone.length + 1))
        : recordName;
      const searchNameWithoutZone = normalizedName.endsWith(`.${zone}`)
        ? normalizedName.slice(0, -(zone.length + 1))
        : normalizedName;

      return recordNameWithoutZone === searchNameWithoutZone;
    });
  }

  async createRecord(input: DNSRecordCreateInput): Promise<DNSRecord> {
    this.validateRecord(input);

    const token = await this.getAuthToken();
    const params = this.buildRecordParams(input);

    const url = `${this.baseUrl}/api/zones/records/add?token=${token}&zone=${this.zoneName}&${params}`;

    this.logger.debug({ name: input.name, type: input.type }, 'Creating DNS record');

    try {
      const response = await fetch(url, { method: 'POST' });
      const data = (await response.json()) as TechnitiumResponse<unknown>;

      if (data.status !== 'ok') {
        throw new Error(data.errorMessage ?? 'Failed to create record');
      }

      // Refresh cache and find the new record
      await this.refreshRecordCache();

      // Try to find the record with various name formats
      const fqdn = this.ensureFqdn(input.name);
      let created = this.findRecordInCache(input.type, fqdn);

      // If not found with FQDN, try the original name
      if (!created) {
        created = this.findRecordInCache(input.type, input.name);
      }

      // If still not found, search for any record matching content + type
      if (!created) {
        created = this.recordCache.records.find(
          (r) => r.type === input.type &&
                 r.content === input.content &&
                 (r.name.toLowerCase().includes(input.name.toLowerCase()) ||
                  input.name.toLowerCase().includes(r.name.toLowerCase().replace(`.${this.zoneName.toLowerCase()}`, '')))
        );
      }

      if (!created) {
        // Log what we have in cache for debugging
        this.logger.warn(
          {
            searchedName: fqdn,
            searchedType: input.type,
            cacheSize: this.recordCache.records.length,
            cachedNames: this.recordCache.records.filter(r => r.type === input.type).map(r => r.name).slice(0, 10)
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
    // Technitium doesn't have a direct update API, so we delete and recreate
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

  private async deleteRecordByDetails(record: DNSRecord): Promise<boolean> {
    const token = await this.getAuthToken();

    const params = new URLSearchParams({
      domain: record.name,
      type: record.type,
    });

    // Add type-specific parameters
    switch (record.type) {
      case 'A':
      case 'AAAA':
        params.set('ipAddress', record.content);
        break;
      case 'CNAME':
        params.set('cname', record.content);
        break;
      case 'MX':
        params.set('exchange', record.content);
        params.set('preference', String(record.priority ?? 10));
        break;
      case 'TXT':
        params.set('text', record.content);
        break;
      case 'SRV':
        params.set('target', record.content);
        params.set('priority', String(record.priority ?? 1));
        params.set('weight', String(record.weight ?? 1));
        params.set('port', String(record.port ?? 80));
        break;
      case 'CAA':
        params.set('flags', String(record.flags ?? 0));
        params.set('tag', record.tag ?? 'issue');
        params.set('value', record.content);
        break;
    }

    const url = `${this.baseUrl}/api/zones/records/delete?token=${token}&zone=${this.zoneName}&${params.toString()}`;

    this.logger.debug({ name: record.name, type: record.type }, 'Deleting DNS record');

    try {
      const response = await fetch(url, { method: 'POST' });
      const data = (await response.json()) as TechnitiumResponse<unknown>;

      if (data.status !== 'ok') {
        throw new Error(data.errorMessage ?? 'Failed to delete record');
      }

      this.removeRecordFromCache(record.id!);

      this.logger.info({ type: record.type, name: record.name }, 'DNS record deleted');
      return true;
    } catch (error) {
      this.logger.error({ error, record }, 'Failed to delete DNS record');
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
  }

  /**
   * Authenticate and get session token
   */
  private async authenticate(): Promise<void> {
    if (this.authMethod === 'token') {
      // API token doesn't need authentication
      return;
    }

    // Session authentication
    const url = `${this.baseUrl}/api/user/login?user=${encodeURIComponent(this.username!)}&pass=${encodeURIComponent(this.password!)}`;

    const response = await fetch(url, { method: 'POST' });
    const data = (await response.json()) as TechnitiumResponse<{ token: string }>;

    if (data.status !== 'ok' || !data.response?.token) {
      throw new Error(data.errorMessage ?? 'Authentication failed');
    }

    this.sessionToken = data.response.token;
    this.sessionExpiry = Date.now() + 3600000; // 1 hour expiry

    this.logger.debug('Session authenticated');
  }

  /**
   * Get authentication token
   */
  private async getAuthToken(): Promise<string> {
    if (this.authMethod === 'token') {
      return this.apiToken!;
    }

    // Check if session is expired
    if (!this.sessionToken || Date.now() >= this.sessionExpiry) {
      await this.authenticate();
    }

    return this.sessionToken!;
  }

  /**
   * List available zones
   */
  private async listZones(): Promise<string[]> {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/api/zones/list?token=${token}`;

    const response = await fetch(url);
    const data = (await response.json()) as TechnitiumResponse<{ zones: Array<{ name: string }> }>;

    if (data.status !== 'ok') {
      throw new Error(data.errorMessage ?? 'Failed to list zones');
    }

    return data.response?.zones.map((z) => z.name) ?? [];
  }

  /**
   * Build URL parameters for record creation
   */
  private buildRecordParams(record: DNSRecordCreateInput): string {
    const params = new URLSearchParams({
      domain: this.ensureFqdn(record.name),
      type: record.type,
      ttl: String(record.ttl ?? 3600),
      overwrite: 'true', // Allow overwriting existing records
    });

    switch (record.type) {
      case 'A':
      case 'AAAA':
        params.set('ipAddress', record.content);
        break;
      case 'CNAME':
        params.set('cname', record.content);
        break;
      case 'MX':
        params.set('exchange', record.content);
        params.set('preference', String(record.priority ?? 10));
        break;
      case 'TXT':
        params.set('text', record.content);
        break;
      case 'SRV':
        params.set('target', record.content);
        params.set('priority', String(record.priority ?? 1));
        params.set('weight', String(record.weight ?? 1));
        params.set('port', String(record.port ?? 80));
        break;
      case 'CAA':
        params.set('flags', String(record.flags ?? 0));
        params.set('tag', record.tag ?? 'issue');
        params.set('value', record.content);
        break;
      case 'NS':
        params.set('nameServer', record.content);
        break;
    }

    params.set('comments', 'Managed by TrafegoDNS');

    return params.toString();
  }

  /**
   * Convert Technitium record to internal format
   */
  private convertFromTechnitium(record: TechnitiumRecord): DNSRecord | null {
    const type = record.type.toUpperCase() as DNSRecordType;
    const validTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];

    if (!validTypes.includes(type)) {
      return null;
    }

    let content = '';
    const rData = record.rData;

    switch (type) {
      case 'A':
      case 'AAAA':
        content = rData.ipAddress ?? '';
        break;
      case 'CNAME':
        content = rData.cname ?? '';
        break;
      case 'MX':
        content = rData.exchange ?? '';
        break;
      case 'TXT':
        content = rData.text ?? '';
        break;
      case 'SRV':
        content = rData.target ?? '';
        break;
      case 'CAA':
        content = rData.value ?? '';
        break;
      case 'NS':
        content = rData.target ?? '';
        break;
    }

    // Technitium returns FQDN content with trailing dots - strip them for internal consistency
    const hostnameRecordTypes = ['CNAME', 'NS', 'MX', 'SRV'];
    if (hostnameRecordTypes.includes(type) && content && content.endsWith('.')) {
      content = content.slice(0, -1);
    }

    // Also strip trailing dot from record name if present
    let name = record.name;
    if (name && name.endsWith('.')) {
      name = name.slice(0, -1);
    }

    // Generate a unique ID from name+type+content (after normalization)
    const id = Buffer.from(`${name}:${type}:${content}`).toString('base64');

    return {
      id,
      type,
      name,
      content,
      ttl: record.ttl,
      priority: rData.preference ?? rData.priority,
      weight: rData.weight,
      port: rData.port,
      flags: rData.flags,
      tag: rData.tag,
      comment: record.comments,
      providerId: this.providerId,
    };
  }
}
