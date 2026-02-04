/**
 * Audit Log Page
 * Shows system activity with clickable entries for detailed view
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi, type AuditLog } from '../api';
import { Badge, Modal, Button } from '../components/common';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus, Edit, Trash2, LogIn, LogOut, RefreshCw, CloudUpload,
  AlertCircle, User, Clock, Globe, Server, Webhook, Settings,
  ChevronRight, Filter, X
} from 'lucide-react';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  create: { icon: Plus, color: 'text-green-500 bg-green-100 dark:bg-green-900', label: 'Created' },
  update: { icon: Edit, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900', label: 'Updated' },
  delete: { icon: Trash2, color: 'text-red-500 bg-red-100 dark:bg-red-900', label: 'Deleted' },
  login: { icon: LogIn, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900', label: 'Login' },
  logout: { icon: LogOut, color: 'text-gray-500 bg-gray-100 dark:bg-gray-900', label: 'Logout' },
  sync: { icon: RefreshCw, color: 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900', label: 'Synced' },
  deploy: { icon: CloudUpload, color: 'text-orange-500 bg-orange-100 dark:bg-orange-900', label: 'Deployed' },
};

const RESOURCE_ICONS: Record<string, React.ElementType> = {
  dns_record: Globe,
  provider: Server,
  webhook: Webhook,
  user: User,
  settings: Settings,
  tunnel: CloudUpload,
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { icon: AlertCircle, color: 'text-gray-500 bg-gray-100', label: action };
}

function getResourceIcon(resourceType: string) {
  return RESOURCE_ICONS[resourceType] || AlertCircle;
}

function getResourceName(log: AuditLog): string {
  if (log.details) {
    const details = log.details as Record<string, unknown>;
    return (details.name || details.hostname || details.username || details.email || '') as string;
  }
  return '';
}

interface AuditLogEntryProps {
  log: AuditLog;
  onClick: () => void;
}

function AuditLogEntry({ log, onClick }: AuditLogEntryProps) {
  const actionConfig = getActionConfig(log.action);
  const ActionIcon = actionConfig.icon;
  const ResourceIcon = getResourceIcon(log.resourceType);
  const resourceName = getResourceName(log);

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
    >
      <div className="flex items-center gap-4">
        {/* Action Icon */}
        <div className={`p-2 rounded-lg ${actionConfig.color}`}>
          <ActionIcon className="w-5 h-5" />
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">{actionConfig.label}</span>
            <ResourceIcon className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">{log.resourceType.replace('_', ' ')}</span>
            {resourceName && (
              <span className="text-gray-500 dark:text-gray-400">"{resourceName}"</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {log.userId ? 'User' : log.apiKeyId ? 'API Key' : 'System'}
            </span>
            <span className="font-mono">{log.ipAddress}</span>
          </div>
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-gray-400" />
    </div>
  );
}

interface AuditDetailModalProps {
  log: AuditLog | null;
  onClose: () => void;
}

function AuditDetailModal({ log, onClose }: AuditDetailModalProps) {
  if (!log) return null;

  const actionConfig = getActionConfig(log.action);
  const ActionIcon = actionConfig.icon;
  const resourceName = getResourceName(log);

  return (
    <Modal isOpen={!!log} onClose={onClose} title="Audit Log Details" size="md">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className={`p-3 rounded-lg ${actionConfig.color}`}>
            <ActionIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {actionConfig.label} {log.resourceType.replace('_', ' ')}
            </h3>
            {resourceName && (
              <p className="text-gray-500 dark:text-gray-400">"{resourceName}"</p>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">
              {new Date(log.createdAt).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</label>
            <p className="mt-1">
              <Badge variant={log.action === 'create' ? 'success' : log.action === 'delete' ? 'error' : 'info'}>
                {log.action}
              </Badge>
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resource Type</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">{log.resourceType}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resource ID</label>
            <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">{log.resourceId || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</label>
            <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">{log.ipAddress}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User Agent</label>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 truncate" title={log.userAgent}>
              {log.userAgent || '-'}
            </p>
          </div>
        </div>

        {/* Details */}
        {log.details && Object.keys(log.details).length > 0 && (
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Change Details</label>
            <div className="mt-2 p-3 bg-gray-900 dark:bg-gray-950 rounded-lg overflow-auto max-h-48">
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { page, limit: 50, action: actionFilter || undefined }],
    queryFn: () => healthApi.getAuditLogs({ page, limit: 50, action: actionFilter || undefined }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Audit Log</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Track all changes and actions in the system
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="sync">Sync</option>
            </select>
          </div>
          {actionFilter && (
            <button
              onClick={() => setActionFilter('')}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Audit Entries */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 mx-auto animate-spin" />
            <p className="mt-2 text-gray-500">Loading audit logs...</p>
          </div>
        ) : data?.logs.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-2 text-gray-500">No audit logs found</p>
          </div>
        ) : (
          <>
            {data?.logs.map((log) => (
              <AuditLogEntry
                key={log.id}
                log={log}
                onClick={() => setSelectedLog(log)}
              />
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((page - 1) * data.pagination.limit) + 1} to {Math.min(page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} entries
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === data.pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
