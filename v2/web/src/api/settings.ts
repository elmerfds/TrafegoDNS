/**
 * Settings API
 */
import { apiClient } from './client';

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: string | number | boolean;
  options?: string[];
  category: string;
  restartRequired: boolean;
  envVar?: string;
}

export interface SettingValue extends SettingDefinition {
  value: string | number | boolean;
  source: 'database' | 'env' | 'default';
}

export interface SettingsMap {
  [key: string]: {
    value: string;
    description?: string;
  };
}

export interface UpdateSettingResponse {
  key: string;
  value: string;
  restartRequired: boolean;
}

export interface BulkUpdateResponse {
  updated: Array<{ key: string; restartRequired: boolean }>;
  errors: Array<{ key: string; error: string }>;
  restartRequired: boolean;
  message?: string;
}

export const settingsApi = {
  /**
   * Get settings schema (available settings definitions)
   */
  async getSchema(): Promise<SettingDefinition[]> {
    return apiClient.get<SettingDefinition[]>('/settings/schema');
  },

  /**
   * List all settings with current values
   */
  async listSettings(): Promise<SettingValue[]> {
    return apiClient.get<SettingValue[]>('/settings');
  },

  /**
   * Get settings grouped by category
   */
  async getSettingsByCategory(): Promise<Record<string, SettingValue[]>> {
    return apiClient.get<Record<string, SettingValue[]>>('/settings/categories');
  },

  /**
   * Get a single setting
   */
  async getSetting(key: string): Promise<SettingValue> {
    return apiClient.get<SettingValue>(`/settings/${key}`);
  },

  /**
   * Update a setting
   */
  async updateSetting(key: string, value: string): Promise<UpdateSettingResponse> {
    return apiClient.put<UpdateSettingResponse>(`/settings/${key}`, { value });
  },

  /**
   * Update multiple settings at once
   */
  async updateBulkSettings(settings: Record<string, string>): Promise<BulkUpdateResponse> {
    return apiClient.put<BulkUpdateResponse>('/settings', settings);
  },

  /**
   * Reset a setting to its default value
   */
  async resetSetting(key: string): Promise<UpdateSettingResponse> {
    return apiClient.post<UpdateSettingResponse>(`/settings/${key}/reset`, {});
  },

  /**
   * Delete a setting (alias for reset)
   */
  async deleteSetting(key: string): Promise<void> {
    await apiClient.delete(`/settings/${key}`);
  },
};
