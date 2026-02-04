/**
 * DNS Records Page
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, Edit } from 'lucide-react';
import { dnsApi, providersApi, type DNSRecord, type CreateDNSRecordInput, type UpdateDNSRecordInput } from '../api';
import { Button, Table, Pagination, Badge, Modal, ModalFooter, Alert, Select } from '../components/common';

export function DNSRecordsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DNSRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DNSRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dns-records', { page, limit: 20 }],
    queryFn: () => dnsApi.listRecords({ page, limit: 20 }),
  });

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  const syncMutation = useMutation({
    mutationFn: () => dnsApi.syncRecords(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dnsApi.deleteRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      setDeleteRecord(null);
    },
  });

  const columns = [
    {
      key: 'hostname',
      header: 'Hostname',
      render: (row: DNSRecord) => (
        <span className="font-medium text-gray-900">{row.hostname}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: DNSRecord) => (
        <Badge variant="info">{row.type}</Badge>
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (row: DNSRecord) => (
        <span className="font-mono text-xs">{row.content}</span>
      ),
    },
    {
      key: 'ttl',
      header: 'TTL',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: DNSRecord) => (
        <Badge
          variant={
            row.status === 'active' ? 'success' :
            row.status === 'orphaned' ? 'warning' :
            row.status === 'error' ? 'error' : 'default'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: DNSRecord) => (
        <span className="text-xs text-gray-500">{row.source}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: DNSRecord) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-gray-600"
            onClick={() => setEditRecord(row)}
            title="Edit record"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600"
            onClick={() => setDeleteRecord(row)}
            title="Delete record"
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
        <h2 className="text-lg font-medium text-gray-900">DNS Records</h2>
        <div className="flex items-center space-x-3">
          <Button
            variant="secondary"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={() => syncMutation.mutate()}
            isLoading={syncMutation.isPending}
          >
            Sync
          </Button>
          <Button
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Add Record
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={data?.records ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No DNS records found"
        />
        {data && data.pagination.totalPages > 1 && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Create Modal */}
      <CreateRecordModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        providers={providers ?? []}
      />

      {/* Edit Modal */}
      <EditRecordModal
        isOpen={!!editRecord}
        onClose={() => setEditRecord(null)}
        record={editRecord}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteRecord}
        onClose={() => setDeleteRecord(null)}
        title="Delete DNS Record"
        size="sm"
      >
        <p className="text-sm text-gray-500">
          Are you sure you want to delete the record for{' '}
          <strong>{deleteRecord?.hostname}</strong>? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteRecord(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteRecord && deleteMutation.mutate(deleteRecord.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

interface CreateRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Array<{ id: string; name: string }>;
}

function CreateRecordModal({ isOpen, onClose, providers }: CreateRecordModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateDNSRecordInput>>({
    type: 'A',
    ttl: 300,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateDNSRecordInput) => dnsApi.createRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      onClose();
      setFormData({ type: 'A', ttl: 300 });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create record');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.hostname || !formData.content || !formData.providerId) {
      setError('Please fill in all required fields');
      return;
    }
    createMutation.mutate(formData as CreateDNSRecordInput);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add DNS Record" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.hostname ?? ''}
            onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
            placeholder="example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type *</label>
            <Select
              className="mt-1"
              value={formData.type}
              onChange={(value) => setFormData({ ...formData, type: value as CreateDNSRecordInput['type'] })}
              options={[
                { value: 'A', label: 'A', description: 'IPv4 address' },
                { value: 'AAAA', label: 'AAAA', description: 'IPv6 address' },
                { value: 'CNAME', label: 'CNAME', description: 'Canonical name' },
                { value: 'MX', label: 'MX', description: 'Mail exchange' },
                { value: 'TXT', label: 'TXT', description: 'Text record' },
                { value: 'SRV', label: 'SRV', description: 'Service record' },
                { value: 'CAA', label: 'CAA', description: 'Certificate authority' },
                { value: 'NS', label: 'NS', description: 'Name server' },
              ]}
            />
          </div>
          <div>
            <label className="label">TTL</label>
            <input
              type="number"
              className="input mt-1"
              value={formData.ttl ?? 300}
              onChange={(e) => setFormData({ ...formData, ttl: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label className="label">Content *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.content ?? ''}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            placeholder={formData.type === 'A' ? '192.168.1.1' : 'target.example.com'}
          />
        </div>

        <div>
          <label className="label">Provider *</label>
          <Select
            className="mt-1"
            value={formData.providerId ?? ''}
            onChange={(value) => setFormData({ ...formData, providerId: value })}
            placeholder="Select a provider"
            options={providers.map((provider) => ({
              value: provider.id,
              label: provider.name,
            }))}
          />
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create Record
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface EditRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: DNSRecord | null;
}

function EditRecordModal({ isOpen, onClose, record }: EditRecordModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<UpdateDNSRecordInput>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset form when record changes
  useEffect(() => {
    if (record) {
      setFormData({
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied,
      });
      setError(null);
    }
  }, [record]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDNSRecordInput }) =>
      dnsApi.updateRecord(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update record');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    if (!formData.content) {
      setError('Content is required');
      return;
    }
    updateMutation.mutate({ id: record.id, data: formData as UpdateDNSRecordInput });
  };

  if (!record) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit DNS Record" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname</label>
          <input
            type="text"
            className="input mt-1 bg-gray-50"
            value={record.hostname}
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Hostname cannot be changed</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <input
              type="text"
              className="input mt-1 bg-gray-50"
              value={record.type}
              disabled
            />
          </div>
          <div>
            <label className="label">TTL</label>
            <input
              type="number"
              className="input mt-1"
              value={formData.ttl ?? record.ttl}
              onChange={(e) => setFormData({ ...formData, ttl: parseInt(e.target.value) })}
            />
          </div>
        </div>

        <div>
          <label className="label">Content *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.content ?? ''}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          />
        </div>

        {['A', 'AAAA', 'CNAME'].includes(record.type) && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="proxied"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={formData.proxied ?? record.proxied ?? false}
              onChange={(e) => setFormData({ ...formData, proxied: e.target.checked })}
            />
            <label htmlFor="proxied" className="ml-2 text-sm text-gray-700">
              Proxied (Cloudflare only)
            </label>
          </div>
        )}

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
