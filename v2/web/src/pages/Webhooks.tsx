/**
 * Webhooks Page
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Play } from 'lucide-react';
import { webhooksApi, type Webhook, type CreateWebhookInput, type WebhookEventType } from '../api';
import { Button, Table, Badge, Modal, ModalFooter, Alert } from '../components/common';

const WEBHOOK_EVENTS: { value: WebhookEventType; label: string }[] = [
  { value: 'dns.record.created', label: 'DNS Record Created' },
  { value: 'dns.record.updated', label: 'DNS Record Updated' },
  { value: 'dns.record.deleted', label: 'DNS Record Deleted' },
  { value: 'dns.record.orphaned', label: 'DNS Record Orphaned' },
  { value: 'tunnel.created', label: 'Tunnel Created' },
  { value: 'tunnel.deployed', label: 'Tunnel Deployed' },
  { value: 'system.sync.completed', label: 'Sync Completed' },
  { value: 'system.error', label: 'System Error' },
];

export function WebhooksPage() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteWebhook, setDeleteWebhook] = useState<Webhook | null>(null);
  const [testResult, setTestResult] = useState<{ webhook: Webhook; result: { delivered: boolean; message: string } } | null>(null);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => webhooksApi.listWebhooks(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setDeleteWebhook(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksApi.testWebhook(id),
    onSuccess: (result, id) => {
      const webhook = webhooks?.find((w) => w.id === id);
      if (webhook) {
        setTestResult({ webhook, result });
      }
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Webhook) => (
        <span className="font-medium text-gray-900">{row.name}</span>
      ),
    },
    {
      key: 'url',
      header: 'URL',
      render: (row: Webhook) => (
        <span className="font-mono text-xs truncate max-w-xs block">{row.url}</span>
      ),
    },
    {
      key: 'events',
      header: 'Events',
      render: (row: Webhook) => (
        <span className="text-sm">{row.events.length} events</span>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (row: Webhook) => (
        <Badge variant={row.enabled ? 'success' : 'warning'}>
          {row.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Webhook) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-green-600"
            onClick={() => testMutation.mutate(row.id)}
            title="Test webhook"
          >
            <Play className="w-4 h-4" />
          </button>
          <button className="p-1 text-gray-400 hover:text-gray-600">
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600"
            onClick={() => setDeleteWebhook(row)}
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
        <div>
          <h2 className="text-lg font-medium text-gray-900">Webhooks</h2>
          <p className="text-sm text-gray-500">
            Receive notifications when DNS events occur
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Add Webhook
        </Button>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={webhooks ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No webhooks configured"
        />
      </div>

      {/* Create Modal */}
      <CreateWebhookModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteWebhook}
        onClose={() => setDeleteWebhook(null)}
        title="Delete Webhook"
        size="sm"
      >
        <p className="text-sm text-gray-500">
          Are you sure you want to delete webhook <strong>{deleteWebhook?.name}</strong>?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteWebhook(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteWebhook && deleteMutation.mutate(deleteWebhook.id)}
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
        title="Webhook Test Result"
        size="sm"
      >
        {testResult && (
          <Alert
            variant={testResult.result.delivered ? 'success' : 'error'}
            title={testResult.webhook.name}
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

interface CreateWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateWebhookModal({ isOpen, onClose }: CreateWebhookModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateWebhookInput>>({
    events: [],
    enabled: true,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateWebhookInput) => webhooksApi.createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      onClose();
      setFormData({ events: [], enabled: true });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create webhook');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url || !formData.events?.length) {
      setError('Please fill in all required fields');
      return;
    }
    createMutation.mutate(formData as CreateWebhookInput);
  };

  const toggleEvent = (event: WebhookEventType) => {
    const events = formData.events ?? [];
    if (events.includes(event)) {
      setFormData({ ...formData, events: events.filter((e: WebhookEventType) => e !== event) });
    } else {
      setFormData({ ...formData, events: [...events, event] });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Webhook" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Name *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.name ?? ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Webhook"
          />
        </div>

        <div>
          <label className="label">URL *</label>
          <input
            type="url"
            className="input mt-1"
            value={formData.url ?? ''}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            placeholder="https://example.com/webhook"
          />
        </div>

        <div>
          <label className="label">Secret (optional)</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.secret ?? ''}
            onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            placeholder="HMAC signing secret"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used to sign webhook payloads for verification
          </p>
        </div>

        <div>
          <label className="label">Events *</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event.value} className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  checked={formData.events?.includes(event.value) ?? false}
                  onChange={() => toggleEvent(event.value)}
                />
                <span className="ml-2 text-sm text-gray-700">{event.label}</span>
              </label>
            ))}
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create Webhook
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
