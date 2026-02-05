/**
 * DNS Records Page
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, Edit, Shield, Globe, Search, X, Filter, Settings2, Download, Upload, Clock, Timer } from 'lucide-react';
import { dnsApi, providersApi, preservedHostnamesApi, settingsApi, overridesApi, type DNSRecord, type CreateDNSRecordInput, type UpdateDNSRecordInput, type PreservedHostname, type HostnameOverride, type CreateOverrideInput, type UpdateOverrideInput, type ImportRecordsInput, type ImportRecordsResponse } from '../api';
import { preferencesApi, DEFAULT_DNS_TABLE_PREFERENCES, type TableViewPreference } from '../api/preferences';
import { Button, Table, Pagination, Badge, Modal, ModalFooter, Alert, Select, DataTable, ColumnCustomizer, ProviderCell, type DataTableColumn } from '../components/common';

type TabType = 'records' | 'overrides' | 'preserved';

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
            onClick={() => setActiveTab('overrides')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'overrides'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Hostname Overrides
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
      {activeTab === 'records' && <DNSRecordsTab />}
      {activeTab === 'overrides' && <OverridesTab />}
      {activeTab === 'preserved' && <PreservedHostnamesTab />}
    </div>
  );
}

function DNSRecordsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [managedFilter, setManagedFilter] = useState<'all' | 'managed' | 'unmanaged'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'orphaned'>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [extendMenuOpenFor, setExtendMenuOpenFor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DNSRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DNSRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total: number;
    updated: number;
    unchanged: number;
    errors: number;
    details: Array<{ hostname: string; field: string; oldValue: string; newValue: string }>;
  } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Table view preferences
  const [tablePreferences, setTablePreferences] = useState<TableViewPreference>(DEFAULT_DNS_TABLE_PREFERENCES);

  const { data: savedPreferences, isLoading: isLoadingPreferences } = useQuery({
    queryKey: ['preferences', 'dns_records_view'],
    queryFn: () => preferencesApi.getTablePreference('dns_records_view', DEFAULT_DNS_TABLE_PREFERENCES),
    retry: false,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Apply saved preferences when loaded
  useEffect(() => {
    if (savedPreferences) {
      setTablePreferences(savedPreferences);
    }
  }, [savedPreferences]);

  // Save preferences when they change
  const savePreferencesMutation = useMutation({
    mutationFn: (prefs: TableViewPreference) =>
      preferencesApi.updatePreference('dns_records_view', prefs),
  });

  const handlePreferencesChange = useCallback((prefs: TableViewPreference) => {
    setTablePreferences(prefs);
    savePreferencesMutation.mutate(prefs);
  }, [savePreferencesMutation]);

  const handleResetPreferences = useCallback(() => {
    setTablePreferences(DEFAULT_DNS_TABLE_PREFERENCES);
    savePreferencesMutation.mutate(DEFAULT_DNS_TABLE_PREFERENCES);
  }, [savePreferencesMutation]);

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  // Get cleanup grace period from settings
  const { data: cleanupGracePeriod } = useQuery({
    queryKey: ['settings', 'cleanupGracePeriod'],
    queryFn: async () => {
      try {
        const setting = await settingsApi.getSetting('cleanupGracePeriod');
        return Number(setting.value) || 15; // Default 15 minutes
      } catch {
        return 15;
      }
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
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
      // Try to get zone from various provider settings
      const zone = provider.settings?.zone as string | undefined;
      const domain = provider.settings?.domain as string | undefined;
      const zoneName = provider.settings?.zoneName as string | undefined;

      if (zone) zones.add(zone);
      if (domain) zones.add(domain);
      if (zoneName) zones.add(zoneName);
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
    setStatusFilter('all');
    setProviderFilter('all');
    setTypeFilter('all');
    setZoneFilter('all');
    setSourceFilter('all');
  };

  const hasActiveFilters = search || managedFilter !== 'all' || statusFilter !== 'all' ||
    providerFilter !== 'all' || typeFilter !== 'all' || zoneFilter !== 'all' || sourceFilter !== 'all';

  const syncMutation = useMutation({
    mutationFn: () => dnsApi.syncRecords(providerFilter !== 'all' ? providerFilter : undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      setSyncResult(result);
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

  // Extend grace period mutation
  const extendGraceMutation = useMutation({
    mutationFn: ({ id, minutes }: { id: string; minutes: number }) =>
      dnsApi.extendGracePeriod(id, minutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      setExtendMenuOpenFor(null);
    },
  });

  // Quick preserve hostname mutation
  const preserveMutation = useMutation({
    mutationFn: (hostname: string) =>
      preservedHostnamesApi.create({ hostname, reason: 'Preserved from DNS Records page' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
      queryClient.invalidateQueries({ queryKey: ['preserved-hostnames'] });
    },
  });

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, managedFilter, statusFilter, providerFilter, typeFilter, zoneFilter, sourceFilter]);

  // Close extend menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setExtendMenuOpenFor(null);
    if (extendMenuOpenFor) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [extendMenuOpenFor]);

  // Calculate time remaining before orphaned record deletion
  const getTimeRemaining = useCallback((orphanedAt: string | undefined): { minutes: number; text: string } | null => {
    if (!orphanedAt || !cleanupGracePeriod) return null;
    const orphanedTime = new Date(orphanedAt).getTime();
    const gracePeriodMs = cleanupGracePeriod * 60 * 1000;
    const deletionTime = orphanedTime + gracePeriodMs;
    const now = Date.now();
    const remainingMs = deletionTime - now;

    if (remainingMs <= 0) return { minutes: 0, text: 'Deleting soon...' };

    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
    if (remainingMinutes < 60) {
      return { minutes: remainingMinutes, text: `${remainingMinutes}m remaining` };
    }
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    return { minutes: remainingMinutes, text: `${hours}h ${mins}m remaining` };
  }, [cleanupGracePeriod]);

  // Filter records by status (client-side since API doesn't have status filter)
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    if (statusFilter === 'all') return data.records;
    return data.records.filter(r => r.status === statusFilter);
  }, [data?.records, statusFilter]);

  // Column configurations for DataTable
  const columns: DataTableColumn<DNSRecord>[] = useMemo(() => [
    {
      id: 'hostname',
      header: 'Hostname',
      sortable: true,
      defaultVisible: true,
      minWidth: 200,
      render: (row: DNSRecord) => (
        <span className="font-medium text-gray-900 dark:text-gray-100">{row.hostname}</span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      sortable: true,
      defaultVisible: true,
      minWidth: 80,
      render: (row: DNSRecord) => (
        <Badge variant="info">{row.type}</Badge>
      ),
    },
    {
      id: 'content',
      header: 'Content',
      sortable: true,
      defaultVisible: true,
      minWidth: 150,
      render: (row: DNSRecord) => (
        <span className="font-mono text-xs truncate max-w-xs block" title={row.content}>
          {row.content}
        </span>
      ),
    },
    {
      id: 'ttl',
      header: 'TTL',
      sortable: true,
      defaultVisible: true,
      minWidth: 70,
      render: (row: DNSRecord) => (
        <span className="text-gray-600 dark:text-gray-400">{row.ttl}</span>
      ),
    },
    {
      id: 'proxied',
      header: 'Proxied',
      sortable: false,
      defaultVisible: true,
      minWidth: 80,
      render: (row: DNSRecord) => {
        const provider = providers?.find((p) => p.id === row.providerId) as ProviderWithFeatures | undefined;
        const supportsProxy = provider?.features?.proxied ?? false;

        if (!supportsProxy) {
          return <span className="text-xs text-gray-400">N/A</span>;
        }

        return (
          <Badge variant={row.proxied ? 'success' : 'default'}>
            {row.proxied ? 'Yes' : 'No'}
          </Badge>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      defaultVisible: true,
      minWidth: 130,
      render: (row: DNSRecord) => {
        const timeRemaining = row.status === 'orphaned' ? getTimeRemaining(row.orphanedAt) : null;
        return (
          <div className="flex flex-col gap-0.5">
            <Badge
              variant={
                row.status === 'active' ? 'success' :
                row.status === 'orphaned' ? 'warning' :
                row.status === 'error' ? 'error' : 'default'
              }
            >
              {row.status}
            </Badge>
            {timeRemaining && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                <Timer className="w-3 h-3" />
                {timeRemaining.text}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'provider',
      header: 'Provider',
      sortable: true,
      defaultVisible: true,
      minWidth: 150,
      render: (row: DNSRecord) => {
        const provider = providers?.find((p) => p.id === row.providerId);
        return (
          <ProviderCell
            provider={provider ? {
              id: provider.id,
              name: provider.name,
              type: provider.type,
              settings: provider.settings as { zone?: string; domain?: string; zoneName?: string },
            } : null}
            density={tablePreferences.density}
          />
        );
      },
    },
    {
      id: 'managed',
      header: 'Ownership',
      sortable: false,
      defaultVisible: true,
      minWidth: 100,
      render: (row: DNSRecord) => (
        <Badge variant={row.managed ? 'success' : 'warning'}>
          {row.managed ? 'Managed' : 'Unmanaged'}
        </Badge>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      sortable: true,
      defaultVisible: false,
      minWidth: 90,
      render: (row: DNSRecord) => (
        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{row.source}</span>
      ),
    },
    {
      id: 'lastSynced',
      header: 'Last Synced',
      sortable: true,
      defaultVisible: false,
      minWidth: 140,
      render: (row: DNSRecord) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {row.lastSyncedAt ? new Date(row.lastSyncedAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      sortable: true,
      defaultVisible: false,
      minWidth: 140,
      render: (row: DNSRecord) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {row.createdAt ? new Date(row.createdAt).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      sortable: false,
      defaultVisible: true,
      minWidth: 140,
      render: (row: DNSRecord) => (
        <div className="flex items-center space-x-1">
          {row.status === 'orphaned' && (
            <>
              {/* Extend Grace Period Dropdown */}
              <div className="relative">
                <button
                  className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExtendMenuOpenFor(extendMenuOpenFor === row.id ? null : row.id);
                  }}
                  title="Extend grace period"
                >
                  <Clock className="w-4 h-4" />
                </button>
                {extendMenuOpenFor === row.id && (
                  <div className="absolute right-0 top-8 z-50 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      Extend by
                    </div>
                    {[
                      { label: '+15 minutes', minutes: 15 },
                      { label: '+1 hour', minutes: 60 },
                      { label: '+6 hours', minutes: 360 },
                      { label: '+24 hours', minutes: 1440 },
                    ].map((option) => (
                      <button
                        key={option.minutes}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          extendGraceMutation.mutate({ id: row.id, minutes: option.minutes });
                        }}
                        disabled={extendGraceMutation.isPending}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Quick Preserve */}
              <button
                className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  preserveMutation.mutate(row.hostname);
                }}
                title="Preserve hostname (never delete)"
                disabled={preserveMutation.isPending}
              >
                <Shield className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setEditRecord(row);
            }}
            title="Edit record"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteRecord(row);
            }}
            title="Delete record"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ], [providers, tablePreferences.density, extendMenuOpenFor, extendGraceMutation, preserveMutation, getTimeRemaining]);

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
              statusFilter !== 'all' ? 1 : 0,
              providerFilter !== 'all' ? 1 : 0,
              typeFilter !== 'all' ? 1 : 0,
              zoneFilter !== 'all' ? 1 : 0,
              sourceFilter !== 'all' ? 1 : 0,
            ].reduce((a, b) => a + b, 0)})`}
          </Button>
          {/* Column Customizer */}
          <ColumnCustomizer
            columns={columns.map(c => ({
              id: c.id,
              header: typeof c.header === 'string' ? c.header : c.id,
              defaultVisible: c.defaultVisible,
            }))}
            preferences={tablePreferences}
            onPreferencesChange={handlePreferencesChange}
            onReset={handleResetPreferences}
          />
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
          {/* Export Dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              Export
            </Button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      const data = await dnsApi.exportRecords({
                        format: 'json',
                        providerId: providerFilter !== 'all' ? providerFilter : undefined,
                        type: typeFilter !== 'all' ? typeFilter as any : undefined,
                        managed: managedFilter !== 'all' ? managedFilter === 'managed' : undefined,
                      });
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `dns-records-${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Export failed:', error);
                    }
                  }}
                >
                  Export as JSON
                </button>
                <button
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      const csv = await dnsApi.exportRecords({
                        format: 'csv',
                        providerId: providerFilter !== 'all' ? providerFilter : undefined,
                        type: typeFilter !== 'all' ? typeFilter as any : undefined,
                        managed: managedFilter !== 'all' ? managedFilter === 'managed' : undefined,
                      });
                      const blob = new Blob([csv as string], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `dns-records-${new Date().toISOString().split('T')[0]}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Export failed:', error);
                    }
                  }}
                >
                  Export as CSV
                </button>
              </div>
            )}
          </div>
          {/* Import */}
          <Button
            variant="secondary"
            leftIcon={<Upload className="w-4 h-4" />}
            onClick={() => setIsImportModalOpen(true)}
          >
            Import
          </Button>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <Select
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value as 'all' | 'active' | 'orphaned');
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'active', label: 'Active Only' },
                  { value: 'orphaned', label: 'Orphaned Only' },
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
          {statusFilter !== 'all' && (
            <Badge variant={statusFilter === 'orphaned' ? 'warning' : 'success'}>{statusFilter}</Badge>
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
      <DataTable
        columns={columns}
        data={filteredRecords}
        keyField="id"
        isLoading={isLoading || isLoadingPreferences}
        emptyMessage={statusFilter === 'orphaned' ? 'No orphaned records' : 'No DNS records found'}
        emptyIcon={<Globe className="w-8 h-8 text-gray-400" />}
        preferences={tablePreferences}
        onPreferencesChange={handlePreferencesChange}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(row) => setEditRecord(row)}
      />
      {data && data.pagination.totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onPageChange={setPage}
          />
        </div>
      )}

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

      {/* Sync Result Modal */}
      <Modal
        isOpen={!!syncResult}
        onClose={() => setSyncResult(null)}
        title="Sync Complete"
        size="md"
      >
        {syncResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{syncResult.total}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total Records</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{syncResult.updated}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Updated</div>
              </div>
            </div>

            {syncResult.updated > 0 && syncResult.details.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Changes Applied:</h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {syncResult.details.slice(0, 20).map((detail, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">
                      <div className="font-medium text-gray-900 dark:text-white">{detail.hostname}</div>
                      <div className="text-gray-500 dark:text-gray-400">
                        {detail.field}: <span className="line-through text-red-500">{detail.oldValue}</span>
                        {' → '}
                        <span className="text-green-600 dark:text-green-400">{detail.newValue}</span>
                      </div>
                    </div>
                  ))}
                  {syncResult.details.length > 20 && (
                    <div className="text-xs text-gray-400 text-center">
                      ...and {syncResult.details.length - 20} more changes
                    </div>
                  )}
                </div>
              </div>
            )}

            {syncResult.updated === 0 && (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                All records are already up to date with current provider defaults.
              </div>
            )}

            {syncResult.errors > 0 && (
              <Alert variant="warning">
                {syncResult.errors} record(s) failed to sync. Check the logs for details.
              </Alert>
            )}
          </div>
        )}
        <ModalFooter>
          <Button onClick={() => setSyncResult(null)}>Close</Button>
        </ModalFooter>
      </Modal>

      {/* Import Modal */}
      <ImportRecordsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        providers={providers ?? []}
      />
    </>
  );
}

interface ImportRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Array<{ id: string; name: string; type: string }>;
}

function ImportRecordsModal({ isOpen, onClose, providers }: ImportRecordsModalProps) {
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState<string>('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportRecordsResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportRecordsResponse | null>(null);

  const parseRecords = (): ImportRecordsInput['records'] | null => {
    try {
      const parsed = JSON.parse(jsonInput);
      // Support both { records: [...] } and direct array format
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) {
        setError('Invalid format: expected an array of records or { records: [...] }');
        return null;
      }
      return records;
    } catch {
      setError('Invalid JSON format');
      return null;
    }
  };

  const previewMutation = useMutation({
    mutationFn: (data: ImportRecordsInput) => dnsApi.importRecords({ ...data, dryRun: true }),
    onSuccess: (result) => {
      setPreviewResult(result);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Preview failed');
    },
  });

  const importMutation = useMutation({
    mutationFn: (data: ImportRecordsInput) => dnsApi.importRecords(data),
    onSuccess: (result) => {
      setImportResult(result);
      setPreviewResult(null);
      queryClient.invalidateQueries({ queryKey: ['dns-records'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Import failed');
    },
  });

  const handlePreview = () => {
    if (!providerId) {
      setError('Please select a provider');
      return;
    }
    const records = parseRecords();
    if (records) {
      previewMutation.mutate({ records, providerId, skipDuplicates });
    }
  };

  const handleImport = () => {
    if (!providerId) {
      setError('Please select a provider');
      return;
    }
    const records = parseRecords();
    if (records) {
      importMutation.mutate({ records, providerId, skipDuplicates });
    }
  };

  const handleClose = () => {
    setJsonInput('');
    setProviderId('');
    setError(null);
    setPreviewResult(null);
    setImportResult(null);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonInput(content);
      setPreviewResult(null);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import DNS Records" size="lg">
      <div className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        {importResult ? (
          // Import completed view
          <div className="space-y-4">
            <Alert variant={importResult.failed > 0 ? 'warning' : 'success'}>
              Imported {importResult.created} records, skipped {importResult.skipped}, failed {importResult.failed}
            </Alert>

            {importResult.failed > 0 && importResult.errors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Errors:</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((err, idx) => (
                    <div key={idx} className="text-xs text-red-600 dark:text-red-400">
                      {err.hostname}: {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ModalFooter>
              <Button onClick={handleClose}>Done</Button>
            </ModalFooter>
          </div>
        ) : previewResult ? (
          // Preview view
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">{previewResult.created}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">To Create</div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{previewResult.skipped}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">To Skip</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <div className="text-xl font-bold text-red-600 dark:text-red-400">{previewResult.failed}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Errors</div>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">Hostname</th>
                    <th className="px-2 py-1 text-left">Type</th>
                    <th className="px-2 py-1 text-left">Content</th>
                    <th className="px-2 py-1 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.preview.map((item, idx) => (
                    <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-2 py-1 font-mono">{item.hostname}</td>
                      <td className="px-2 py-1">{item.type}</td>
                      <td className="px-2 py-1 font-mono truncate max-w-[150px]" title={item.content}>{item.content}</td>
                      <td className="px-2 py-1">
                        <Badge variant={item.action === 'create' ? 'success' : item.action === 'skip' ? 'warning' : 'error'}>
                          {item.action}
                        </Badge>
                        {item.reason && <span className="ml-1 text-gray-400" title={item.reason}>ℹ️</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={() => setPreviewResult(null)}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                isLoading={importMutation.isPending}
                disabled={previewResult.created === 0}
              >
                Import {previewResult.created} Records
              </Button>
            </ModalFooter>
          </div>
        ) : (
          // Input view
          <>
            <div>
              <label className="label">Target Provider *</label>
              <Select
                className="mt-1"
                value={providerId}
                onChange={setProviderId}
                placeholder="Select provider"
                options={providers.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>

            <div>
              <label className="label">Records (JSON)</label>
              <div className="mt-1 space-y-2">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/20 dark:file:text-primary-400"
                />
                <textarea
                  className="input mt-1 font-mono text-xs"
                  rows={10}
                  value={jsonInput}
                  onChange={(e) => {
                    setJsonInput(e.target.value);
                    setError(null);
                  }}
                  placeholder={`[
  { "hostname": "app.example.com", "type": "A", "content": "192.168.1.1", "ttl": 300 },
  { "hostname": "mail.example.com", "type": "CNAME", "content": "mail.provider.com" }
]

Or paste an exported JSON file content`}
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="skip-duplicates"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              <label htmlFor="skip-duplicates" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Skip duplicate records (recommended)
              </label>
            </div>

            <ModalFooter>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                isLoading={previewMutation.isPending}
                disabled={!jsonInput.trim() || !providerId}
              >
                Preview Import
              </Button>
            </ModalFooter>
          </>
        )}
      </div>
    </Modal>
  );
}

function OverridesTab() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editOverride, setEditOverride] = useState<HostnameOverride | null>(null);
  const [deleteOverride, setDeleteOverride] = useState<HostnameOverride | null>(null);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['overrides'],
    queryFn: () => overridesApi.listOverrides(),
  });

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => overridesApi.deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overrides'] });
      setDeleteOverride(null);
    },
  });

  const getProviderName = (providerId: string | null) => {
    if (!providerId) return '-';
    return providers?.find((p) => p.id === providerId)?.name ?? providerId.slice(0, 8);
  };

  const columns = [
    {
      key: 'hostname',
      header: 'Hostname',
      render: (row: HostnameOverride) => (
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary-500" />
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.hostname}</span>
          {!row.enabled && (
            <Badge variant="warning">Disabled</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'proxied',
      header: 'Proxied',
      render: (row: HostnameOverride) => (
        <span className="text-sm">
          {row.proxied === null ? (
            <span className="text-gray-400">-</span>
          ) : row.proxied ? (
            <Badge variant="success">Yes</Badge>
          ) : (
            <Badge variant="default">No</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'ttl',
      header: 'TTL',
      render: (row: HostnameOverride) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {row.ttl ?? '-'}
        </span>
      ),
    },
    {
      key: 'recordType',
      header: 'Type',
      render: (row: HostnameOverride) => (
        row.recordType ? (
          <Badge variant="info">{row.recordType}</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        )
      ),
    },
    {
      key: 'content',
      header: 'Content',
      render: (row: HostnameOverride) => (
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
          {row.content ?? '-'}
        </span>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (row: HostnameOverride) => (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {getProviderName(row.providerId)}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row: HostnameOverride) => (
        <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={row.reason ?? undefined}>
          {row.reason || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: HostnameOverride) => (
        <div className="flex items-center space-x-2">
          <button
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => setEditOverride(row)}
            title="Edit override"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            onClick={() => setDeleteOverride(row)}
            title="Delete override"
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Hostname Overrides</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Per-hostname settings that persist across sync cycles and override global defaults.
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Add Override
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Settings2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium">How hostname overrides work</p>
            <p className="mt-1 text-blue-600 dark:text-blue-400">
              Overrides let you customize DNS settings for specific hostnames without using container labels.
              These settings persist through sync cycles and won't be overwritten by global defaults.
            </p>
            <p className="mt-2 text-blue-600 dark:text-blue-400">
              <strong>Priority order:</strong> Container Label → Hostname Override → Provider Default → Global Default
            </p>
            <p className="mt-2 text-blue-600 dark:text-blue-400">
              <strong>Use cases:</strong> Disable Cloudflare proxy for specific apps (Plex, Jellyfin),
              set custom TTLs, or route specific hostnames to different providers.
            </p>
            <p className="mt-2 text-blue-600 dark:text-blue-400">
              <strong>Wildcard support:</strong> Use <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">*.example.com</code> to apply overrides to all subdomains.
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={overrides ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No hostname overrides. Add one to customize settings for specific hostnames."
        />
      </div>

      {/* Create Modal */}
      <CreateOverrideModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        providers={providers ?? []}
      />

      {/* Edit Modal */}
      <EditOverrideModal
        isOpen={!!editOverride}
        onClose={() => setEditOverride(null)}
        override={editOverride}
        providers={providers ?? []}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteOverride}
        onClose={() => setDeleteOverride(null)}
        title="Delete Override"
        size="sm"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Are you sure you want to delete the override for{' '}
          <strong>{deleteOverride?.hostname}</strong>? Future syncs will use default settings for this hostname.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setDeleteOverride(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteOverride && deleteMutation.mutate(deleteOverride.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

interface CreateOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Array<{ id: string; name: string; type: string }>;
}

function CreateOverrideModal({ isOpen, onClose, providers }: CreateOverrideModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateOverrideInput>({
    hostname: '',
    proxied: null,
    ttl: null,
    recordType: null,
    content: null,
    providerId: null,
    reason: null,
    enabled: true,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateOverrideInput) => overridesApi.createOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overrides'] });
      onClose();
      setFormData({
        hostname: '',
        proxied: null,
        ttl: null,
        recordType: null,
        content: null,
        providerId: null,
        reason: null,
        enabled: true,
      });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create override');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.hostname) {
      setError('Hostname is required');
      return;
    }
    createMutation.mutate(formData);
  };

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Hostname Override" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.hostname}
            onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
            placeholder="app.example.com or *.example.com"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Use *.domain.com for wildcard matching of all subdomains
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Proxied</label>
            <Select
              className="mt-1"
              value={formData.proxied === null ? 'inherit' : formData.proxied ? 'true' : 'false'}
              onChange={(value) => setFormData({
                ...formData,
                proxied: value === 'inherit' ? null : value === 'true',
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                { value: 'true', label: 'Yes - Proxy through Cloudflare' },
                { value: 'false', label: 'No - Direct DNS' },
              ]}
            />
          </div>
          <div>
            <label className="label">TTL (seconds)</label>
            <input
              type="number"
              className="input mt-1"
              value={formData.ttl ?? ''}
              onChange={(e) => setFormData({
                ...formData,
                ttl: e.target.value ? parseInt(e.target.value) : null,
              })}
              placeholder="Leave empty to inherit"
              min={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Record Type</label>
            <Select
              className="mt-1"
              value={formData.recordType ?? 'inherit'}
              onChange={(value) => setFormData({
                ...formData,
                recordType: value === 'inherit' ? null : value as CreateOverrideInput['recordType'],
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                { value: 'A', label: 'A' },
                { value: 'AAAA', label: 'AAAA' },
                { value: 'CNAME', label: 'CNAME' },
                { value: 'MX', label: 'MX' },
                { value: 'TXT', label: 'TXT' },
                { value: 'SRV', label: 'SRV' },
                { value: 'CAA', label: 'CAA' },
                { value: 'NS', label: 'NS' },
              ]}
            />
          </div>
          <div>
            <label className="label">Provider</label>
            <Select
              className="mt-1"
              value={formData.providerId ?? 'inherit'}
              onChange={(value) => setFormData({
                ...formData,
                providerId: value === 'inherit' ? null : value,
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                ...providers.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        </div>

        <div>
          <label className="label">Content</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.content ?? ''}
            onChange={(e) => setFormData({
              ...formData,
              content: e.target.value || null,
            })}
            placeholder="Leave empty to inherit (e.g., IP address)"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Override the record content (IP, CNAME target, etc.)
          </p>
        </div>

        <div>
          <label className="label">Reason (optional)</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.reason ?? ''}
            onChange={(e) => setFormData({
              ...formData,
              reason: e.target.value || null,
            })}
            placeholder="e.g., Disable proxy for Plex streaming"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="override-enabled"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={formData.enabled ?? true}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          />
          <label htmlFor="override-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            Enabled
          </label>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Create Override
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface EditOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  override: HostnameOverride | null;
  providers: Array<{ id: string; name: string; type: string }>;
}

function EditOverrideModal({ isOpen, onClose, override, providers }: EditOverrideModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<UpdateOverrideInput>({});
  const [error, setError] = useState<string | null>(null);

  // Reset form when override changes
  useEffect(() => {
    if (override) {
      setFormData({
        hostname: override.hostname,
        proxied: override.proxied,
        ttl: override.ttl,
        recordType: override.recordType,
        content: override.content,
        providerId: override.providerId,
        reason: override.reason,
        enabled: override.enabled,
      });
      setError(null);
    }
  }, [override]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateOverrideInput }) =>
      overridesApi.updateOverride(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overrides'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update override');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!override) return;
    if (!formData.hostname) {
      setError('Hostname is required');
      return;
    }
    updateMutation.mutate({ id: override.id, data: formData });
  };

  if (!override) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Hostname Override" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname *</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.hostname ?? ''}
            onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
            placeholder="app.example.com or *.example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Proxied</label>
            <Select
              className="mt-1"
              value={formData.proxied === null ? 'inherit' : formData.proxied ? 'true' : 'false'}
              onChange={(value) => setFormData({
                ...formData,
                proxied: value === 'inherit' ? null : value === 'true',
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                { value: 'true', label: 'Yes - Proxy through Cloudflare' },
                { value: 'false', label: 'No - Direct DNS' },
              ]}
            />
          </div>
          <div>
            <label className="label">TTL (seconds)</label>
            <input
              type="number"
              className="input mt-1"
              value={formData.ttl ?? ''}
              onChange={(e) => setFormData({
                ...formData,
                ttl: e.target.value ? parseInt(e.target.value) : null,
              })}
              placeholder="Leave empty to inherit"
              min={1}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Record Type</label>
            <Select
              className="mt-1"
              value={formData.recordType ?? 'inherit'}
              onChange={(value) => setFormData({
                ...formData,
                recordType: value === 'inherit' ? null : value as CreateOverrideInput['recordType'],
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                { value: 'A', label: 'A' },
                { value: 'AAAA', label: 'AAAA' },
                { value: 'CNAME', label: 'CNAME' },
                { value: 'MX', label: 'MX' },
                { value: 'TXT', label: 'TXT' },
                { value: 'SRV', label: 'SRV' },
                { value: 'CAA', label: 'CAA' },
                { value: 'NS', label: 'NS' },
              ]}
            />
          </div>
          <div>
            <label className="label">Provider</label>
            <Select
              className="mt-1"
              value={formData.providerId ?? 'inherit'}
              onChange={(value) => setFormData({
                ...formData,
                providerId: value === 'inherit' ? null : value,
              })}
              options={[
                { value: 'inherit', label: 'Inherit (use default)' },
                ...providers.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        </div>

        <div>
          <label className="label">Content</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.content ?? ''}
            onChange={(e) => setFormData({
              ...formData,
              content: e.target.value || null,
            })}
            placeholder="Leave empty to inherit"
          />
        </div>

        <div>
          <label className="label">Reason (optional)</label>
          <input
            type="text"
            className="input mt-1"
            value={formData.reason ?? ''}
            onChange={(e) => setFormData({
              ...formData,
              reason: e.target.value || null,
            })}
            placeholder="e.g., Disable proxy for Plex streaming"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="edit-override-enabled"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={formData.enabled ?? true}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          />
          <label htmlFor="edit-override-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            Enabled
          </label>
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

function PreservedHostnamesTab() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editHostname, setEditHostname] = useState<PreservedHostname | null>(null);
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
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            onClick={() => setEditHostname(row)}
            title="Edit preservation"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            onClick={() => setDeleteHostname(row)}
            title="Remove preservation"
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

      {/* Edit Modal */}
      {editHostname && (
        <EditPreservedHostnameModal
          isOpen={!!editHostname}
          onClose={() => setEditHostname(null)}
          hostname={editHostname}
        />
      )}

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

interface EditPreservedHostnameModalProps {
  isOpen: boolean;
  onClose: () => void;
  hostname: PreservedHostname;
}

function EditPreservedHostnameModal({ isOpen, onClose, hostname }: EditPreservedHostnameModalProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState(hostname.reason || '');
  const [error, setError] = useState<string | null>(null);

  // Reset form when hostname changes
  useEffect(() => {
    setReason(hostname.reason || '');
    setError(null);
  }, [hostname]);

  const updateMutation = useMutation({
    mutationFn: () => preservedHostnamesApi.update(hostname.id, { reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preserved-hostnames'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update preserved hostname');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Preserved Hostname" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <div>
          <label className="label">Hostname</label>
          <input
            type="text"
            className="input mt-1 bg-gray-100 dark:bg-gray-700"
            value={hostname.hostname}
            disabled
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Hostname cannot be changed. Delete and recreate to change it.
          </p>
        </div>

        <div>
          <label className="label">Reason</label>
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
          <Button type="submit" isLoading={updateMutation.isPending}>
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface ProviderWithFeatures {
  id: string;
  name: string;
  type: string;
  features?: {
    proxied: boolean;
    ttlMin: number;
    ttlMax: number;
    ttlDefault: number;
    supportedTypes: string[];
  };
}

interface CreateRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderWithFeatures[];
}

function CreateRecordModal({ isOpen, onClose, providers }: CreateRecordModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<CreateDNSRecordInput>>({
    type: 'A',
    ttl: 300,
  });
  const [error, setError] = useState<string | null>(null);

  // Fetch global TTL settings
  const { data: settingsList } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.listSettings(),
    staleTime: 60000, // Cache for 1 minute
  });

  // Extract TTL settings
  const ttlOverrideSetting = settingsList?.find((s) => s.key === 'dns_default_ttl_override');
  const ttlValueSetting = settingsList?.find((s) => s.key === 'dns_default_ttl');
  const isGlobalTtlOverride = ttlOverrideSetting?.value === true || ttlOverrideSetting?.value === 'true';
  const globalTtl = typeof ttlValueSetting?.value === 'number'
    ? ttlValueSetting.value
    : parseInt(String(ttlValueSetting?.value ?? 300), 10);

  // Get selected provider's features
  const selectedProvider = providers.find((p) => p.id === formData.providerId);
  const ttlMin = selectedProvider?.features?.ttlMin ?? 1;
  const ttlMax = selectedProvider?.features?.ttlMax ?? 86400;
  const supportsProxied = selectedProvider?.features?.proxied ?? false;

  // Calculate effective TTL default: global (clamped) if override enabled, else provider default
  const getEffectiveTtl = (provider: ProviderWithFeatures | undefined): number => {
    if (!provider?.features) return 300;
    const min = provider.features.ttlMin;
    const max = provider.features.ttlMax;
    const providerDefault = provider.features.ttlDefault;

    if (isGlobalTtlOverride) {
      // Clamp global TTL to provider limits
      return Math.min(Math.max(globalTtl, min), max);
    }
    return providerDefault;
  };

  const effectiveTtlDefault = getEffectiveTtl(selectedProvider);

  // Update TTL to effective default when provider changes
  const handleProviderChange = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    const newTtlDefault = getEffectiveTtl(provider);
    setFormData({
      ...formData,
      providerId,
      ttl: newTtlDefault,
      // Reset proxied if new provider doesn't support it
      proxied: provider?.features?.proxied ? formData.proxied : undefined,
    });
  };

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
    // Validate TTL against provider limits
    const ttl = formData.ttl ?? effectiveTtlDefault;
    if (ttl < ttlMin || ttl > ttlMax) {
      setError(`TTL must be between ${ttlMin} and ${ttlMax} for this provider`);
      return;
    }
    createMutation.mutate(formData as CreateDNSRecordInput);
  };

  // Format TTL for display
  const formatTTL = (seconds: number): string => {
    if (seconds === 1) return '1 (Auto)';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add DNS Record" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* Provider first - so TTL defaults are set correctly */}
        <div>
          <label className="label">Provider *</label>
          <Select
            className="mt-1"
            value={formData.providerId ?? ''}
            onChange={handleProviderChange}
            placeholder="Select a provider"
            options={providers.map((provider) => ({
              value: provider.id,
              label: provider.name,
            }))}
          />
        </div>

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
            <label className="label">
              TTL
              {selectedProvider && (
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  ({ttlMin === 1 ? 'auto' : formatTTL(ttlMin)} - {formatTTL(ttlMax)})
                </span>
              )}
            </label>
            <input
              type="number"
              className="input mt-1"
              value={formData.ttl ?? effectiveTtlDefault}
              onChange={(e) => setFormData({ ...formData, ttl: parseInt(e.target.value) || effectiveTtlDefault })}
              min={ttlMin}
              max={ttlMax}
            />
            {selectedProvider && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {ttlMin === 1 && 'Use 1 for automatic TTL. '}
                Current: {formatTTL(formData.ttl ?? effectiveTtlDefault)}
                {isGlobalTtlOverride && globalTtl !== effectiveTtlDefault && (
                  <span className="text-amber-500 dark:text-amber-400">
                    {' '}(global {formatTTL(globalTtl)} clamped)
                  </span>
                )}
                {isGlobalTtlOverride && globalTtl === effectiveTtlDefault && (
                  <span className="text-blue-500 dark:text-blue-400"> (global override)</span>
                )}
              </p>
            )}
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

        {/* Proxied checkbox - only for Cloudflare and compatible types */}
        {supportsProxied && ['A', 'AAAA', 'CNAME'].includes(formData.type ?? '') && (
          <div className="flex items-center">
            <input
              type="checkbox"
              id="create-proxied"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={formData.proxied ?? false}
              onChange={(e) => setFormData({ ...formData, proxied: e.target.checked })}
            />
            <label htmlFor="create-proxied" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Proxied through Cloudflare
            </label>
          </div>
        )}

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
