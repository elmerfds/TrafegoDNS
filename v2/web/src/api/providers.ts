/**
 * Providers API
 */
import { apiClient } from './client';

export type ProviderType = 'cloudflare' | 'digitalocean' | 'route53' | 'technitium';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  isDefault: boolean;
  enabled: boolean;
  settings?: Record<string, unknown>;
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

export const providersApi = {
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
};
