/**
 * Hostname Overrides API
 */
import { apiClient } from './client';

export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS';

export interface HostnameOverride {
  id: string;
  hostname: string;
  proxied: boolean | null;
  ttl: number | null;
  recordType: DNSRecordType | null;
  content: string | null;
  providerId: string | null;
  reason: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOverrideInput {
  hostname: string;
  proxied?: boolean | null;
  ttl?: number | null;
  recordType?: DNSRecordType | null;
  content?: string | null;
  providerId?: string | null;
  reason?: string | null;
  enabled?: boolean;
}

export interface UpdateOverrideInput {
  hostname?: string;
  proxied?: boolean | null;
  ttl?: number | null;
  recordType?: DNSRecordType | null;
  content?: string | null;
  providerId?: string | null;
  reason?: string | null;
  enabled?: boolean;
}

export const overridesApi = {
  async listOverrides(): Promise<HostnameOverride[]> {
    return apiClient.get<HostnameOverride[]>('/overrides');
  },

  async getOverride(id: string): Promise<HostnameOverride> {
    return apiClient.get<HostnameOverride>(`/overrides/${id}`);
  },

  async createOverride(data: CreateOverrideInput): Promise<HostnameOverride> {
    return apiClient.post<HostnameOverride>('/overrides', data);
  },

  async createOverrideFromRecord(recordId: string): Promise<HostnameOverride> {
    return apiClient.post<HostnameOverride>('/overrides/from-record', { recordId });
  },

  async updateOverride(id: string, data: UpdateOverrideInput): Promise<HostnameOverride> {
    return apiClient.put<HostnameOverride>(`/overrides/${id}`, data);
  },

  async deleteOverride(id: string): Promise<void> {
    await apiClient.delete(`/overrides/${id}`);
  },
};
