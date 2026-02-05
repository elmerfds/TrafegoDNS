/**
 * Providers API
 */
import { apiClient } from './client';

export type ProviderType = 'cloudflare' | 'digitalocean' | 'route53' | 'technitium';

export interface ProviderFeatures {
  proxied: boolean;
  ttlMin: number;
  ttlMax: number;
  ttlDefault: number;
  supportedTypes: string[];
  batchOperations: boolean;
}

export interface ProviderTypeInfo {
  type: string;
  name: string;
  features: ProviderFeatures;
  requiredCredentials: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required: boolean;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  isDefault: boolean;
  enabled: boolean;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string>; // Masked credentials returned on getProvider
  features?: ProviderFeatures; // Provider type features (TTL limits, etc.)
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderInput {
  name: string;
  type: ProviderType;
  credentials: Record<string, string>;
  settings?: Record<string, unknown>;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface UpdateProviderInput {
  name?: string;
  credentials?: Record<string, string>;
  settings?: Record<string, unknown>;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface TestProviderResult {
  connected: boolean;
  message: string;
}

export interface DiscoverRecordsResult {
  totalAtProvider: number;
  imported: number;
  skipped: number;
  managed: number;
  unmanaged: number;
}

export const providersApi = {
  async listProviderTypes(): Promise<ProviderTypeInfo[]> {
    return apiClient.get<ProviderTypeInfo[]>('/providers/types');
  },

  async getProviderType(type: string): Promise<ProviderTypeInfo> {
    return apiClient.get<ProviderTypeInfo>(`/providers/types/${type}`);
  },

  async listProviders(): Promise<Provider[]> {
    return apiClient.get<Provider[]>('/providers');
  },

  async getProvider(id: string): Promise<Provider> {
    return apiClient.get<Provider>(`/providers/${id}`);
  },

  async createProvider(data: CreateProviderInput): Promise<Provider> {
    return apiClient.post<Provider>('/providers', data);
  },

  async updateProvider(id: string, data: UpdateProviderInput): Promise<Provider> {
    return apiClient.put<Provider>(`/providers/${id}`, data);
  },

  async deleteProvider(id: string): Promise<void> {
    await apiClient.delete(`/providers/${id}`);
  },

  async testProvider(id: string): Promise<TestProviderResult> {
    return apiClient.post<TestProviderResult>(`/providers/${id}/test`);
  },

  async testProviderCredentials(data: CreateProviderInput): Promise<TestProviderResult> {
    return apiClient.post<TestProviderResult>('/providers/test', data);
  },

  async discoverRecords(id: string): Promise<DiscoverRecordsResult> {
    return apiClient.post<DiscoverRecordsResult>(`/providers/${id}/discover`);
  },
};
