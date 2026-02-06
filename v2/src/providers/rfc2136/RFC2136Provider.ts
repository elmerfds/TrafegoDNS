/**
 * RFC 2136 Dynamic DNS Update Provider
 * Uses nsupdate and dig CLI tools for DNS record management
 * Compatible with BIND9, PowerDNS, Knot DNS, Windows DNS Server, and other RFC 2136 compliant servers
 */
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DNSProvider, type ProviderCredentials, type ProviderInfo } from '../base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput, DNSRecordType, ProviderSettingsData } from '../../types/index.js';

const execFileAsync = promisify(execFile);

export interface RFC2136ProviderCredentials extends ProviderCredentials {
  server: string;
  port?: string;
  zone: string;
  keyName?: string;
  keyAlgorithm?: string;
  keySecret?: string;
}

const SUPPORTED_TYPES: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];

export class RFC2136Provider extends DNSProvider {
  private readonly server: string;
  private readonly port: number;
  private readonly zoneName: string;
  private readonly keyName?: string;
  private readonly keyAlgorithm: string;
  private readonly keySecret?: string;

  constructor(
    providerId: string,
    providerName: string,
    credentials: RFC2136ProviderCredentials,
    options: { cacheRefreshInterval?: number; settings?: ProviderSettingsData } = {}
  ) {
    super(providerId, providerName, credentials, options);

    this.server = credentials.server.trim();
    this.port = parseInt(credentials.port ?? '53', 10) || 53;
    this.zoneName = credentials.zone.trim().replace(/\.$/, '');
    this.keyName = credentials.keyName?.trim();
    this.keyAlgorithm = credentials.keyAlgorithm?.trim() || 'hmac-sha256';
    this.keySecret = credentials.keySecret?.trim();
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName,
      type: 'rfc2136',
      version: '1.0.0',
      features: {
        proxied: false,
        ttlMin: 1,
        ttlMax: 604800,
        supportedTypes: [...SUPPORTED_TYPES],
        batchOperations: false,
      },
    };
  }

  async init(): Promise<void> {
    this.logger.debug('Initializing RFC 2136 provider');
    try {
      const soa = await this.execDig([this.zoneName, 'SOA', '+short']);
      if (!soa.trim()) {
        throw new Error(`Zone ${this.zoneName} not found on server ${this.server}`);
      }
      await this.refreshRecordCache();
      this.initialized = true;
      this.logger.info({ zone: this.zoneName, server: this.server }, 'RFC 2136 provider initialized');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to initialize RFC 2136 provider');
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const soa = await this.execDig([this.zoneName, 'SOA', '+short']);
      return soa.trim().length > 0;
    } catch {
      return false;
    }
  }

  getZoneName(): string {
    return this.zoneName;
  }

  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.logger.debug('Refreshing record cache via AXFR');
    try {
      const output = await this.execDig([this.zoneName, 'AXFR']);
      const records = this.parseDigOutput(output);
      this.recordCache = {
        records,
        lastUpdated: Date.now(),
      };
      this.logger.debug({ count: records.length }, 'Cache refreshed');
      return records;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: msg }, 'Failed to refresh record cache');
      throw error;
    }
  }

  async listRecords(filter?: { type?: DNSRecordType; name?: string }): Promise<DNSRecord[]> {
    const records = await this.getRecordsFromCache();

    if (!filter) return records;

    return records.filter((r) => {
      if (filter.type && r.type !== filter.type) return false;
      if (filter.name && r.name.toLowerCase() !== filter.name.toLowerCase()) return false;
      return true;
    });
  }

  async createRecord(record: DNSRecordCreateInput): Promise<DNSRecord> {
    this.validateRecord(record);

    const fqdn = this.toFqdn(record.name);
    const ttl = record.ttl ?? 3600;
    const rdata = this.formatRdata(record);

    const commands = [
      ...this.buildNsupdateHeader(),
      `update add ${fqdn} ${ttl} ${record.type} ${rdata}`,
      'send',
    ].join('\n');

    await this.execNsupdate(commands);

    const dnsRecord = this.toDNSRecord(record, fqdn, ttl);
    this.updateRecordInCache(dnsRecord);
    this.logger.debug({ name: record.name, type: record.type }, 'Record created');
    return dnsRecord;
  }

  async updateRecord(id: string, record: DNSRecordUpdateInput): Promise<DNSRecord> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      throw new Error(`Record not found: ${id}`);
    }

    const name = record.name ?? existing.name;
    const type = record.type ?? existing.type;
    const content = record.content ?? existing.content;
    const ttl = record.ttl ?? existing.ttl;
    const fqdn = this.toFqdn(name);

    // Delete old record by specific name+type+rdata, then add new one
    const oldFqdn = this.toFqdn(existing.name);
    const oldRdata = this.formatRdataFromRecord(existing);
    const newRdata = this.formatRdataFromFields(type, content, record.priority ?? existing.priority, record.weight ?? existing.weight, record.port ?? existing.port, record.flags ?? existing.flags, record.tag ?? existing.tag);

    const commands = [
      ...this.buildNsupdateHeader(),
      `update delete ${oldFqdn} ${existing.type} ${oldRdata}`,
      `update add ${fqdn} ${ttl} ${type} ${newRdata}`,
      'send',
    ].join('\n');

    await this.execNsupdate(commands);

    const updatedRecord: DNSRecord = {
      ...existing,
      name: fqdn.replace(/\.$/, ''),
      type,
      content,
      ttl,
      priority: record.priority ?? existing.priority,
      weight: record.weight ?? existing.weight,
      port: record.port ?? existing.port,
      flags: record.flags ?? existing.flags,
      tag: record.tag ?? existing.tag,
    };

    // Generate new ID since content may have changed
    updatedRecord.id = this.generateRecordId(updatedRecord.name, updatedRecord.type, updatedRecord.content);

    this.removeRecordFromCache(id);
    this.updateRecordInCache(updatedRecord);
    this.logger.debug({ name, type }, 'Record updated');
    return updatedRecord;
  }

  async deleteRecord(id: string): Promise<boolean> {
    const existing = this.recordCache.records.find((r) => r.id === id);
    if (!existing) {
      this.logger.warn({ id }, 'Record not found for deletion');
      return false;
    }

    const fqdn = this.toFqdn(existing.name);
    const rdata = this.formatRdataFromRecord(existing);

    const commands = [
      ...this.buildNsupdateHeader(),
      `update delete ${fqdn} ${existing.type} ${rdata}`,
      'send',
    ].join('\n');

    await this.execNsupdate(commands);

    this.removeRecordFromCache(id);
    this.logger.debug({ name: existing.name, type: existing.type }, 'Record deleted');
    return true;
  }

  validateRecord(record: DNSRecordCreateInput): void {
    if (!record.name) throw new Error('Record name is required');
    if (!record.content) throw new Error('Record content is required');
    if (!record.type) throw new Error('Record type is required');
    if (!SUPPORTED_TYPES.includes(record.type)) {
      throw new Error(`Unsupported record type: ${record.type}`);
    }
    if (record.type === 'MX' && record.priority === undefined) {
      throw new Error('MX records require a priority');
    }
    if (record.type === 'SRV' && (record.priority === undefined || record.weight === undefined || record.port === undefined)) {
      throw new Error('SRV records require priority, weight, and port');
    }
    if (record.type === 'CAA' && (record.flags === undefined || !record.tag)) {
      throw new Error('CAA records require flags and tag');
    }
  }

  // Override to handle FQDN matching (records may come back with or without trailing dot / zone suffix)
  override findRecordInCache(type: DNSRecordType, name: string): DNSRecord | undefined {
    const normalizedName = name.toLowerCase().replace(/\.$/, '');
    const zone = this.zoneName.toLowerCase();

    return this.recordCache.records.find((record) => {
      if (record.type !== type) return false;
      const recordName = record.name.toLowerCase().replace(/\.$/, '');

      if (recordName === normalizedName) return true;

      // Try with/without zone suffix
      const nameWithZone = normalizedName.endsWith(`.${zone}`) ? normalizedName : `${normalizedName}.${zone}`;
      const nameWithoutZone = normalizedName.endsWith(`.${zone}`)
        ? normalizedName.slice(0, -(zone.length + 1))
        : normalizedName;
      const recordWithZone = recordName.endsWith(`.${zone}`) ? recordName : `${recordName}.${zone}`;
      const recordWithoutZone = recordName.endsWith(`.${zone}`)
        ? recordName.slice(0, -(zone.length + 1))
        : recordName;

      return nameWithZone === recordWithZone || nameWithoutZone === recordWithoutZone;
    });
  }

  // ── Private helpers ──────────────────────────────────────────────

  private buildNsupdateHeader(): string[] {
    const lines: string[] = [];
    lines.push(`server ${this.server} ${this.port}`);
    if (this.keyName && this.keySecret) {
      lines.push(`key ${this.keyAlgorithm}:${this.keyName} ${this.keySecret}`);
    }
    lines.push(`zone ${this.zoneName}.`);
    return lines;
  }

  private execNsupdate(commands: string): Promise<string> {
    this.logger.debug({ commands }, 'Executing nsupdate');
    return new Promise((resolve, reject) => {
      const proc = spawn('nsupdate', [], { timeout: 30000 });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          if (stderr.trim()) {
            this.logger.debug({ stderr }, 'nsupdate stderr');
          }
          resolve(stdout);
        } else {
          const msg = stderr.trim() || `nsupdate exited with code ${code}`;
          this.logger.error({ error: msg, commands }, 'nsupdate failed');
          reject(new Error(`nsupdate failed: ${msg}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`nsupdate failed: ${err.message}`));
      });

      proc.stdin.write(commands + '\n');
      proc.stdin.end();
    });
  }

  private async execDig(args: string[]): Promise<string> {
    const fullArgs = [`@${this.server}`, `-p`, `${this.port}`, ...args];

    // Add TSIG auth for zone transfers
    if (this.keyName && this.keySecret) {
      fullArgs.push('-y', `${this.keyAlgorithm}:${this.keyName}:${this.keySecret}`);
    }

    this.logger.debug({ args: fullArgs }, 'Executing dig');
    try {
      const { stdout } = await execFileAsync('dig', fullArgs, { timeout: 30000 });
      return stdout;
    } catch (error: unknown) {
      const err = error as { stderr?: string; message?: string };
      const msg = err.stderr?.trim() || err.message || String(error);
      throw new Error(`dig failed: ${msg}`);
    }
  }

  private parseDigOutput(output: string): DNSRecord[] {
    const records: DNSRecord[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments, empty lines, and OPT pseudo-records
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith(';;')) continue;

      // Parse standard dig output format: name TTL CLASS TYPE RDATA...
      const parts = trimmed.split(/\s+/);
      if (parts.length < 5) continue;

      const rawName = parts[0]!;
      const rawTtl = parts[1]!;
      const rawClass = parts[2]!;
      const rawType = parts[3]!;
      const rdataParts = parts.slice(4);

      // Skip non-IN class records
      if (rawClass !== 'IN') continue;

      const type = rawType.toUpperCase() as DNSRecordType;
      if (!SUPPORTED_TYPES.includes(type)) continue;

      const name = rawName.replace(/\.$/, '');
      const ttl = parseInt(rawTtl, 10);

      // Skip SOA and NS records for the zone apex (these are infrastructure records)
      if (type === 'NS' && name.toLowerCase() === this.zoneName.toLowerCase()) continue;

      const rdata = rdataParts.join(' ');
      const parsed = this.parseRdata(type, rdata);
      if (!parsed) continue;

      const id = this.generateRecordId(name, type, parsed.content);

      records.push({
        id,
        type,
        name,
        content: parsed.content,
        ttl,
        priority: parsed.priority,
        weight: parsed.weight,
        port: parsed.port,
        flags: parsed.flags,
        tag: parsed.tag,
        providerId: this.providerId,
      });
    }

    return records;
  }

  private parseRdata(type: DNSRecordType, rdata: string): {
    content: string;
    priority?: number;
    weight?: number;
    port?: number;
    flags?: number;
    tag?: string;
  } | null {
    switch (type) {
      case 'A':
      case 'AAAA':
        return { content: rdata.trim() };

      case 'CNAME':
      case 'NS':
        return { content: rdata.trim().replace(/\.$/, '') };

      case 'MX': {
        const mxParts = rdata.trim().split(/\s+/);
        return {
          content: (mxParts[1] ?? '').replace(/\.$/, ''),
          priority: parseInt(mxParts[0] ?? '10', 10),
        };
      }

      case 'TXT': {
        // TXT records may be quoted, possibly split across multiple strings
        const content = rdata.replace(/^"(.*)"$/, '$1').replace(/"\s+"/g, '');
        return { content };
      }

      case 'SRV': {
        const srvParts = rdata.trim().split(/\s+/);
        return {
          content: (srvParts[3] ?? '').replace(/\.$/, ''),
          priority: parseInt(srvParts[0] ?? '0', 10),
          weight: parseInt(srvParts[1] ?? '0', 10),
          port: parseInt(srvParts[2] ?? '0', 10),
        };
      }

      case 'CAA': {
        const caaParts = rdata.trim().split(/\s+/);
        const caaFlags = parseInt(caaParts[0] ?? '0', 10);
        const caaTag = caaParts[1] ?? 'issue';
        const caaValue = caaParts.slice(2).join(' ').replace(/^"(.*)"$/, '$1');
        return {
          content: caaValue,
          flags: caaFlags,
          tag: caaTag,
        };
      }

      default:
        return null;
    }
  }

  private formatRdata(record: DNSRecordCreateInput): string {
    return this.formatRdataFromFields(
      record.type, record.content, record.priority, record.weight, record.port, record.flags, record.tag
    );
  }

  private formatRdataFromRecord(record: DNSRecord): string {
    return this.formatRdataFromFields(
      record.type, record.content, record.priority, record.weight, record.port, record.flags, record.tag
    );
  }

  private formatRdataFromFields(
    type: DNSRecordType,
    content: string,
    priority?: number,
    weight?: number,
    port?: number,
    flags?: number,
    tag?: string,
  ): string {
    switch (type) {
      case 'A':
      case 'AAAA':
        return content;

      case 'CNAME':
      case 'NS':
        return content.endsWith('.') ? content : `${content}.`;

      case 'MX':
        return `${priority ?? 10} ${content.endsWith('.') ? content : `${content}.`}`;

      case 'TXT':
        // Ensure content is quoted for nsupdate
        return content.startsWith('"') ? content : `"${content}"`;

      case 'SRV':
        return `${priority ?? 0} ${weight ?? 0} ${port ?? 0} ${content.endsWith('.') ? content : `${content}.`}`;

      case 'CAA':
        return `${flags ?? 0} ${tag ?? 'issue'} "${content}"`;

      default:
        return content;
    }
  }

  private toFqdn(name: string): string {
    const clean = name.replace(/\.$/, '');
    const zone = this.zoneName.toLowerCase();
    const lower = clean.toLowerCase();

    if (lower === zone || lower === '@') {
      return `${this.zoneName}.`;
    }

    if (lower.endsWith(`.${zone}`)) {
      return `${clean}.`;
    }

    return `${clean}.${this.zoneName}.`;
  }

  private toDNSRecord(input: DNSRecordCreateInput, fqdn: string, ttl: number): DNSRecord {
    const name = fqdn.replace(/\.$/, '');
    return {
      id: this.generateRecordId(name, input.type, input.content),
      type: input.type,
      name,
      content: input.content,
      ttl,
      priority: input.priority,
      weight: input.weight,
      port: input.port,
      flags: input.flags,
      tag: input.tag,
      providerId: this.providerId,
    };
  }

  private generateRecordId(name: string, type: string, content: string): string {
    return Buffer.from(`${name}:${type}:${content}`).toString('base64');
  }
}
