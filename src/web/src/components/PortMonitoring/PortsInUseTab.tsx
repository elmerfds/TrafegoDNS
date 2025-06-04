import React, { useState, useCallback, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  Eye,
  Download,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { DataTable, Column, TableAction } from '../shared/DataTable';
import { LoadingWrapper } from '../shared/LoadingState';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { useToast } from '../../hooks/use-toast';
import { api } from '../../lib/api';
import type { Port, PortFilters } from '../../types/port';

export interface PortsInUseTabProps {
  ports: Port[];
  loading: boolean;
  error: string | null;
  filters: PortFilters;
  onFiltersChange: (filters: PortFilters) => void;
  onRefresh: () => void;
  selectedServer: string;
}

export function PortsInUseTab({
  ports,
  loading,
  error,
  filters,
  onFiltersChange,
  onRefresh,
  selectedServer
}: PortsInUseTabProps) {
  const [selectedPorts, setSelectedPorts] = useState<Port[]>([]);
  const [exporting, setExporting] = useState(false);

  const { handleApiError } = useErrorHandler();
  const { toast } = useToast();

  // Filter options
  const statusOptions = [
    { label: 'Open', value: 'open' },
    { label: 'Closed', value: 'closed' },
    { label: 'Listening', value: 'listening' },
    { label: 'Filtered', value: 'filtered' }
  ];

  const protocolOptions = [
    { label: 'TCP', value: 'tcp' },
    { label: 'UDP', value: 'udp' },
    { label: 'Both', value: 'both' }
  ];

  // Table columns
  const columns: Column<Port>[] = [
    {
      key: 'port',
      header: 'Port',
      sortable: true,
      accessor: (port) => (
        <span className="font-mono font-medium">{port.port}</span>
      )
    },
    {
      key: 'protocol',
      header: 'Protocol',
      accessor: (port) => (
        <Badge variant="outline" className="uppercase">
          {port.protocol}
        </Badge>
      )
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (port) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
          open: 'default',
          closed: 'secondary',
          listening: 'default',
          filtered: 'destructive',
          unknown: 'secondary'
        };
        
        return (
          <Badge variant={variants[port.status] || 'secondary'}>
            {port.status}
          </Badge>
        );
      }
    },
    {
      key: 'service',
      header: 'Service',
      accessor: (port) => (
        <div className="space-y-1">
          {port.service_name && (
            <div className="font-medium">{port.service_name}</div>
          )}
          {port.service_version && (
            <div className="text-sm text-gray-500">{port.service_version}</div>
          )}
          {!port.service_name && (
            <span className="text-gray-400">Unknown</span>
          )}
        </div>
      )
    },
    {
      key: 'container',
      header: 'Container',
      accessor: (port) => (
        <div className="space-y-1">
          {port.container_name && (
            <div className="font-medium">{port.container_name}</div>
          )}
          {port.container_id && (
            <div className="font-mono text-xs text-gray-500">
              {port.container_id.slice(0, 12)}...
            </div>
          )}
          {!port.container_name && !port.container_id && (
            <span className="text-gray-400">Not containerized</span>
          )}
        </div>
      )
    },
    {
      key: 'description',
      header: 'Description',
      accessor: (port) => (
        <span className="text-sm">
          {port.description || (
            <span className="text-gray-400">No description</span>
          )}
        </span>
      )
    },
    {
      key: 'last_seen',
      header: 'Last Seen',
      accessor: (port) => (
        <span className="text-sm text-gray-600">
          {port.last_seen ? new Date(port.last_seen).toLocaleString() : 'Never'}
        </span>
      )
    }
  ];

  // Table actions
  const actions: TableAction<Port>[] = [
    {
      label: 'View Details',
      icon: <Eye className="h-4 w-4" />,
      onClick: (port) => handleViewDetails(port),
      variant: 'ghost'
    },
    {
      label: 'Check Status',
      icon: <Activity className="h-4 w-4" />,
      onClick: (port) => handleCheckStatus(port),
      variant: 'ghost'
    }
  ];

  // Bulk actions
  const bulkActions = [
    {
      label: 'Check Status',
      icon: <Activity className="h-4 w-4" />,
      onClick: (ports: Port[]) => handleBulkCheckStatus(ports),
      variant: 'outline' as const
    },
    {
      label: 'Export',
      icon: <Download className="h-4 w-4" />,
      onClick: (ports: Port[]) => handleExportPorts(ports),
      variant: 'outline' as const
    }
  ];

  // Event handlers
  const handleViewDetails = (port: Port) => {
    // Could open a modal with detailed port information
    toast({
      title: `Port ${port.port} Details`,
      description: `${port.protocol.toUpperCase()} port on ${selectedServer}. Status: ${port.status}`
    });
  };

  const handleCheckStatus = async (port: Port) => {
    try {
      const response = await api.post('/ports/check-availability', {
        ports: [port.port],
        protocol: port.protocol,
        server: selectedServer
      });

      toast({
        title: 'Port status checked',
        description: `Port ${port.port} is ${response.data.available ? 'available' : 'in use'}`
      });
    } catch (error) {
      handleApiError(error, 'Check port status');
    }
  };

  const handleBulkCheckStatus = async (ports: Port[]) => {
    try {
      const portNumbers = ports.map(p => p.port);
      const response = await api.post('/ports/check-availability', {
        ports: portNumbers,
        protocol: 'both', // Check both protocols for bulk operation
        server: selectedServer
      });

      toast({
        title: 'Bulk status check completed',
        description: `Checked ${portNumbers.length} ports`
      });
    } catch (error) {
      handleApiError(error, 'Bulk port status check');
    }
  };

  const handleExportPorts = async (ports: Port[]) => {
    setExporting(true);
    
    try {
      // Create CSV data
      const csvHeaders = ['Port', 'Protocol', 'Status', 'Service', 'Container', 'Description', 'Last Seen'];
      const csvRows = ports.map(port => [
        port.port,
        port.protocol,
        port.status,
        port.service_name || 'Unknown',
        port.container_name || 'N/A',
        port.description || '',
        port.last_seen ? new Date(port.last_seen).toISOString() : ''
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => 
          row.map(cell => 
            typeof cell === 'string' && cell.includes(',') 
              ? `"${cell.replace(/"/g, '""')}"` 
              : cell
          ).join(',')
        )
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `ports-${selectedServer}-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export completed',
        description: `Exported ${ports.length} ports to CSV`
      });
    } catch (error) {
      handleApiError(error, 'Export ports');
    } finally {
      setExporting(false);
    }
  };

  const handleSearchChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, search: value });
  }, [filters, onFiltersChange]);

  const handleStatusFilterChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, status: value || undefined });
  }, [filters, onFiltersChange]);

  const handleProtocolFilterChange = useCallback((value: string) => {
    onFiltersChange({ ...filters, protocol: value || undefined });
  }, [filters, onFiltersChange]);

  // Filter data based on current filters
  const filteredPorts = useMemo(() => {
    return ports.filter(port => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = (
          port.port.toString().includes(searchLower) ||
          port.service_name?.toLowerCase().includes(searchLower) ||
          port.container_name?.toLowerCase().includes(searchLower) ||
          port.description?.toLowerCase().includes(searchLower)
        );
        if (!matchesSearch) return false;
      }

      // Status filter
      if (filters.status && port.status !== filters.status) {
        return false;
      }

      // Protocol filter
      if (filters.protocol && port.protocol !== filters.protocol) {
        return false;
      }

      return true;
    });
  }, [ports, filters]);

  // Get summary statistics
  const summary = useMemo(() => {
    const total = filteredPorts.length;
    const byStatus = filteredPorts.reduce((acc, port) => {
      acc[port.status] = (acc[port.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byProtocol = filteredPorts.reduce((acc, port) => {
      acc[port.protocol] = (acc[port.protocol] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, byStatus, byProtocol };
  }, [filteredPorts]);

  // Table filters configuration
  const tableFilters = [
    {
      key: 'status',
      label: 'Status',
      options: statusOptions,
      value: filters.status || '',
      onChange: handleStatusFilterChange
    },
    {
      key: 'protocol', 
      label: 'Protocol',
      options: protocolOptions,
      value: filters.protocol || '',
      onChange: handleProtocolFilterChange
    }
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Ports</p>
              <p className="text-2xl font-bold">{summary.total}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Open</p>
              <p className="text-2xl font-bold text-green-600">{summary.byStatus.open || 0}</p>
            </div>
            <Shield className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Filtered/Closed</p>
              <p className="text-2xl font-bold text-red-600">
                {(summary.byStatus.filtered || 0) + (summary.byStatus.closed || 0)}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">TCP/UDP</p>
              <p className="text-lg font-bold">
                {summary.byProtocol.tcp || 0}/{summary.byProtocol.udp || 0}
              </p>
            </div>
            <Activity className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Alerts */}
      {summary.byStatus.filtered > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {summary.byStatus.filtered} filtered ports detected. These may indicate security restrictions or firewall rules.
          </AlertDescription>
        </Alert>
      )}

      {/* Data Table */}
      <LoadingWrapper
        loading={loading}
        error={error}
        loadingType="table"
        loadingProps={{ rows: 10, columns: 7 }}
        onRetry={onRefresh}
      >
        <DataTable
          data={filteredPorts}
          columns={columns}
          loading={loading}
          error={error}
          searchable
          searchValue={filters.search || ''}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Search ports, services, containers..."
          filters={tableFilters}
          actions={actions}
          bulkActions={bulkActions}
          selectable
          selectedItems={selectedPorts}
          onSelectionChange={setSelectedPorts}
          getItemId={(port) => `${port.port}-${port.protocol}`}
          onRefresh={onRefresh}
          emptyMessage="No ports found matching the current filters"
        />
      </LoadingWrapper>
    </div>
  );
}