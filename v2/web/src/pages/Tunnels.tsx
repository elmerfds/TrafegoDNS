/**
 * Tunnels Page
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Rocket, AlertTriangle, Key, Tag, Globe,
  Copy, Check, Terminal, Info, Edit, X, Route, Server, Link2
} from 'lucide-react';
import { tunnelsApi, type Tunnel, type CreateTunnelInput, type TunnelTokenResponse, type AddIngressRuleInput, type IngressRule } from '../api';
import { Button, Table, Badge, Modal, ModalFooter, Alert } from '../components/common';

// ---------------------------------------------------------------------------
// Helper: Copy button with feedback
// ---------------------------------------------------------------------------
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
      title={label ?? 'Copy to clipboard'}
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helper: Copyable code block
// ---------------------------------------------------------------------------
function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative">
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
          <CopyButton text={code} />
        </div>
      )}
      {!label && (
        <div className="absolute top-2 right-2 z-10">
          <CopyButton text={code} />
        </div>
      )}
      <pre className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
}

// ===========================================================================
// Main Page
// ===========================================================================
export function TunnelsPage() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdTunnel, setCreatedTunnel] = useState<Tunnel | null>(null);
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
        <span className="text-xs text-gray-500 dark:text-gray-400">
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
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Cloudflare Tunnels</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
        onCreated={(tunnel) => {
          setIsCreateModalOpen(false);
          setCreatedTunnel(tunnel);
        }}
      />

      {/* Tunnel Created Success Modal */}
      <TunnelCreatedModal
        tunnel={createdTunnel}
        onClose={() => setCreatedTunnel(null)}
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
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">This action cannot be undone</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">This will remove the tunnel from Cloudflare. Services routing through <strong>{deleteTunnel?.name}</strong> will become inaccessible.</p>
          </div>
        </div>
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

// ===========================================================================
// Create Tunnel Modal
// ===========================================================================
interface CreateTunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tunnel: Tunnel) => void;
}

