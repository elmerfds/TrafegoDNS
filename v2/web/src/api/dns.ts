/**
 * DNS Records API
 */
import { apiClient } from './client';

export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS';

export interface DNSRecord {
  id: string;
  hostname: string;
  type: DNSRecordType;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
  providerId: string;
  providerRecordId?: string;
  source: string;
  status: 'active' | 'pending' | 'orphaned' | 'error';
  managed: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDNSRecordInput {
  hostname: string;
  type: DNSRecordType;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  providerId: string;
}

export interface UpdateDNSRecordInput {
  content?: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

export interface DNSRecordFilters {
  hostname?: string;
  type?: DNSRecordType;
  status?: string;
  providerId?: string;
  managed?: boolean;
  search?: string;
  zone?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface DNSRecordsResponse {
  records: DNSRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API response types (what the backend actually returns)
interface ApiDNSRecord {
  id: string;
  name: string;
  type: DNSRecordType;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
  providerId: string;
  externalId?: string;
  source: string;
  managed: boolean;
  orphanedAt?: string | null;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiDNSRecordsResponse {
  records: ApiDNSRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Transform API record to frontend record
function transformRecord(record: ApiDNSRecord): DNSRecord {
  return {
    id: record.id,
    hostname: record.name, // Map 'name' to 'hostname'
    type: record.type,
    content: record.content,
    ttl: record.ttl,
    priority: record.priority,
    proxied: record.proxied,
    providerId: record.providerId,
    providerRecordId: record.externalId,
    source: record.source,
    status: record.orphanedAt ? 'orphaned' : 'active', // Compute status from orphanedAt
    managed: record.managed,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const dnsApi = {
  async listRecords(filters?: DNSRecordFilters): Promise<DNSRecordsResponse> {
    const response = await apiClient.get<ApiDNSRecordsResponse>('/dns/records', filters as Record<string, unknown>);
    return {
      records: response.records.map(transformRecord),
      pagination: response.pagination,
    };
  },

  async getRecord(id: string): Promise<DNSRecord> {
    const record = await apiClient.get<ApiDNSRecord>(`/dns/records/${id}`);
    return transformRecord(record);
  },

  async createRecord(data: CreateDNSRecordInput): Promise<DNSRecord> {
    // Transform hostname to name for the API
    const apiData = {
      ...data,
      name: data.hostname,
    };
    const record = await apiClient.post<ApiDNSRecord>('/dns/records', apiData);
    return transformRecord(record);
  },

  async updateRecord(id: string, data: UpdateDNSRecordInput): Promise<DNSRecord> {
    const record = await apiClient.put<ApiDNSRecord>(`/dns/records/${id}`, data);
    return transformRecord(record);
  },

  async deleteRecord(id: string): Promise<void> {
    await apiClient.delete(`/dns/records/${id}`);
  },

  async bulkDeleteRecords(ids: string[]): Promise<{ deleted: number; failed: number; errors?: Array<{ id: string; error: string }> }> {
    return apiClient.post<{ deleted: number; failed: number; errors?: Array<{ id: string; error: string }> }>('/dns/records/bulk-delete', { ids });
  },

  async syncRecords(providerId?: string): Promise<{
    message: string;
    total: number;
    updated: number;
    unchanged: number;
    errors: number;
    details: Array<{ hostname: string; field: string; oldValue: string; newValue: string }>;
  }> {
    const params = providerId ? { providerId } : undefined;
    return apiClient.post<{
      message: string;
      total: number;
      updated: number;
      unchanged: number;
      errors: number;
      details: Array<{ hostname: string; field: string; oldValue: string; newValue: string }>;
    }>('/dns/records/sync', params);
  },
};
