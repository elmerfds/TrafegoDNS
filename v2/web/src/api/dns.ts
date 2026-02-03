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

export const dnsApi = {
  async listRecords(filters?: DNSRecordFilters): Promise<DNSRecordsResponse> {
    return apiClient.get<DNSRecordsResponse>('/dns/records', filters as Record<string, unknown>);
  },

  async getRecord(id: string): Promise<DNSRecord> {
    return apiClient.get<DNSRecord>(`/dns/records/${id}`);
  },

  async createRecord(data: CreateDNSRecordInput): Promise<DNSRecord> {
    return apiClient.post<DNSRecord>('/dns/records', data);
  },

  async updateRecord(id: string, data: UpdateDNSRecordInput): Promise<DNSRecord> {
    return apiClient.put<DNSRecord>(`/dns/records/${id}`, data);
  },

  async deleteRecord(id: string): Promise<void> {
    await apiClient.delete(`/dns/records/${id}`);
  },

  async syncRecords(): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>('/dns/records/sync');
  },
};
