/**
 * Logs Page
 * Combined view for Audit Log and Application Log with tabs
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi, type AuditLog } from '../api';
import { Badge, Modal, Button, Select } from '../components/common';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus, Edit, Trash2, LogIn, LogOut, RefreshCw, CloudUpload,
  AlertCircle, User, Clock, Globe, Server, Webhook, Settings,
  ChevronRight, FileText, Terminal, Pause, Play, Download
} from 'lucide-react';

type TabType = 'audit' | 'application';

// ============================================================================
// Audit Log Tab Components
// ============================================================================

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  create: { icon: Plus, color: 'text-green-500 bg-green-100 dark:bg-green-900/30', label: 'Created' },
  update: { icon: Edit, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30', label: 'Updated' },
  delete: { icon: Trash2, color: 'text-red-500 bg-red-100 dark:bg-red-900/30', label: 'Deleted' },
  orphan: { icon: AlertCircle, color: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30', label: 'Orphaned' },
  login: { icon: LogIn, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30', label: 'Login' },
  logout: { icon: LogOut, color: 'text-gray-500 bg-gray-100 dark:bg-gray-800', label: 'Logout' },
  sync: { icon: RefreshCw, color: 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30', label: 'Synced' },
  deploy: { icon: CloudUpload, color: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30', label: 'Deployed' },
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
  const isAuto = !log.userId;

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${actionConfig.color}`}>
          <ActionIcon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 dark:text-white">{actionConfig.label}</span>
            <ResourceIcon className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">{log.resourceType.replace('_', ' ')}</span>
            {resourceName && (
              <span className="text-gray-500 dark:text-gray-400">"{resourceName}"</span>
            )}
            <Badge variant={isAuto ? 'cyan' : 'purple'} size="sm">
              {isAuto ? 'AUTO' : 'MANUAL'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {log.userId ? log.user?.username || 'User' : log.apiKeyId ? 'API Key' : 'System'}
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
  const isAuto = !log.userId;

  return (
    <Modal isOpen={!!log} onClose={onClose} title="Audit Log Details" size="md">
      <div className="space-y-6">
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className={`p-3 rounded-lg ${actionConfig.color}`}>
            <ActionIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {actionConfig.label} {log.resourceType.replace('_', ' ')}
              </h3>
              <Badge variant={isAuto ? 'cyan' : 'purple'} size="sm">
                {isAuto ? 'AUTO' : 'MANUAL'}
              </Badge>
            </div>
            {resourceName && (
              <p className="text-gray-500 dark:text-gray-400">"{resourceName}"</p>
            )}
          </div>
        </div>

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
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Origin</label>
            <p className="mt-1">
              {isAuto ? (
                <Badge variant="info">Auto Discovery</Badge>
              ) : (
                <Badge variant="default">{log.user?.username || 'Manual'}</Badge>
              )}
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User Agent</label>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300 break-all">
            {log.userAgent || '-'}
          </p>
        </div>

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

        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { page, limit: 50, action: actionFilter !== 'all' ? actionFilter : undefined }],
    queryFn: () => healthApi.getAuditLogs({ page, limit: 50, action: actionFilter !== 'all' ? actionFilter : undefined }),
  });

  const actionOptions = [
    { value: 'all', label: 'All Actions' },
    { value: 'create', label: 'Create' },
    { value: 'update', label: 'Update' },
    { value: 'delete', label: 'Delete' },
    { value: 'orphan', label: 'Orphan' },
    { value: 'login', label: 'Login' },
    { value: 'sync', label: 'Sync' },
    { value: 'deploy', label: 'Deploy' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Track all changes and actions in the system
        </p>
        <div className="w-48">
          <Select
            options={actionOptions}
            value={actionFilter}
            onChange={(value) => { setActionFilter(value); setPage(1); }}
            placeholder="Filter by action"
          />
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

      <AuditDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}

// ============================================================================
// Application Log Tab Components
// ============================================================================

interface LogLine {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
}

function parseLogLine(line: string): LogLine {
  // Try to parse as JSON (pino format)
  try {
    const parsed = JSON.parse(line);
    return {
      timestamp: parsed.time ? new Date(parsed.time).toISOString() : new Date().toISOString(),
      level: parsed.level ? getLevelName(parsed.level) : 'info',
      message: parsed.msg || line,
      raw: line,
    };
  } catch {
    // Fallback for non-JSON logs
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: line,
      raw: line,
    };
  }
}

function getLevelName(level: number): string {
  if (level <= 10) return 'trace';
  if (level <= 20) return 'debug';
  if (level <= 30) return 'info';
  if (level <= 40) return 'warn';
  if (level <= 50) return 'error';
  return 'fatal';
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'trace': return 'text-gray-400';
    case 'debug': return 'text-blue-400';
    case 'info': return 'text-green-400';
    case 'warn': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    case 'fatal': return 'text-red-600';
    default: return 'text-gray-400';
  }
}

function ApplicationLogTab() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  // Fetch logs from API
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['application-logs'],
    queryFn: () => healthApi.getApplicationLogs({ lines: 500 }),
    refetchInterval: isPaused ? false : 2000, // Poll every 2 seconds unless paused
    staleTime: 1000,
  });

  // Update logs when data changes
  useEffect(() => {
    if (data?.logs) {
      const parsedLogs = data.logs.map(parseLogLine);
      setLogs(parsedLogs);
    }
  }, [data]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (shouldScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (levelFilter !== 'all' && log.level !== levelFilter) return false;
    if (searchFilter && !log.message.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    return true;
  });

  // Download logs
  const downloadLogs = () => {
    const content = filteredLogs.map(l => l.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trafegodns-logs-${new Date().toISOString().split('T')[0]}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const levelOptions = [
    { value: 'all', label: 'All Levels' },
    { value: 'trace', label: 'Trace' },
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-40">
            <Select
              options={levelOptions}
              value={levelFilter}
              onChange={setLevelFilter}
              placeholder="Filter level"
              size="sm"
            />
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-3 pr-8 py-1.5 w-64 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={downloadLogs}
          >
            Download
          </Button>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="card p-0 overflow-hidden">
        {isLoading && logs.length === 0 ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 text-gray-400 mx-auto animate-spin" />
            <p className="mt-2 text-gray-500">Loading application logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center">
            <Terminal className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-2 text-gray-500">No logs found</p>
          </div>
        ) : (
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="h-[600px] overflow-auto bg-gray-900 dark:bg-gray-950 p-4 font-mono text-xs"
          >
            {filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-2 hover:bg-gray-800/50 py-0.5 px-1 -mx-1 rounded">
                <span className="text-gray-500 flex-shrink-0 w-44">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className={`flex-shrink-0 w-12 uppercase font-semibold ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-gray-300 break-all">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {filteredLogs.length} log entries
          {levelFilter !== 'all' && ` (filtered by ${levelFilter})`}
          {searchFilter && ` (searching for "${searchFilter}")`}
        </span>
        <span className="flex items-center gap-2">
          {isPaused ? (
            <Badge variant="warning" size="sm">Paused</Badge>
          ) : (
            <Badge variant="success" size="sm">Live</Badge>
          )}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Logs Page
// ============================================================================

export function LogsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('audit');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Logs</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          View system audit trail and application logs
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'audit'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Audit Log
          </button>
          <button
            onClick={() => setActiveTab('application')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'application'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Application Log
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'audit' && <AuditLogTab />}
      {activeTab === 'application' && <ApplicationLogTab />}
    </div>
  );
}

// Keep backward compatibility export
export { LogsPage as AuditLogPage };
