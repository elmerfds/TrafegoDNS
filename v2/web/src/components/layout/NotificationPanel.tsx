/**
 * Notification Panel
 * Shows recent activity from audit logs
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, X, Check, AlertCircle, RefreshCw, Trash2, Plus, Edit, LogIn, LogOut, CloudUpload } from 'lucide-react';
import { healthApi, type AuditLog } from '../../api';

interface NotificationPanelProps {
  className?: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="w-4 h-4 text-green-500" />,
  update: <Edit className="w-4 h-4 text-blue-500" />,
  delete: <Trash2 className="w-4 h-4 text-red-500" />,
  login: <LogIn className="w-4 h-4 text-purple-500" />,
  logout: <LogOut className="w-4 h-4 text-gray-500" />,
  sync: <RefreshCw className="w-4 h-4 text-cyan-500" />,
  deploy: <CloudUpload className="w-4 h-4 text-orange-500" />,
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Logged in',
  logout: 'Logged out',
  sync: 'Synced',
  deploy: 'Deployed',
};

const RESOURCE_LABELS: Record<string, string> = {
  dns_record: 'DNS Record',
  provider: 'Provider',
  webhook: 'Webhook',
  tunnel: 'Tunnel',
  user: 'User',
  settings: 'Settings',
  api_key: 'API Key',
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function NotificationItem({ log }: { log: AuditLog }) {
  const icon = ACTION_ICONS[log.action] || <AlertCircle className="w-4 h-4 text-gray-400" />;
  const actionLabel = ACTION_LABELS[log.action] || log.action;
  const resourceLabel = RESOURCE_LABELS[log.resourceType] || log.resourceType;

  // Get a meaningful name from details if available
  const resourceName = log.details?.name || log.details?.hostname || log.details?.username || log.resourceId?.slice(0, 8);

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{actionLabel}</span>{' '}
          <span className="text-gray-600">{resourceLabel}</span>
          {resourceName && (
            <span className="text-gray-500 truncate"> - {resourceName}</span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatTimeAgo(log.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function NotificationPanel({ className }: NotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch recent audit logs
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-notifications'],
    queryFn: () => healthApi.getAuditLogs({ limit: 10 }),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isOpen, // Only fetch when panel is open
  });

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch on first open
  useEffect(() => {
    if (isOpen) {
      refetch();
    }
  }, [isOpen, refetch]);

  const hasNotifications = (data?.logs?.length ?? 0) > 0;

  return (
    <div ref={panelRef} className={`relative ${className ?? ''}`}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-500 hover:text-gray-700 relative"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {hasNotifications && !isOpen && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {error ? (
              <div className="p-4 text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Failed to load notifications</p>
              </div>
            ) : isLoading && !data ? (
              <div className="p-4 text-center">
                <RefreshCw className="w-6 h-6 text-gray-400 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-500">Loading...</p>
              </div>
            ) : data?.logs?.length === 0 ? (
              <div className="p-8 text-center">
                <Check className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No recent activity</p>
              </div>
            ) : (
              data?.logs?.map((log) => (
                <NotificationItem key={log.id} log={log} />
              ))
            )}
          </div>

          {/* Footer */}
          {hasNotifications && (
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-500 text-center">
                Showing last {data?.logs?.length ?? 0} activities
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
