/**
 * AWS Route53 DNS Provider Implementation
 */
import {
  Route53Client,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  ListHostedZonesByNameCommand,
  type ResourceRecordSet,
  type Change,
  type ChangeAction,
} from '@aws-sdk/client-route-53';
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

export interface Route53ProviderCredentials extends ProviderCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  zoneName: string;
  hostedZoneId?: string;
}

/**
 * AWS Route53 DNS Provider
 */
export class Route53Provider extends DNSProvider {
  private client: Route53Client;
  private hostedZoneId: string | null = null;
  private readonly zoneName: string;

  constructor(
    providerId: string,
    providerName: string,
    credentials: Route53ProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    this.zoneName = credentials.zoneName.replace(/\.$/, ''); // Remove trailing dot
    this.hostedZoneId = credentials.hostedZoneId ?? null;

    // Initialize Route53 client
    this.client = new Route53Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'route53',
      version: '1.0.0',
      features: {
        proxied: false,
        ttlMin: 60,
        ttlMax: 604800,
        supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
        batchOperations: true,
      },
    };
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing Route53 provider');

    try {
      // Look up hosted zone ID if not provided
      if (!this.hostedZoneId) {
        const command = new ListHostedZonesByNameCommand({
          DNSName: this.zoneName,
          MaxItems: 1,
        });

        const response = await this.client.send(command);
        const zone = response.HostedZones?.find(
          (z) => z.Name?.replace(/\.$/, '') === this.zoneName
        );

        if (!zone?.Id) {
          throw new Error(`Hosted zone not found: ${this.zoneName}`);
        }

        // Extract zone ID (format: /hostedzone/ZONEID)
        this.hostedZoneId = zone.Id.replace('/hostedzone/', '');
        this.logger.debug({ hostedZoneId: this.hostedZoneId }, 'Hosted zone ID retrieved');
      }

      // Initialize record cache
      await this.refreshRecordCache();

      this.initialized = true;
      this.logger.info({ zoneName: this.zoneName, hostedZoneId: this.hostedZoneId }, 'Route53 provider initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Route53 provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const command = new ListHostedZonesByNameCommand({ MaxItems: 1 });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.zoneName;
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    if (!this.hostedZoneId) {
      throw new Error('Hosted zone ID not initialized');
    }

    this.logger.debug('Refreshing DNS record cache');

    try {
      const records: DNSRecord[] = [];
      let nextRecordName: string | undefined;
      let nextRecordType: string | undefined;

      while (true) {
        const command = new ListResourceRecordSetsCommand({
          HostedZoneId: this.hostedZoneId,
          StartRecordName: nextRecordName,
          StartRecordType: nextRecordType as 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS' | undefined,
          MaxItems: 100,
        });

        const response = await this.client.send(command);

        for (const recordSet of response.ResourceRecordSets ?? []) {
          const converted = this.convertFromRoute53(recordSet);
          if (converted) {
            records.push(...converted);
          }
        }

        if (!response.IsTruncated) {
          break;
        }

        nextRecordName = response.NextRecordName;
        nextRecordType = response.NextRecordType;
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
    if (!this.hostedZoneId) {
      throw new Error('Hosted zone ID not initialized');
    }

    this.validateRecord(input);

    const change = this.buildChange('CREATE', input);

    this.logger.debug({ name: input.name, type: input.type }, 'Creating DNS record');

    try {
      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: this.hostedZoneId,
        ChangeBatch: {
          Comment: 'Managed by TrafegoDNS',
          Changes: [change],
        },
      });

      await this.client.send(command);

      // Refresh cache and find the new record
      await this.refreshRecordCache();
      const created = this.findRecordInCache(input.type, this.ensureFqdn(input.name));

      if (!created) {
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
    if (!this.hostedZoneId) {
      throw new Error('Hosted zone ID not initialized');
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
      priority: input.priority ?? existing.priority,
      weight: input.weight ?? existing.weight,
      port: input.port ?? existing.port,
      flags: input.flags ?? existing.flags,
      tag: input.tag ?? existing.tag,
    };

    // Route53 uses UPSERT for updates
    const change = this.buildChange('UPSERT', mergedInput);

    this.logger.debug({ id, name: mergedInput.name, type: mergedInput.type }, 'Updating DNS record');

    try {
      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: this.hostedZoneId,
        ChangeBatch: {
          Comment: 'Managed by TrafegoDNS',
          Changes: [change],
        },
      });

      await this.client.send(command);

      // Refresh cache and find the updated record
      await this.refreshRecordCache();
      const updated = this.findRecordInCache(mergedInput.type, this.ensureFqdn(mergedInput.name));

      if (!updated) {
        throw new Error('Record updated but not found in cache');
      }

      this.logger.info({ type: mergedInput.type, name: mergedInput.name }, 'DNS record updated');
      return updated;
    } catch (error) {
      this.logger.error({ error, id, input }, 'Failed to update DNS record');
      throw error;
    }
  }

  async deleteRecord(id: string): Promise<boolean> {
    if (!this.hostedZoneId) {
      throw new Error('Hosted zone ID not initialized');
    }

    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const deleteInput: DNSRecordCreateInput = {
      type: existing.type,
      name: existing.name,
      content: existing.content,
      ttl: existing.ttl,
      priority: existing.priority,
      weight: existing.weight,
      port: existing.port,
      flags: existing.flags,
      tag: existing.tag,
    };

    const change = this.buildChange('DELETE', deleteInput);

    this.logger.info({ type: existing.type, name: existing.name }, 'Deleting DNS record');

    try {
      const command = new ChangeResourceRecordSetsCommand({
        HostedZoneId: this.hostedZoneId,
        ChangeBatch: {
          Comment: 'Managed by TrafegoDNS',
          Changes: [change],
        },
      });

      await this.client.send(command);

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

    // TTL validation (Route53 minimum is 60)
    if (record.ttl !== undefined) {
      if (record.ttl < 60 || record.ttl > 604800) {
        throw new Error('TTL must be between 60 and 604800');
      }
    }
  }

  /**
   * Build a Route53 change object
   */
  private buildChange(action: ChangeAction, record: DNSRecordCreateInput): Change {
    const fqdn = this.ensureFqdn(record.name);
    const name = fqdn.endsWith('.') ? fqdn : `${fqdn}.`;

    let resourceRecords: Array<{ Value: string }>;

    switch (record.type) {
      case 'MX':
        resourceRecords = [{ Value: `${record.priority} ${record.content}` }];
        break;

      case 'SRV':
        resourceRecords = [
          { Value: `${record.priority} ${record.weight} ${record.port} ${record.content}` },
        ];
        break;

      case 'CAA':
        resourceRecords = [{ Value: `${record.flags} ${record.tag} "${record.content}"` }];
        break;

      case 'TXT':
        // TXT records need quotes
        resourceRecords = [{ Value: `"${record.content}"` }];
        break;

      default:
        resourceRecords = [{ Value: record.content }];
    }

    return {
      Action: action,
      ResourceRecordSet: {
        Name: name,
        Type: record.type,
        TTL: record.ttl ?? 300,
        ResourceRecords: resourceRecords,
      },
    };
  }

  /**
   * Convert Route53 record set to internal format
   * Note: Route53 can have multiple values per record set
   */
  private convertFromRoute53(recordSet: ResourceRecordSet): DNSRecord[] | null {
    const type = recordSet.Type as DNSRecordType;
    const validTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];

    if (!validTypes.includes(type)) {
      return null;
    }

    if (!recordSet.ResourceRecords || recordSet.ResourceRecords.length === 0) {
      // Alias records don't have ResourceRecords
      return null;
    }

    const name = recordSet.Name?.replace(/\.$/, '') ?? '';
    const ttl = recordSet.TTL ?? 300;
    const records: DNSRecord[] = [];

    for (const rr of recordSet.ResourceRecords) {
      const value = rr.Value ?? '';
      let content = value;
      let priority: number | undefined;
      let weight: number | undefined;
      let port: number | undefined;
      let flags: number | undefined;
      let tag: string | undefined;

      switch (type) {
        case 'MX': {
          const parts = value.split(' ');
          priority = parseInt(parts[0] ?? '10', 10);
          content = parts.slice(1).join(' ');
          break;
        }

        case 'SRV': {
          const parts = value.split(' ');
          priority = parseInt(parts[0] ?? '1', 10);
          weight = parseInt(parts[1] ?? '1', 10);
          port = parseInt(parts[2] ?? '80', 10);
          content = parts.slice(3).join(' ');
          break;
        }

        case 'CAA': {
          const parts = value.split(' ');
          flags = parseInt(parts[0] ?? '0', 10);
          tag = parts[1];
          content = parts.slice(2).join(' ').replace(/^"|"$/g, '');
          break;
        }

        case 'TXT':
          content = value.replace(/^"|"$/g, '');
          break;
      }

      // Generate unique ID
      const id = Buffer.from(`${name}:${type}:${content}`).toString('base64');

      records.push({
        id,
        type,
        name,
        content,
        ttl,
        priority,
        weight,
        port,
        flags,
        tag,
        providerId: this.providerId,
      });
    }

    return records;
  }
}
