/**
 * Settings Page
 * Dynamic settings management with schema-driven UI
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, AlertTriangle } from 'lucide-react';
import { settingsApi } from '../api';
import { Button, Alert, Badge } from '../components/common';

interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: string | number | boolean;
  options?: string[];
  category: string;
  restartRequired: boolean;
  value: string | number | boolean;
  source: 'database' | 'env' | 'default';
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  dns: 'DNS Defaults',
  cleanup: 'Cleanup',
  traefik: 'Traefik',
  docker: 'Docker',
  webhooks: 'Webhooks',
  security: 'Security',
};

const CATEGORY_ORDER = ['general', 'dns', 'cleanup', 'traefik', 'docker', 'webhooks', 'security'];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [restartWarning, setRestartWarning] = useState(false);

  const { data: settingsData, isLoading, error } = useQuery({
    queryKey: ['settings', 'categorized'],
    queryFn: () => settingsApi.getSettingsByCategory(),
  });

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => settingsApi.updateBulkSettings(settings),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditedSettings({});

      if (response.restartRequired) {
        setSuccessMessage('Settings saved. Some changes require a restart to take effect.');
        setRestartWarning(true);
      } else {
        setSuccessMessage('Settings saved and applied.');
        setRestartWarning(false);
      }
      setTimeout(() => setSuccessMessage(null), 5000);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => settingsApi.resetSetting(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const getValue = (setting: SettingDefinition): string => {
    if (editedSettings[setting.key] !== undefined) {
      return editedSettings[setting.key];
    }
    return String(setting.value);
  };

  const handleChange = (key: string, value: string) => {
    setEditedSettings({ ...editedSettings, [key]: value });
  };

  const handleSave = () => {
    if (Object.keys(editedSettings).length > 0) {
      saveMutation.mutate(editedSettings);
    }
  };

  const handleReset = (key: string) => {
    if (confirm('Reset this setting to its default value?')) {
      resetMutation.mutate(key);
      // Remove from edited settings if present
      const updated = { ...editedSettings };
      delete updated[key];
      setEditedSettings(updated);
    }
  };

  const hasChanges = Object.keys(editedSettings).length > 0;

  // Group settings by category
  const settingsByCategory = settingsData as Record<string, SettingDefinition[]> | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        Failed to load settings: {error instanceof Error ? error.message : 'Unknown error'}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure TrafegoDNS behavior. Some settings require a restart to take effect.
          </p>
        </div>
        <Button
          leftIcon={<Save className="w-4 h-4" />}
          onClick={handleSave}
          disabled={!hasChanges}
          isLoading={saveMutation.isPending}
        >
          Save Changes
        </Button>
      </div>

      {successMessage && (
        <Alert variant={restartWarning ? 'warning' : 'success'}>{successMessage}</Alert>
      )}

      {saveMutation.isError && (
        <Alert variant="error">
          Failed to save settings: {saveMutation.error instanceof Error ? saveMutation.error.message : 'Unknown error'}
        </Alert>
      )}

      {/* Settings Categories */}
      <div className="space-y-6">
        {CATEGORY_ORDER.filter(cat => settingsByCategory?.[cat]?.length).map((category) => {
          const settings = settingsByCategory?.[category] ?? [];
          return (
            <div key={category} className="card">
              <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
                {CATEGORY_LABELS[category] || category}
                <Badge variant="default" className="text-xs">
                  {settings.length} settings
                </Badge>
              </h3>
              <div className="space-y-6">
                {settings.map((setting) => (
                  <SettingInput
                    key={setting.key}
                    setting={setting}
                    value={getValue(setting)}
                    onChange={(value) => handleChange(setting.key, value)}
                    onReset={() => handleReset(setting.key)}
                    isModified={editedSettings[setting.key] !== undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="card bg-gray-50">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Setting Sources</h4>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span>Database (persisted)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>Environment variable</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            <span>Default value</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SettingInputProps {
  setting: SettingDefinition;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  isModified: boolean;
}

function SettingInput({ setting, value, onChange, onReset, isModified }: SettingInputProps) {
  const sourceColor = {
    database: 'bg-green-500',
    env: 'bg-blue-500',
    default: 'bg-gray-400',
  }[setting.source];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start pb-4 border-b border-gray-100 last:border-0 last:pb-0">
      <div className="space-y-1">
        <label className="label flex items-center gap-2">
          {setting.label}
          {setting.restartRequired && (
            <span title="Requires restart" className="text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          )}
        </label>
        <p className="text-xs text-gray-500">{setting.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-2 h-2 rounded-full ${sourceColor}`}></span>
          <span className="text-xs text-gray-400">
            {setting.source === 'database' ? 'Saved' : setting.source === 'env' ? 'From env' : 'Default'}
          </span>
          {isModified && (
            <Badge variant="warning" className="text-xs">Modified</Badge>
          )}
        </div>
      </div>
      <div className="md:col-span-2 flex gap-2">
        <div className="flex-1">
          {setting.type === 'boolean' ? (
            <select
              className="input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : setting.type === 'select' && setting.options ? (
            <select
              className="input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            >
              {setting.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={setting.type === 'number' ? 'number' : 'text'}
              className="input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Default: ${setting.default}`}
            />
          )}
        </div>
        {setting.source === 'database' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            title="Reset to default"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
