/**
 * Providers Page
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Play, Search, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { providersApi, type Provider, type UpdateProviderInput, type ProviderType, type DiscoverRecordsResult } from '../api';
import { Button, Table, Badge, Modal, ModalFooter, Alert, Select, ProviderIcon } from '../components/common';
import { ProviderWizard } from '../components/providers';

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ provider: Provider; result: { connected: boolean; message: string } } | null>(null);
  const [discoverResult, setDiscoverResult] = useState<{ provider: Provider; result: DiscoverRecordsResult } | null>(null);

  const { data: providers, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => providersApi.deleteProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setDeleteProvider(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => providersApi.testProvider(id),
    onSuccess: (result, id) => {
      const provider = providers?.find((p) => p.id === id);
      if (provider) {
        setTestResult({ provider, result });
      }
    },
  });

  const discoverMutation = useMutation({
    mutationFn: (id: string) => providersApi.discoverRecords(id),
    onSuccess: (result, id) => {
      const provider = providers?.find((p) => p.id === id);
      if (provider) {
        setDiscoverResult({ provider, result });
      }
      queryClient.invalidateQueries({ queryKey: ['dnsRecords'] });
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Provider) => (
        <div className="flex items-center">
          <ProviderIcon type={row.type} className="w-6 h-6 mr-3" />
          <span className="font-medium text-gray-900 dark:text-white">{row.name}</span>
          {row.isDefault && (
            <Badge variant="info" size="sm" className="ml-2">
              Default
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: Provider) => (
        <Badge variant="default">{row.type}</Badge>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (row: Provider) => (
        <Badge variant={row.enabled ? 'success' : 'warning'}>
          {row.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: Provider) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Provider) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-green-600"
            onClick={() => testMutation.mutate(row.id)}
            title="Test connection"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-blue-600"
            onClick={() => discoverMutation.mutate(row.id)}
            title="Discover records from provider"
            disabled={discoverMutation.isPending}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-gray-600"
            onClick={() => setEditProvider(row)}
            title="Edit provider"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600"
            onClick={() => setDeleteProvider(row)}
            title="Delete provider"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">DNS Providers</h2>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Add Provider
        </Button>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={providers ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No providers configured"
        />
      </div>

      {/* Create Wizard */}
      <ProviderWizard
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Edit Modal */}
      <EditProviderModal
        isOpen={!!editProvider}
        onClose={() => setEditProvider(null)}
        provider={editProvider}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteProvider}
        onClose={() => setDeleteProvider(null)}
        title="Delete Provider"
        size="sm"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to delete <strong className="text-gray-900 dark:text-white">{deleteProvider?.name}</strong>?
          This will not delete any DNS records managed by this provider.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteProvider(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteProvider && deleteMutation.mutate(deleteProvider.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {/* Test Result Modal */}
      <Modal
        isOpen={!!testResult}
        onClose={() => setTestResult(null)}
        title="Connection Test Result"
        size="sm"
      >
        {testResult && (
          <Alert
            variant={testResult.result.connected ? 'success' : 'error'}
            title={testResult.provider.name}
          >
            {testResult.result.message}
          </Alert>
        )}
        <ModalFooter>
          <Button onClick={() => setTestResult(null)}>Close</Button>
        </ModalFooter>
      </Modal>

      {/* Discover Records Result Modal */}
      <Modal
        isOpen={!!discoverResult}
        onClose={() => setDiscoverResult(null)}
        title="Discover Records Result"
        size="sm"
      >
        {discoverResult && (
          <div className="space-y-4">
            <Alert
              variant={discoverResult.result.imported > 0 ? 'success' : 'info'}
              title={discoverResult.provider.name}
            >
              Discovered {discoverResult.result.imported} new records from provider
            </Alert>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Total at provider:</span>
                <span className="font-medium text-gray-900 dark:text-white">{discoverResult.result.totalAtProvider}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Imported:</span>
                <span className="font-medium text-green-600">{discoverResult.result.imported}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Already in database:</span>
                <span className="font-medium text-gray-900 dark:text-white">{discoverResult.result.skipped}</span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Managed (TrafegoDNS-owned):</span>
                  <span className="font-medium text-blue-600">{discoverResult.result.managed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Unmanaged (pre-existing):</span>
                  <span className="font-medium text-amber-600">{discoverResult.result.unmanaged}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Unmanaged records are protected from automatic deletion during orphan cleanup.
            </p>
          </div>
        )}
        <ModalFooter>
          <Button onClick={() => setDiscoverResult(null)}>Close</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

// ── providerFields used by EditProviderModal ─────────────────────────────

const providerFields: Record<ProviderType, Array<{ key: string; label: string; type?: string; placeholder?: string }>> = {
  cloudflare: [
    { key: 'apiToken', label: 'API Token *' },
    { key: 'zoneName', label: 'Zone Name *', placeholder: 'example.com' },
    { key: 'zoneId', label: 'Zone ID (optional)' },
    { key: 'accountId', label: 'Account ID (for tunnels)' },
  ],
  digitalocean: [
    { key: 'apiToken', label: 'API Token *' },
    { key: 'domain', label: 'Domain *', placeholder: 'example.com' },
  ],
  route53: [
    { key: 'accessKeyId', label: 'Access Key ID *' },
    { key: 'secretAccessKey', label: 'Secret Access Key *' },
    { key: 'zoneName', label: 'Zone Name *', placeholder: 'example.com' },
    { key: 'hostedZoneId', label: 'Hosted Zone ID (optional)' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
  ],
  technitium: [
    { key: 'url', label: 'Server URL *', placeholder: 'http://technitium:5380' },
    { key: 'zone', label: 'Zone *', placeholder: 'example.com' },
    { key: 'apiToken', label: 'API Token *' },
  ],
  adguard: [
    { key: 'url', label: 'Server URL *', placeholder: 'http://adguard:80' },
    { key: 'username', label: 'Username *', placeholder: 'Admin username' },
    { key: 'password', label: 'Password *', type: 'password' },
    { key: 'domain', label: 'Domain Filter', placeholder: 'example.com (optional)' },
  ],
  pihole: [
    { key: 'url', label: 'Server URL *', placeholder: 'http://pihole:80' },
    { key: 'password', label: 'Web Password *', type: 'password' },
    { key: 'domain', label: 'Domain Filter', placeholder: 'example.com (optional)' },
  ],
  rfc2136: [
    { key: 'server', label: 'DNS Server *', placeholder: '192.168.1.1 or ns1.example.com' },
    { key: 'port', label: 'Port', placeholder: '53' },
    { key: 'zone', label: 'Zone *', placeholder: 'example.com' },
    { key: 'keyName', label: 'TSIG Key Name' },
    { key: 'keyAlgorithm', label: 'TSIG Algorithm', placeholder: 'hmac-sha256' },
    { key: 'keySecret', label: 'TSIG Secret', type: 'password' },
  ],
};

interface EditProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: Provider | null;
}

// Types for provider defaults
interface ProviderDefaults {
  recordType?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  publicIp?: string;
  publicIpv6?: string;
}

interface ProviderDefaultsSectionProps {
  provider: Provider;
  formData: Partial<UpdateProviderInput>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<UpdateProviderInput>>>;
}

function ProviderDefaultsSection({ provider, formData, setFormData }: ProviderDefaultsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get current defaults from provider settings or formData
  const currentSettings = formData.settings ?? provider.settings ?? {};
  const defaults: ProviderDefaults = (currentSettings.defaults as ProviderDefaults) ?? {};

  const updateDefaults = (key: keyof ProviderDefaults, value: string | number | boolean | undefined) => {
    const newDefaults = { ...defaults };
    if (value === '' || value === undefined) {
      delete newDefaults[key];
    } else {
      (newDefaults as Record<string, unknown>)[key] = value;
    }

    // Clean up empty defaults object
    const hasDefaults = Object.keys(newDefaults).length > 0;

    setFormData({
      ...formData,
      settings: {
        ...currentSettings,
        defaults: hasDefaults ? newDefaults : undefined,
      },
    });
  };

  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <Settings className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Default Record Settings
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Override global defaults for this provider. Leave empty to use global settings.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Default Record Type */}
            <div>
              <label className="label text-xs">Default Record Type</label>
              <div className="mt-1">
                <Select
                  options={[
                    { value: '', label: 'Use global default' },
                    ...recordTypes.map((type) => ({ value: type, label: type })),
                  ]}
                  value={defaults.recordType ?? ''}
                  onChange={(value) => updateDefaults('recordType', value || undefined)}
                  size="sm"
                />
              </div>
            </div>

            {/* Default TTL */}
            <div>
              <label className="label text-xs">Default TTL (seconds)</label>
              <input
                type="number"
                className="input mt-1 text-sm"
                placeholder="Use global default"
                min={1}
                value={defaults.ttl ?? ''}
                onChange={(e) => updateDefaults('ttl', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              />
            </div>
          </div>

          {/* Default Content */}
          <div>
            <label className="label text-xs">Default Content</label>
            <input
              type="text"
              className="input mt-1 text-sm"
              placeholder="Use global default (e.g., auto-detected IP)"
              value={defaults.content ?? ''}
              onChange={(e) => updateDefaults('content', e.target.value || undefined)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{public_ip}}'}</code> or <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{public_ipv6}}'}</code> for auto-detection
            </p>
          </div>

          {/* IP Overrides */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Public IP Override (IPv4)</label>
              <input
                type="text"
                className="input mt-1 text-sm"
                placeholder="Auto-detect"
                value={defaults.publicIp ?? ''}
                onChange={(e) => updateDefaults('publicIp', e.target.value || undefined)}
              />
            </div>

            <div>
              <label className="label text-xs">Public IPv6 Override</label>
              <input
                type="text"
                className="input mt-1 text-sm"
                placeholder="Auto-detect"
                value={defaults.publicIpv6 ?? ''}
                onChange={(e) => updateDefaults('publicIpv6', e.target.value || undefined)}
              />
            </div>
          </div>

          {/* Proxied (Cloudflare only) */}
          {provider.type === 'cloudflare' && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="defaultProxied"
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                checked={defaults.proxied ?? false}
                onChange={(e) => updateDefaults('proxied', e.target.checked || undefined)}
              />
              <label htmlFor="defaultProxied" className="text-sm text-gray-700 dark:text-gray-300">
                Enable Cloudflare proxy by default
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditProviderModal({ isOpen, onClose, provider }: EditProviderModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<UpdateProviderInput>>({});
  const [error, setError] = useState<string | null>(null);

  // Fetch full provider details (including settings) when modal opens
  const { data: fullProvider, isLoading: isLoadingProvider } = useQuery({
    queryKey: ['provider', provider?.id],
    queryFn: () => provider ? providersApi.getProvider(provider.id) : Promise.resolve(null),
    enabled: isOpen && !!provider,
  });

  // Reset form when full provider data loads
  useEffect(() => {
    if (fullProvider) {
      setFormData({
        name: fullProvider.name,
        enabled: fullProvider.enabled,
        isDefault: fullProvider.isDefault,
        settings: fullProvider.settings,
      });
      setError(null);
    } else if (provider && !isOpen) {
      // Reset form data when modal closes
      setFormData({});
    }
  }, [fullProvider, provider, isOpen]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProviderInput }) =>
      providersApi.updateProvider(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    updateMutation.mutate({ id: provider.id, data: formData as UpdateProviderInput });
  };

  if (!provider) return null;

  const currentFields = providerFields[provider.type as ProviderType] ?? [];
  const displayProvider = fullProvider ?? provider;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Provider" size="md">
      {isLoadingProvider ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Name</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.name ?? displayProvider.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Type</label>
          <input
            type="text"
            className="input mt-1 bg-gray-50 dark:bg-gray-800"
            value={displayProvider.type}
            disabled
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Provider type cannot be changed</p>
        </div>

        {currentFields.map((field) => {
          const currentValue = displayProvider.credentials?.[field.key];
          const isSensitive = currentValue?.startsWith('••••');
          const newValue = (formData.credentials as Record<string, string>)?.[field.key];

          return (
            <div key={field.key}>
              <label className="label">{field.label}</label>
              {currentValue && !newValue && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Current: <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">{currentValue}</span>
                </div>
              )}
              <input
                type={field.type ?? 'text'}
                className="input mt-1"
                placeholder={currentValue ? 'Leave blank to keep current value' : field.placeholder}
                value={newValue ?? ''}
                onChange={(e) => setFormData({
                  ...formData,
                  credentials: {
                    ...formData.credentials,
                    [field.key]: e.target.value,
                  },
                })}
              />
              {currentValue && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isSensitive ? 'Leave blank to keep current value' : 'Enter a new value to update'}
                </p>
              )}
            </div>
          );
        })}

        {/* Default Record Settings */}
        <ProviderDefaultsSection
          provider={displayProvider}
          formData={formData}
          setFormData={setFormData}
        />

        <div className="space-y-2">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="editEnabled"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.enabled ?? displayProvider.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <label htmlFor="editEnabled" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Enabled
            </label>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="editIsDefault"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
              checked={formData.isDefault ?? displayProvider.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            />
            <label htmlFor="editIsDefault" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Set as default provider
            </label>
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save Changes
          </Button>
        </ModalFooter>
      </form>
      )}
    </Modal>
  );
}
