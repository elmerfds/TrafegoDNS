/**
 * Providers Page
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Play } from 'lucide-react';
import { providersApi, type Provider, type CreateProviderInput, type UpdateProviderInput, type ProviderType } from '../api';
import { Button, Table, Badge, Modal, ModalFooter, Alert, Select, ProviderIcon } from '../components/common';

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ provider: Provider; result: { connected: boolean; message: string } } | null>(null);

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

      {/* Create Modal */}
      <CreateProviderModal
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
    </div>
  );
}

interface CreateProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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
};

function CreateProviderModal({ isOpen, onClose }: CreateProviderModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateProviderInput>>({
    type: 'cloudflare',
    credentials: {},
    enabled: true,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateProviderInput) => providersApi.createProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      onClose();
      setFormData({ type: 'cloudflare', credentials: {}, enabled: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create provider');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.type) {
      setError('Please fill in all required fields');
      return;
    }

    // Auto-set authMethod for Technitium based on credentials
    let credentials = { ...formData.credentials };
    if (formData.type === 'technitium' && credentials) {
      credentials = {
        ...credentials,
        authMethod: 'token', // Default to token auth
      };
    }

    createMutation.mutate({ ...formData, credentials } as CreateProviderInput);
  };

  const currentFields = providerFields[formData.type as ProviderType] ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add DNS Provider" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Name *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.name ?? ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Cloudflare"
          />
        </div>

        <div>
          <label className="label">Type *</label>
          <Select
            className="mt-1"
            value={formData.type ?? 'cloudflare'}
            onChange={(value) => setFormData({ ...formData, type: value as ProviderType, credentials: {} })}
            options={[
              { value: 'cloudflare', label: 'Cloudflare', description: 'DNS and Tunnel support' },
              { value: 'digitalocean', label: 'DigitalOcean', description: 'DNS management' },
              { value: 'route53', label: 'AWS Route53', description: 'Amazon DNS service' },
              { value: 'technitium', label: 'Technetium DNS', description: 'Self-hosted DNS' },
            ]}
          />
        </div>

        {currentFields.map((field) => (
          <div key={field.key}>
            <label className="label">{field.label}</label>
            <input
              type={field.type ?? 'text'}
              className="input mt-1"
              placeholder={field.placeholder}
              value={(formData.credentials as Record<string, string>)?.[field.key] ?? ''}
              onChange={(e) => setFormData({
                ...formData,
                credentials: {
                  ...formData.credentials,
                  [field.key]: e.target.value,
                },
              })}
            />
          </div>
        ))}

        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefault"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            checked={formData.isDefault ?? false}
            onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
          />
          <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Set as default provider
          </label>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create Provider
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface EditProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: Provider | null;
}

function EditProviderModal({ isOpen, onClose, provider }: EditProviderModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<UpdateProviderInput>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset form when provider changes
  useEffect(() => {
    if (provider) {
      setFormData({
        name: provider.name,
        enabled: provider.enabled,
        isDefault: provider.isDefault,
      });
      setError(null);
    }
  }, [provider]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Provider" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Name</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.name ?? provider.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Type</label>
          <input
            type="text"
            className="input mt-1 bg-gray-50 dark:bg-gray-800"
            value={provider.type}
            disabled
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Provider type cannot be changed</p>
        </div>

        {currentFields.map((field) => (
          <div key={field.key}>
            <label className="label">{field.label}</label>
            <input
              type={field.type ?? 'text'}
              className="input mt-1"
              placeholder="Leave blank to keep current value"
              value={(formData.credentials as Record<string, string>)?.[field.key] ?? ''}
              onChange={(e) => setFormData({
                ...formData,
                credentials: {
                  ...formData.credentials,
                  [field.key]: e.target.value,
                },
              })}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave blank to keep current value</p>
          </div>
        ))}

        <div className="space-y-2">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="editEnabled"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              checked={formData.enabled ?? provider.enabled}
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
              checked={formData.isDefault ?? provider.isDefault}
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
    </Modal>
  );
}
