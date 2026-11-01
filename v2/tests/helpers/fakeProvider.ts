/**
 * In-memory DNS provider for exercising DNSManager without network calls.
 * `remote` is the provider-side truth; tests can seed it and inspect calls.
 */
import { DNSProvider, type ProviderInfo } from '../../src/providers/base/DNSProvider.js';
import type { DNSRecord, DNSRecordCreateInput, DNSRecordUpdateInput } from '../../src/types/index.js';

export class FakeProvider extends DNSProvider {
  remote = new Map<string, DNSRecord>();
  calls: Array<{ op: 'create' | 'update' | 'delete'; id?: string; record?: unknown }> = [];
  failNext: { op: 'create' | 'update' | 'delete'; error: Error } | null = null;
  private seq = 0;

  constructor(id: string, private readonly zone = 'example.com', private readonly proxiedSupport = true) {
    super(id, `fake-${id}`, {});
  }

  getInfo(): ProviderInfo {
    return {
      name: this.providerName, type: 'fake', version: '1',
      features: { proxied: this.proxiedSupport, ttlMin: 1, ttlMax: 86400, supportedTypes: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'SRV', 'CAA', 'NS'], batchOperations: false },
    };
  }
  async init(): Promise<void> { this.initialized = true; }
  async testConnection(): Promise<boolean> { return true; }
  getZoneName(): string { return this.zone; }
  async refreshRecordCache(): Promise<DNSRecord[]> {
    this.recordCache = { records: [...this.remote.values()], lastUpdated: Date.now() };
    return this.recordCache.records;
  }
  async listRecords(): Promise<DNSRecord[]> { return [...this.remote.values()]; }
  validateRecord(): void {}

  private maybeFail(op: 'create' | 'update' | 'delete') {
    if (this.failNext?.op === op) { const e = this.failNext.error; this.failNext = null; throw e; }
  }

  /** Seed a record that exists at the provider (e.g. created by hand) */
  seed(record: Omit<DNSRecord, 'id'> & { id?: string }): DNSRecord {
    const r = { ...record, id: record.id ?? `ext-${++this.seq}` } as DNSRecord;
    this.remote.set(r.id!, r);
    return r;
  }

  async createRecord(input: DNSRecordCreateInput): Promise<DNSRecord> {
    this.maybeFail('create');
    const r = { ttl: 1, ...input, id: `ext-${++this.seq}` } as DNSRecord;
    this.remote.set(r.id!, r);
    this.calls.push({ op: 'create', id: r.id, record: input });
    this.updateRecordInCache(r);
    return r;
  }
  async updateRecord(id: string, input: DNSRecordUpdateInput): Promise<DNSRecord> {
    this.maybeFail('update');
    const existing = this.remote.get(id);
    if (!existing) throw new Error(`Record not found: ${id}`);
    const r = { ...existing, ...input, id } as DNSRecord;
    this.remote.set(id, r);
    this.calls.push({ op: 'update', id, record: input });
    this.updateRecordInCache(r);
    return r;
  }
  async deleteRecord(id: string): Promise<boolean> {
    this.maybeFail('delete');
    this.calls.push({ op: 'delete', id });
    const existed = this.remote.delete(id);
    this.removeRecordFromCache(id);
    return existed;
  }
}
