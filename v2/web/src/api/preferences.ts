/**
 * User Preferences API
 * Manages per-user UI preferences like table columns, view options, etc.
 */
import { apiClient } from './client';

/**
 * Table view preference structure
 */
export interface TableViewPreference {
  columns: Array<{ id: string; visible: boolean }>;
  columnOrder: string[];
  density: 'compact' | 'normal' | 'comfortable';
  rowsPerPage: number;
}

/**
 * Stored preference with metadata
 */
export interface StoredPreference<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
}

/**
 * Default table view preferences
 */
export const DEFAULT_DNS_TABLE_PREFERENCES: TableViewPreference = {
  columns: [
    { id: 'select', visible: true },
    { id: 'hostname', visible: true },
    { id: 'type', visible: true },
    { id: 'content', visible: true },
    { id: 'ttl', visible: true },
    { id: 'proxied', visible: true },
    { id: 'status', visible: true },
    { id: 'provider', visible: true },
    { id: 'managed', visible: true },
    { id: 'source', visible: false },
    { id: 'lastSynced', visible: false },
    { id: 'created', visible: false },
    { id: 'actions', visible: true },
  ],
  columnOrder: [
    'select', 'hostname', 'type', 'content', 'ttl', 'proxied',
    'status', 'provider', 'managed', 'source', 'lastSynced', 'created', 'actions'
  ],
  density: 'normal',
  rowsPerPage: 20,
};

export const preferencesApi = {
  /**
   * Get all preferences for current user
   */
  async listPreferences(): Promise<StoredPreference[]> {
    return apiClient.get<StoredPreference[]>('/preferences');
  },

  /**
   * Get a specific preference
   * Returns null if preference doesn't exist (uses defaults)
   */
  async getPreference<T = unknown>(key: string): Promise<StoredPreference<T> | null> {
    return apiClient.get<StoredPreference<T> | null>(`/preferences/${key}`);
  },

  /**
   * Save a preference
   */
  async setPreference<T = unknown>(key: string, value: T): Promise<StoredPreference<T>> {
    return apiClient.put<StoredPreference<T>>(`/preferences/${key}`, { value });
  },

  /**
   * Update a preference (alias for setPreference)
   */
  async updatePreference<T = unknown>(key: string, value: T): Promise<StoredPreference<T>> {
    return this.setPreference(key, value);
  },

  /**
   * Delete a preference (reset to defaults)
   */
  async deletePreference(key: string): Promise<void> {
    await apiClient.delete(`/preferences/${key}`);
  },

  /**
   * Get table view preference with defaults
   */
  async getTablePreference(key: string, defaults: TableViewPreference): Promise<TableViewPreference> {
    const stored = await this.getPreference<TableViewPreference>(key);
    if (!stored || !stored.value) {
      return defaults;
    }
    // Merge with defaults to handle new columns added after preference was saved
    return {
      ...defaults,
      ...stored.value,
      columns: mergeColumns(defaults.columns, stored.value.columns),
      columnOrder: mergeColumnOrder(defaults.columnOrder, stored.value.columnOrder),
    };
  },
};

/**
 * Merge column visibility preferences with defaults
 * Ensures new columns added to defaults are included
 */
function mergeColumns(
  defaults: Array<{ id: string; visible: boolean }>,
  stored: Array<{ id: string; visible: boolean }>
): Array<{ id: string; visible: boolean }> {
  const storedMap = new Map(stored.map(c => [c.id, c]));
  return defaults.map(d => storedMap.get(d.id) ?? d);
}

/**
 * Merge column order with defaults
 * Ensures new columns added to defaults are included at the end
 */
function mergeColumnOrder(defaults: string[], stored: string[]): string[] {
  const storedSet = new Set(stored);
  const newColumns = defaults.filter(id => !storedSet.has(id));
  return [...stored.filter(id => defaults.includes(id)), ...newColumns];
}
