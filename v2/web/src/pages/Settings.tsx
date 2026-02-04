/**
 * Settings Page
 * Dynamic settings management with schema-driven UI and tabbed interface
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, AlertTriangle, Settings as SettingsIcon, Globe, Trash2, Server, Webhook, Shield } from 'lucide-react';
import { settingsApi } from '../api';
import { Button, Alert, Badge, Select } from '../components/common';

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

interface TabConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  categories: string[];
  description: string;
}

const TABS: TabConfig[] = [
  { id: 'general', label: 'General', icon: SettingsIcon, categories: ['general'], description: 'Core application settings' },
  { id: 'dns', label: 'DNS', icon: Globe, categories: ['dns'], description: 'Default DNS record configuration' },
  { id: 'cleanup', label: 'Cleanup', icon: Trash2, categories: ['cleanup'], description: 'Orphaned record management' },
  { id: 'integrations', label: 'Integrations', icon: Server, categories: ['traefik', 'docker'], description: 'Traefik and Docker settings' },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, categories: ['webhooks'], description: 'Webhook notification settings' },
  { id: 'security', label: 'Security', icon: Shield, categories: ['security'], description: 'Authentication and security' },
];

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  dns: 'DNS Defaults',
  cleanup: 'Cleanup',
  traefik: 'Traefik',
  docker: 'Docker',
  webhooks: 'Webhooks',
  security: 'Security',
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
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
      const updated = { ...editedSettings };
      delete updated[key];
      setEditedSettings(updated);
    }
  };

  const hasChanges = Object.keys(editedSettings).length > 0;
  const settingsByCategory = settingsData as Record<string, SettingDefinition[]> | undefined;
  const currentTab = TABS.find(t => t.id === activeTab) ?? TABS[0];

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure TrafegoDNS behavior. Some settings require a restart.
          </p>
        </div>
        <Button
          leftIcon={<Save className="w-4 h-4" />}
          onClick={handleSave}
          disabled={!hasChanges}
          isLoading={saveMutation.isPending}
        >
          {hasChanges ? `Save Changes (${Object.keys(editedSettings).length})` : 'Save Changes'}
        </Button>
      </div>

      {/* Alerts */}
      {successMessage && (
        <Alert variant={restartWarning ? 'warning' : 'success'}>{successMessage}</Alert>
      )}

      {saveMutation.isError && (
        <Alert variant="error">
          Failed to save settings: {saveMutation.error instanceof Error ? saveMutation.error.message : 'Unknown error'}
        </Alert>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tab Navigation - Vertical on large screens */}
        <div className="lg:w-56 flex-shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const settingsCount = tab.categories.reduce((acc, cat) => acc + (settingsByCategory?.[cat]?.length ?? 0), 0);

              if (settingsCount === 0) return null;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 min-w-max lg:w-full
                    ${isActive
                      ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600 dark:text-primary-400' : ''}`} />
                  <div className="flex-1">
                    <span className="font-medium">{tab.label}</span>
                    <span className={`ml-2 text-xs ${isActive ? 'text-primary-500' : 'text-gray-400'}`}>
                      {settingsCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Legend - Desktop only */}
          <div className="hidden lg:block mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Source Legend</h4>
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Saved to database</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Environment variable</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                <span>Default value</span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Content */}
        <div className="flex-1 min-w-0">
          <div className="card">
            {/* Tab Header */}
            <div className="mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-500/20">
                  <currentTab.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{currentTab.label} Settings</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{currentTab.description}</p>
                </div>
              </div>
            </div>

            {/* Settings for current tab */}
            <div className="space-y-8">
              {currentTab.categories.map((category) => {
                const settings = settingsByCategory?.[category] ?? [];
                if (settings.length === 0) return null;

                return (
                  <div key={category}>
                    {currentTab.categories.length > 1 && (
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
                        {CATEGORY_LABELS[category]}
                        <span className="text-xs font-normal text-gray-400">({settings.length})</span>
                      </h3>
                    )}
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
    database: 'bg-emerald-500',
    env: 'bg-blue-500',
    default: 'bg-gray-400',
  }[setting.source];

  const sourceLabel = {
    database: 'Saved',
    env: 'From env',
    default: 'Default',
  }[setting.source];

  return (
    <div className="group p-4 -mx-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Label and description */}
        <div className="lg:w-1/3 space-y-1">
          <label className="label flex items-center gap-2">
            {setting.label}
            {setting.restartRequired && (
              <span title="Requires restart" className="text-amber-500">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
            )}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{setting.description}</p>
          <div className="flex items-center gap-2 pt-1">
            <span className={`w-2 h-2 rounded-full ${sourceColor}`}></span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{sourceLabel}</span>
            {isModified && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">Unsaved</Badge>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="lg:flex-1 flex gap-2">
          <div className="flex-1">
            {setting.type === 'boolean' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange('true')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    value === 'true'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  onClick={() => onChange('false')}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    value === 'false'
                      ? 'bg-gray-700 text-white shadow-lg'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  Disabled
                </button>
              </div>
            ) : setting.type === 'select' && setting.options ? (
              <Select
                value={value}
                onChange={onChange}
                options={setting.options.map((opt) => ({
                  value: opt,
                  label: opt,
                }))}
              />
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
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
