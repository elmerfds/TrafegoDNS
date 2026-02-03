/**
 * Tunnels Page
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Rocket, ExternalLink } from 'lucide-react';
import { tunnelsApi, type Tunnel, type CreateTunnelInput } from '../api';
import { Button, Table, Badge, Modal, ModalFooter, Alert } from '../components/common';

export function TunnelsPage() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTunnel, setDeleteTunnel] = useState<Tunnel | null>(null);
  const [selectedTunnel, setSelectedTunnel] = useState<Tunnel | null>(null);

  const { data: tunnels, isLoading } = useQuery({
    queryKey: ['tunnels'],
    queryFn: () => tunnelsApi.listTunnels(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tunnelsApi.deleteTunnel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      setDeleteTunnel(null);
    },
  });

  const deployMutation = useMutation({
    mutationFn: (id: string) => tunnelsApi.deployTunnel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
    },
  });

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Tunnel) => (
        <button
          className="font-medium text-primary-600 hover:text-primary-800"
          onClick={() => setSelectedTunnel(row)}
        >
          {row.name}
        </button>
      ),
    },
    {
      key: 'externalTunnelId',
      header: 'Tunnel ID',
      render: (row: Tunnel) => (
        <span className="font-mono text-xs">{row.externalTunnelId.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Tunnel) => (
        <Badge
          variant={
            row.status === 'active' ? 'success' :
            row.status === 'degraded' ? 'warning' :
            row.status === 'deleted' ? 'error' : 'default'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'ingressRules',
      header: 'Routes',
      render: (row: Tunnel) => (
        <span className="text-sm">{row.ingressRules?.length ?? 0} routes</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: Tunnel) => (
        <span className="text-xs text-gray-500">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Tunnel) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-green-600"
            onClick={() => deployMutation.mutate(row.id)}
            title="Deploy tunnel"
          >
            <Rocket className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600"
            onClick={() => setDeleteTunnel(row)}
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
          <h2 className="text-lg font-medium text-gray-900">Cloudflare Tunnels</h2>
          <p className="text-sm text-gray-500">
            Manage Cloudflare Tunnels for secure access to internal services
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Create Tunnel
        </Button>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={tunnels ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No tunnels configured. Tunnels require a Cloudflare provider with Account ID."
        />
      </div>

      {/* Create Modal */}
      <CreateTunnelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Tunnel Detail Modal */}
      <TunnelDetailModal
        tunnel={selectedTunnel}
        onClose={() => setSelectedTunnel(null)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTunnel}
        onClose={() => setDeleteTunnel(null)}
        title="Delete Tunnel"
        size="sm"
      >
        <p className="text-sm text-gray-500">
          Are you sure you want to delete tunnel <strong>{deleteTunnel?.name}</strong>?
          This will remove the tunnel from Cloudflare.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteTunnel(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteTunnel && deleteMutation.mutate(deleteTunnel.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

interface CreateTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateTunnelModal({ isOpen, onClose }: CreateTunnelModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateTunnelInput>>({});
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateTunnelInput) => tunnelsApi.createTunnel(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      onClose();
      setFormData({});
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create tunnel');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setError('Please provide a tunnel name');
      return;
    }
    createMutation.mutate(formData as CreateTunnelInput);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Tunnel" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Tunnel Name *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.name ?? ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="my-tunnel"
          />
        </div>

        <div>
          <label className="label">Secret (optional)</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.secret ?? ''}
            onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
            placeholder="Leave empty to auto-generate"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used for running cloudflared connector. Auto-generated if not provided.
          </p>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create Tunnel
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface TunnelDetailModalProps {
  tunnel: Tunnel | null;
  onClose: () => void;
}

function TunnelDetailModal({ tunnel, onClose }: TunnelDetailModalProps) {
  if (!tunnel) return null;

  return (
    <Modal isOpen={!!tunnel} onClose={onClose} title={tunnel.name} size="lg">
      <div className="space-y-6">
        {/* Tunnel Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <Badge
              variant={
                tunnel.status === 'active' ? 'success' :
                tunnel.status === 'degraded' ? 'warning' : 'error'
              }
            >
              {tunnel.status}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tunnel ID</p>
            <p className="font-mono text-sm">{tunnel.externalTunnelId}</p>
          </div>
        </div>

        {/* Ingress Rules */}
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-3">Ingress Rules</h4>
          {tunnel.ingressRules && tunnel.ingressRules.length > 0 ? (
            <div className="border rounded-lg divide-y">
              {tunnel.ingressRules.map((rule) => (
                <div key={rule.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{rule.hostname}</p>
                    <p className="text-xs text-gray-500">{rule.path ?? '/*'}</p>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <span className="font-mono">{rule.service}</span>
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">
              No ingress rules configured
            </p>
          )}
        </div>
      </div>
      <ModalFooter>
        <Button onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
