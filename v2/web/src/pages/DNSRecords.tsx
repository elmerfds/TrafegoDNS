/**
 * DNS Records Page
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, Edit, Shield, Globe, Search, X, Filter, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { dnsApi, providersApi, preservedHostnamesApi, type DNSRecord, type CreateDNSRecordInput, type UpdateDNSRecordInput, type PreservedHostname } from '../api';
import { Button, Table, Pagination, Badge, Modal, ModalFooter, Alert, Select } from '../components/common';

type TabType = 'records' | 'preserved';

export function DNSRecordsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('records');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('records')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'records'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Globe className="w-4 h-4" />
            DNS Records
          </button>
          <button
            onClick={() => setActiveTab('preserved')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'preserved'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Shield className="w-4 h-4" />
            Preserved Hostnames
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'records' ? <DNSRecordsTab /> : <PreservedHostnamesTab />}
    </div>
  );
}

function DNSRecordsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [managedFilter, setManagedFilter] = useState<'all' | 'managed' | 'unmanaged'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DNSRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DNSRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  // Build filters object
  const filters = useMemo(() => ({
    page,
    limit: 20,
    search: search || undefined,
    managed: managedFilter === 'all' ? undefined : managedFilter === 'managed',
    providerId: providerFilter === 'all' ? undefined : providerFilter,
    type: typeFilter === 'all' ? undefined : typeFilter,
    zone: zoneFilter === 'all' ? undefined : zoneFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
  }), [page, search, managedFilter, providerFilter, typeFilter, zoneFilter, sourceFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['dns-records', filters],
    queryFn: () => dnsApi.listRecords(filters as Parameters<typeof dnsApi.listRecords>[0]),
  });

  // Extract unique zones from providers for zone filter dropdown
  const availableZones = useMemo(() => {
    if (!providers) return [];
    const zones = new Set<string>();
    providers.forEach((provider) => {
      // Try to get zone from provider settings
      const zone = provider.settings?.zone as string | undefined;
      if (zone) {
        zones.add(zone);
      }
      // Also check for domain setting (some providers use 'domain' instead of 'zone')
      const domain = provider.settings?.domain as string | undefined;
      if (domain) {
        zones.add(domain);
      }
    });
    return Array.from(zones).sort();
  }, [providers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const clearAllFilters = () => {
    clearSearch();
    setManagedFilter('all');
    setProviderFilter('all');
    setTypeFilter('all');
    setZoneFilter('all');
    setSourceFilter('all');
  };

  const hasActiveFilters = search || managedFilter !== 'all' || providerFilter !== 'all' ||
    typeFilter !== 'all' || zoneFilter !== 'all' || sourceFilter !== 'all';

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

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => dnsApi.bulkDeleteRecords(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      setSelectedIds(new Set());
      setIsBulkDeleteModalOpen(false);
      if (result.failed > 0) {
        console.warn('Some records failed to delete:', result.errors);
      }
    },
  });

  // Selection handlers
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (!data?.records) return;
    const allIds = data.records.map((r) => r.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const getSelectAllState = (): 'none' | 'some' | 'all' => {
    if (!data?.records || data.records.length === 0) return 'none';
    const allIds = data.records.map((r) => r.id);
    const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === allIds.length) return 'all';
    return 'some';
  };

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, managedFilter, providerFilter, typeFilter, zoneFilter, sourceFilter]);

  const selectAllState = getSelectAllState();

  const columns = [
    {
      key: 'select',
      header: (
        <button
          onClick={toggleSelectAll}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          title={selectAllState === 'all' ? 'Deselect all' : 'Select all'}
        >
          {selectAllState === 'none' && <Square className="w-4 h-4 text-gray-400" />}
          {selectAllState === 'some' && <MinusSquare className="w-4 h-4 text-primary-500" />}
          {selectAllState === 'all' && <CheckSquare className="w-4 h-4 text-primary-500" />}
        </button>
      ),
      render: (row: DNSRecord) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(row.id);
          }}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          {selectedIds.has(row.id) ? (
            <CheckSquare className="w-4 h-4 text-primary-500" />
          ) : (
            <Square className="w-4 h-4 text-gray-400" />
          )}
        </button>
      ),
    },
    {
      key: 'hostname',
      header: 'Hostname',
      render: (row: DNSRecord) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.hostname}</span>
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
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.source}</span>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row: DNSRecord) => {
        const provider = providers?.find((p) => p.id === row.providerId);
        return (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {provider?.name ?? row.providerId.slice(0, 8)}
          </span>
        );
      },
    },
    {
      key: 'managed',
      header: 'Ownership',
      render: (row: DNSRecord) => (
        <Badge variant={row.managed ? 'success' : 'warning'}>
          {row.managed ? 'Managed' : 'Unmanaged'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: DNSRecord) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => setEditRecord(row)}
            title="Edit record"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
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
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">DNS Records</h2>
          {selectedIds.size > 0 && (
            <Badge variant="info">{selectedIds.size} selected</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search records..."
              className="pl-9 pr-8 py-2 w-64 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {(searchInput || search) && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>
          {/* Filters Toggle */}
          <Button
            variant={showFilters || hasActiveFilters ? 'primary' : 'secondary'}
            leftIcon={<Filter className="w-4 h-4" />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters{hasActiveFilters && ` (${[
              managedFilter !== 'all' ? 1 : 0,
              providerFilter !== 'all' ? 1 : 0,
              typeFilter !== 'all' ? 1 : 0,
              zoneFilter !== 'all' ? 1 : 0,
              sourceFilter !== 'all' ? 1 : 0,
            ].reduce((a, b) => a + b, 0)})`}
          </Button>
          {/* Bulk Delete */}
          {selectedIds.size > 0 && (
            <Button
              variant="danger"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setIsBulkDeleteModalOpen(true)}
            >
              Delete ({selectedIds.size})
            </Button>
          )}
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

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Provider Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Provider</label>
              <Select
                value={providerFilter}
                onChange={(value) => {
                  setProviderFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Providers' },
                  ...(providers?.map((p) => ({ value: p.id, label: p.name })) ?? []),
                ]}
                className="w-full"
              />
            </div>
            {/* Type Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
              <Select
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'A', label: 'A' },
                  { value: 'AAAA', label: 'AAAA' },
                  { value: 'CNAME', label: 'CNAME' },
                  { value: 'MX', label: 'MX' },
                  { value: 'TXT', label: 'TXT' },
                  { value: 'SRV', label: 'SRV' },
                  { value: 'CAA', label: 'CAA' },
                  { value: 'NS', label: 'NS' },
                ]}
                className="w-full"
              />
            </div>
            {/* Zone Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Zone/Domain</label>
              <Select
                value={zoneFilter}
                onChange={(value) => {
                  setZoneFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Zones' },
                  ...availableZones.map((z) => ({ value: z, label: z })),
                ]}
                className="w-full"
              />
            </div>
            {/* Source Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Source</label>
              <Select
                value={sourceFilter}
                onChange={(value) => {
                  setSourceFilter(value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Sources' },
                  { value: 'traefik', label: 'Traefik' },
                  { value: 'direct', label: 'Direct' },
                  { value: 'api', label: 'API' },
                  { value: 'managed', label: 'Managed' },
                  { value: 'discovered', label: 'Discovered' },
                ]}
                className="w-full"
              />
            </div>
            {/* Managed Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ownership</label>
              <Select
                value={managedFilter}
                onChange={(value) => {
                  setManagedFilter(value as 'all' | 'managed' | 'unmanaged');
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Records' },
                  { value: 'managed', label: 'Managed Only' },
                  { value: 'unmanaged', label: 'Unmanaged Only' },
                ]}
                className="w-full"
              />
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={clearAllFilters}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter indicators */}
      {hasActiveFilters && !showFilters && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
          <span>Filters:</span>
          {managedFilter !== 'all' && (
            <Badge variant="default">{managedFilter}</Badge>
          )}
          {providerFilter !== 'all' && (
            <Badge variant="default">{providers?.find((p) => p.id === providerFilter)?.name ?? 'Provider'}</Badge>
          )}
          {typeFilter !== 'all' && (
            <Badge variant="default">{typeFilter}</Badge>
          )}
          {zoneFilter !== 'all' && (
            <Badge variant="default">{zoneFilter}</Badge>
          )}
          {sourceFilter !== 'all' && (
            <Badge variant="default">{sourceFilter}</Badge>
          )}
          {search && (
            <Badge variant="default">"{search}"</Badge>
          )}
          <button
            onClick={clearAllFilters}
            className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Clear all
          </button>
        </div>
      )}

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
        <p className="text-sm text-gray-500 dark:text-gray-400">
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

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        title="Delete Multiple DNS Records"
        size="sm"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to delete <strong>{selectedIds.size}</strong> DNS records?
          This action cannot be undone and will remove them from both the database and the DNS provider.
        </p>
        <div className="mt-3 max-h-40 overflow-y-auto">
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            {data?.records
              .filter((r) => selectedIds.has(r.id))
              .slice(0, 10)
              .map((r) => (
                <li key={r.id} className="font-mono">• {r.hostname} ({r.type})</li>
              ))}
            {selectedIds.size > 10 && (
              <li className="text-gray-400">...and {selectedIds.size - 10} more</li>
            )}
          </ul>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsBulkDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            isLoading={bulkDeleteMutation.isPending}
          >
            Delete {selectedIds.size} Records
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function PreservedHostnamesTab() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteHostname, setDeleteHostname] = useState<PreservedHostname | null>(null);

  const { data: preservedHostnames, isLoading } = useQuery({
    queryKey: ['preserved-hostnames'],
    queryFn: () => preservedHostnamesApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => preservedHostnamesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preserved-hostnames'] });
      setDeleteHostname(null);
    },
  });

  const columns = [
    {
      key: 'hostname',
      header: 'Hostname',
      render: (row: PreservedHostname) => (
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.hostname}</span>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row: PreservedHostname) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">{row.reason || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row: PreservedHostname) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: PreservedHostname) => (
        <button
          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
          onClick={() => setDeleteHostname(row)}
          title="Remove preservation"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Preserved Hostnames</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Hostnames that will never be deleted during orphan cleanup, even when their containers go offline.
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Preserve Hostname
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">How preservation works</p>
            <p className="mt-1 text-blue-600 dark:text-blue-400">
              When a container goes offline, its DNS records are normally marked as orphaned and deleted after the grace period.
              Preserved hostnames bypass this cleanup - their records remain intact even when containers are stopped.
            </p>
            <p className="mt-2 text-blue-600 dark:text-blue-400">
              <strong>Wildcard support:</strong> Use <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">*.example.com</code> to preserve all subdomains.
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={preservedHostnames ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No preserved hostnames. Add one to prevent automatic cleanup of specific DNS records."
        />
      </div>

      {/* Create Modal */}
      <CreatePreservedHostnameModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteHostname}
        onClose={() => setDeleteHostname(null)}
        title="Remove Preservation"
        size="sm"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to remove preservation for{' '}
          <strong>{deleteHostname?.hostname}</strong>? The DNS record may be automatically deleted if its container goes offline.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteHostname(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteHostname && deleteMutation.mutate(deleteHostname.id)}
            isLoading={deleteMutation.isPending}
          >
            Remove
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

interface CreatePreservedHostnameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreatePreservedHostnameModal({ isOpen, onClose }: CreatePreservedHostnameModalProps) {
  const queryClient = useQueryClient();
  const [hostname, setHostname] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => preservedHostnamesApi.create({ hostname, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preserved-hostnames'] });
      onClose();
      setHostname('');
      setReason('');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to preserve hostname');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname) {
      setError('Hostname is required');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Preserve Hostname" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname *</label>
          <input
            type="text"
            className="input mt-1"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="app.example.com or *.example.com"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use *.domain.com for wildcard preservation of all subdomains
          </p>
        </div>

        <div>
          <label className="label">Reason (optional)</label>
          <input
            type="text"
            className="input mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Production critical service"
          />
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Preserve
          </Button>
        </ModalFooter>
      </form>
    </Modal>
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
    <Modal isOpen={isOpen} onClose={onClose} title="Add DNS Record" size="lg">
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
            className="input mt-1 bg-gray-50 dark:bg-gray-800"
            value={record.hostname}
            disabled
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Hostname cannot be changed</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <input
              type="text"
              className="input mt-1 bg-gray-50 dark:bg-gray-800"
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
            <label htmlFor="proxied" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
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