function CreateTunnelModal({ isOpen, onClose, onCreated }: CreateTunnelModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateTunnelInput>>({});
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateTunnelInput) => tunnelsApi.createTunnel(data),
    onSuccess: (tunnel) => {
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      setFormData({});
      setError(null);
      onCreated(tunnel);
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

  const handleClose = () => {
    setFormData({});
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Tunnel" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <Globe className="w-4 h-4 text-primary-500" />
            Tunnel Configuration
          </div>

          <div>
            <label className="label">Tunnel Name *</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="input mt-1 pl-10"
                value={formData.name ?? ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="my-tunnel"
              />
            </div>
          </div>

          <div>
            <label className="label">Secret (optional)</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="input mt-1 pl-10"
                value={formData.secret ?? ''}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                placeholder="Leave empty to auto-generate"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Used for running cloudflared connector. Auto-generated if not provided.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={handleClose} type="button">
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

// ===========================================================================
// Tunnel Created Modal (shows token + commands)
// ===========================================================================
interface TunnelCreatedModalProps {
  tunnel: Tunnel | null;
  onClose: () => void;
}

function TunnelCreatedModal({ tunnel, onClose }: TunnelCreatedModalProps) {
  const { data: tokenData, isLoading } = useQuery<TunnelTokenResponse>({
    queryKey: ['tunnel-token', tunnel?.id],
    queryFn: () => tunnelsApi.getTunnelToken(tunnel!.id),
    enabled: !!tunnel,
  });

  if (!tunnel) return null;

  return (
    <Modal isOpen={!!tunnel} onClose={onClose} title="Tunnel Created Successfully" size="lg">
      <div className="space-y-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : tokenData ? (
          <>
            {/* Success banner */}
            <Alert variant="success" title="Tunnel Ready">
              Your tunnel <strong>{tokenData.tunnelName}</strong> has been created. Use the connector token below to run cloudflared.
            </Alert>

            {/* Token */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                <Key className="w-4 h-4 text-primary-500" />
                Connector Token
              </div>
              <CodeBlock code={tokenData.token} />
            </div>

            {/* Docker Run */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                <Terminal className="w-4 h-4 text-primary-500" />
                Docker Run Command
              </div>
              <CodeBlock code={tokenData.dockerRunCommand} />
            </div>

            {/* Docker Compose */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                <Server className="w-4 h-4 text-primary-500" />
                Docker Compose
              </div>
              <CodeBlock code={tokenData.dockerComposeSnippet} />
            </div>

            {/* Info note */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Save this token</p>
                <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                  This token is required to connect cloudflared to your tunnel. Store it securely -- you can always retrieve it again from the tunnel details.
                </p>
              </div>
            </div>
          </>
        ) : (
          <Alert variant="error">Failed to retrieve tunnel token. You can access it later from the tunnel details.</Alert>
        )}
      </div>
      <ModalFooter>
        <Button onClick={onClose}>Done</Button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Tunnel Detail Modal (info, connector, ingress CRUD)
// ===========================================================================
interface TunnelDetailModalProps {
  tunnel: Tunnel | null;
  onClose: () => void;
}

function TunnelDetailModal({ tunnel, onClose }: TunnelDetailModalProps) {
  const queryClient = useQueryClient();
  const [showConnector, setShowConnector] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [editingRule, setEditingRule] = useState<IngressRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<IngressRule | null>(null);
  const [autoRuleWarning, setAutoRuleWarning] = useState<{ rule: IngressRule; action: 'edit' | 'delete' } | null>(null);

  // Fetch token only when connector section is shown
  const { data: tokenData, isLoading: tokenLoading } = useQuery<TunnelTokenResponse>({
    queryKey: ['tunnel-token', tunnel?.id],
    queryFn: () => tunnelsApi.getTunnelToken(tunnel!.id),
    enabled: !!tunnel && showConnector,
  });

  // Refetch tunnel for fresh ingress data
  const { data: freshTunnel } = useQuery({
    queryKey: ['tunnel', tunnel?.id],
    queryFn: () => tunnelsApi.getTunnel(tunnel!.id),
    enabled: !!tunnel,
  });

  const activeTunnel = freshTunnel ?? tunnel;

  // Add route mutation
  const addRouteMutation = useMutation({
    mutationFn: ({ tunnelId, data }: { tunnelId: string; data: AddIngressRuleInput }) =>
      tunnelsApi.addIngressRule(tunnelId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnel', tunnel?.id] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      setShowAddRoute(false);
    },
  });

  // Update route mutation
  const updateRouteMutation = useMutation({
    mutationFn: ({ tunnelId, hostname, data }: { tunnelId: string; hostname: string; data: AddIngressRuleInput }) =>
      tunnelsApi.updateIngressRule(tunnelId, hostname, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnel', tunnel?.id] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      setEditingRule(null);
    },
  });

  // Delete route mutation
  const removeRouteMutation = useMutation({
    mutationFn: ({ tunnelId, hostname }: { tunnelId: string; hostname: string }) =>
      tunnelsApi.removeIngressRule(tunnelId, hostname),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnel', tunnel?.id] });
      queryClient.invalidateQueries({ queryKey: ['tunnels'] });
      setDeleteRule(null);
    },
  });

  const handleClose = () => {
    setShowConnector(false);
    setShowAddRoute(false);
    setEditingRule(null);
    setDeleteRule(null);
    setAutoRuleWarning(null);
    onClose();
  };

  // Intercept edit/delete for auto rules
  const handleEditRule = (rule: IngressRule) => {
    if (rule.source === 'auto') {
      setAutoRuleWarning({ rule, action: 'edit' });
    } else {
      setEditingRule(rule);
    }
  };

  const handleDeleteRule = (rule: IngressRule) => {
    if (rule.source === 'auto') {
      setAutoRuleWarning({ rule, action: 'delete' });
    } else {
      setDeleteRule(rule);
    }
  };

  const confirmAutoRuleAction = () => {
    if (!autoRuleWarning) return;
    if (autoRuleWarning.action === 'edit') {
      setEditingRule(autoRuleWarning.rule);
    } else {
      setDeleteRule(autoRuleWarning.rule);
    }
    setAutoRuleWarning(null);
  };

  if (!tunnel) return null;

  return (
    <>
      <Modal isOpen={!!tunnel} onClose={handleClose} title={activeTunnel?.name ?? tunnel.name} size="lg">
        <div className="space-y-6">
          {/* Tunnel Info */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <Globe className="w-4 h-4 text-primary-500" />
              Tunnel Information
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                <Badge
                  variant={
                    (activeTunnel?.status ?? tunnel.status) === 'active' ? 'success' :
                    (activeTunnel?.status ?? tunnel.status) === 'degraded' ? 'warning' : 'error'
                  }
                >
                  {activeTunnel?.status ?? tunnel.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tunnel ID</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white break-all">{tunnel.externalTunnelId}</p>
              </div>
            </div>
          </div>

          {/* Connector Section */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                <Terminal className="w-4 h-4 text-primary-500" />
                Connector
              </div>
              <button
                type="button"
                onClick={() => setShowConnector(!showConnector)}
                className="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
              >
                {showConnector ? 'Hide' : 'Show Token & Commands'}
              </button>
            </div>

            {showConnector && (
              <div className="space-y-4">
                {tokenLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                  </div>
                ) : tokenData ? (
                  <>
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Token</span>
                      <CodeBlock code={tokenData.token} />
                    </div>
                    <CodeBlock code={tokenData.dockerRunCommand} label="Docker Run Command" />
                    <CodeBlock code={tokenData.dockerComposeSnippet} label="Docker Compose" />
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                    Failed to load connector token.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Ingress Rules */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                <Route className="w-4 h-4 text-primary-500" />
                Ingress Rules
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus className="w-3 h-3" />}
                onClick={() => { setShowAddRoute(true); setEditingRule(null); }}
              >
                Add Route
              </Button>
            </div>

            {/* Add Route Inline Form */}
            {showAddRoute && (
              <IngressRuleForm
                tunnelId={tunnel.id}
                onSubmit={(data) => addRouteMutation.mutate({ tunnelId: tunnel.id, data })}
                onCancel={() => setShowAddRoute(false)}
                isLoading={addRouteMutation.isPending}
                error={addRouteMutation.isError ? (addRouteMutation.error instanceof Error ? addRouteMutation.error.message : 'Failed to add route') : null}
              />
            )}

            {/* Edit Route Inline Form */}
            {editingRule && (
              <IngressRuleForm
                tunnelId={tunnel.id}
                initialData={editingRule}
                onSubmit={(data) => updateRouteMutation.mutate({ tunnelId: tunnel.id, hostname: editingRule.hostname, data })}
                onCancel={() => setEditingRule(null)}
                isLoading={updateRouteMutation.isPending}
                error={updateRouteMutation.isError ? (updateRouteMutation.error instanceof Error ? updateRouteMutation.error.message : 'Failed to update route') : null}
              />
            )}

            {/* Rules list */}
            {activeTunnel?.ingressRules && activeTunnel.ingressRules.length > 0 ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {activeTunnel.ingressRules.map((rule) => (
                  <div key={rule.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{rule.hostname}</p>
                        {rule.source === 'auto' && (
                          <Badge variant="info">Auto</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate">{rule.service}</span>
                        {rule.path && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{rule.path}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                        onClick={() => handleEditRule(rule)}
                        title="Edit route"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        onClick={() => handleDeleteRule(rule)}
                        title="Delete route"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No ingress rules configured
              </p>
            )}
          </div>
        </div>
        <ModalFooter>
          <Button onClick={handleClose}>Close</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Route Confirmation */}
      <Modal
        isOpen={!!deleteRule}
        onClose={() => setDeleteRule(null)}
        title="Delete Route"
        size="sm"
      >
        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Remove ingress rule</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              Traffic to <strong>{deleteRule?.hostname}</strong> will no longer be routed through this tunnel.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteRule(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteRule && removeRouteMutation.mutate({ tunnelId: tunnel.id, hostname: deleteRule.hostname })}
            isLoading={removeRouteMutation.isPending}
          >
            Delete Route
          </Button>
        </ModalFooter>
      </Modal>

      {/* Auto Rule Warning */}
      <Modal
        isOpen={!!autoRuleWarning}
        onClose={() => setAutoRuleWarning(null)}
        title="Auto-Managed Route"
        size="sm"
      >
        <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">This route is auto-managed</p>
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
              The route for <strong>{autoRuleWarning?.rule.hostname}</strong> was automatically created from container labels.
              {autoRuleWarning?.action === 'edit'
                ? ' Manual edits may be overwritten on the next sync cycle.'
                : ' It may be recreated automatically if the source container is still running.'}
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setAutoRuleWarning(null)}>
            Cancel
          </Button>
          <Button
            variant={autoRuleWarning?.action === 'delete' ? 'danger' : 'primary'}
            onClick={confirmAutoRuleAction}
          >
            {autoRuleWarning?.action === 'edit' ? 'Edit Anyway' : 'Delete Anyway'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

// ===========================================================================
// Ingress Rule Inline Form (used for add and edit)
// ===========================================================================
interface IngressRuleFormProps {
  tunnelId?: string;
  initialData?: IngressRule;
  onSubmit: (data: AddIngressRuleInput) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}

function IngressRuleForm({ initialData, onSubmit, onCancel, isLoading, error }: IngressRuleFormProps) {
  const [hostname, setHostname] = useState(initialData?.hostname ?? '');
  const [service, setService] = useState(initialData?.service ?? '');
  const [path, setPath] = useState(initialData?.path ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim() || !service.trim()) {
      setFormError('Hostname and service are required');
      return;
    }
    setFormError(null);
    onSubmit({
      hostname: hostname.trim(),
      service: service.trim(),
      ...(path.trim() ? { path: path.trim() } : {}),
    });
  };

  const displayError = formError || error;

  return (
    <form onSubmit={handleSubmit} className="border border-primary-200 dark:border-primary-800 rounded-lg p-3 space-y-3 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
          {initialData ? 'Edit Route' : 'New Route'}
        </span>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {displayError && (
        <Alert variant="error" onClose={() => setFormError(null)}>{displayError}</Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Hostname *</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="input mt-1 pl-10"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.example.com"
            />
          </div>
        </div>
        <div>
          <label className="label">Service *</label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="input mt-1 pl-10"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>
        </div>
        <div>
          <label className="label">Path</label>
          <div className="relative">
            <Route className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              className="input mt-1 pl-10"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={isLoading}>
          {initialData ? 'Update Route' : 'Add Route'}
        </Button>
      </div>
    </form>
  );
}
