/**
 * Audit Log Page
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi, type AuditLog } from '../api';
import { Table, Pagination, Badge } from '../components/common';
import { formatDistanceToNow } from 'date-fns';

export function AuditLogPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { page, limit: 50 }],
    queryFn: () => healthApi.getAuditLogs({ page, limit: 50 }),
  });

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'create':
        return 'success';
      case 'update':
        return 'info';
      case 'delete':
        return 'error';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      key: 'createdAt',
      header: 'Time',
      render: (row: AuditLog) => (
        <div>
          <p className="text-sm text-gray-900">
            {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(row.createdAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row: AuditLog) => (
        <Badge variant={getActionBadgeVariant(row.action)}>{row.action}</Badge>
      ),
    },
    {
      key: 'resourceType',
      header: 'Resource',
      render: (row: AuditLog) => (
        <div>
          <span className="font-medium text-gray-900">{row.resourceType}</span>
          {row.resourceId && (
            <span className="text-gray-500 ml-1 text-xs">({row.resourceId.slice(0, 8)}...)</span>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row: AuditLog) => (
        <span className="text-xs text-gray-500 font-mono">
          {row.details ? JSON.stringify(row.details).slice(0, 50) : '-'}
        </span>
      ),
    },
    {
      key: 'userId',
      header: 'User',
      render: (row: AuditLog) => (
        <span className="text-sm text-gray-500">
          {row.userId ? row.userId.slice(0, 8) + '...' : row.apiKeyId ? 'API Key' : 'System'}
        </span>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      render: (row: AuditLog) => (
        <span className="font-mono text-xs text-gray-500">{row.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500">
            Track all changes and actions in the system
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0">
        <Table
          columns={columns}
          data={data?.logs ?? []}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="No audit logs found"
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
    </div>
  );
}
