/**
 * Preserved Hostnames API
 */
import { apiClient } from './client';

export interface PreservedHostname {
  id: string;
  hostname: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreservedHostnameInput {
  hostname: string;
  reason?: string;
}

export interface UpdatePreservedHostnameInput {
  reason?: string;
}

export const preservedHostnamesApi = {
  /**
   * List all preserved hostnames
   */
  list: () => apiClient.get<PreservedHostname[]>('/preserved-hostnames'),

  /**
   * Get a single preserved hostname
   */
  get: (id: string) => apiClient.get<PreservedHostname>(`/preserved-hostnames/${id}`),

  /**
   * Create a new preserved hostname
   */
  create: (input: CreatePreservedHostnameInput) =>
    apiClient.post<PreservedHostname>('/preserved-hostnames', input),

  /**
   * Update a preserved hostname
   */
  update: (id: string, input: UpdatePreservedHostnameInput) =>
    apiClient.put<PreservedHostname>(`/preserved-hostnames/${id}`, input),

  /**
   * Delete a preserved hostname
   */
  delete: (id: string) => apiClient.delete(`/preserved-hostnames/${id}`),

  /**
   * Bulk delete preserved hostnames
   */
  bulkDelete: (ids: string[]) =>
    apiClient.post<{ deleted: number; failed: number; errors?: Array<{ id: string; error: string }> }>('/preserved-hostnames/bulk-delete', { ids }),
};
