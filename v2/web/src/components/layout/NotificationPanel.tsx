/**
 * Notification Panel
 * Shows recent activity from audit logs with mark as read functionality
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, X, Check, AlertCircle, RefreshCw, Trash2, Plus, Edit, LogIn, LogOut, CloudUpload, CheckCheck } from 'lucide-react';
import { healthApi, type AuditLog } from '../../api';
import { Badge } from '../common';

interface NotificationPanelProps {
  className?: string;
}

const LAST_READ_KEY = 'trafegodns_notifications_last_read';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="w-4 h-4 text-green-500" />,
  update: <Edit className="w-4 h-4 text-blue-500" />,
  delete: <Trash2 className="w-4 h-4 text-red-500" />,
  orphan: <AlertCircle className="w-4 h-4 text-yellow-500" />,
  login: <LogIn className="w-4 h-4 text-purple-500" />,
  logout: <LogOut className="w-4 h-4 text-gray-500" />,
  sync: <RefreshCw className="w-4 h-4 text-cyan-500" />,
  deploy: <CloudUpload className="w-4 h-4 text-orange-500" />,
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  orphan: 'Orphaned',
  login: 'Logged in',
  logout: 'Logged out',
  sync: 'Synced',
  deploy: 'Deployed',
};

const RESOURCE_LABELS: Record<string, string> = {
  dnsRecord: 'DNS Record',
  dns_record: 'DNS Record',
  provider: 'Provider',
  webhook: 'Webhook',
  tunnel: 'Tunnel',
  user: 'User',
  setting: 'Setting',
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

function NotificationItem({ log, isUnread }: { log: AuditLog; isUnread: boolean }) {
  const icon = ACTION_ICONS[log.action] || <AlertCircle className="w-4 h-4 text-gray-400" />;
  const actionLabel = ACTION_LABELS[log.action] || log.action;
  const resourceLabel = RESOURCE_LABELS[log.resourceType] || log.resourceType;

  // Get a meaningful name from details if available
  const details = log.details as Record<string, string | undefined> | undefined;
  const resourceName = details?.name || details?.hostname || details?.username || log.resourceId?.slice(0, 8);

  // Check if this is an auto-discovery event (no userId means system/auto)
  const isAuto = !log.userId;

  return (
    <div className={`flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
      {/* Unread indicator */}
      <div className="flex-shrink-0 mt-2">
        {isUnread ? (
          <span className="w-2 h-2 bg-blue-500 rounded-full block"></span>
        ) : (
          <span className="w-2 h-2 block"></span>
        )}
      </div>
      <div className="flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white">
          <span className="font-medium">{actionLabel}</span>{' '}
          <span className="text-gray-600 dark:text-gray-400">{resourceLabel}</span>
          {resourceName && (
            <span className="text-gray-500 dark:text-gray-500 truncate"> - {resourceName}</span>
          )}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
          <span>{formatTimeAgo(log.createdAt)}</span>
          {isAuto ? (
            <span className="px-1.5 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 rounded text-[10px] font-medium">AUTO</span>
          ) : (
            <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-[10px] font-medium">MANUAL</span>
          )}
        </p>
      </div>
    </div>
  );
}

export function NotificationPanel({ className }: NotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastReadTime, setLastReadTime] = useState<string | null>(() => {
    return localStorage.getItem(LAST_READ_KEY);
  });
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch recent audit logs
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-notifications'],
    queryFn: () => healthApi.getAuditLogs({ limit: 20 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Calculate unread count
  const unreadCount = useMemo(() => {
    if (!data?.logs || !lastReadTime) {
      return data?.logs?.length ?? 0;
    }
    const lastRead = new Date(lastReadTime).getTime();
    return data.logs.filter(log => new Date(log.createdAt).getTime() > lastRead).length;
  }, [data?.logs, lastReadTime]);

  // Mark all as read
  const markAllAsRead = () => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, now);
    setLastReadTime(now);
  };

  // Check if a log is unread
  const isUnread = (log: AuditLog) => {
    if (!lastReadTime) return true;
    return new Date(log.createdAt).getTime() > new Date(lastReadTime).getTime();
  };

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
        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 relative"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="info" size="sm">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => refetch()}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load notifications</p>
              </div>
            ) : isLoading && !data ? (
              <div className="p-4 text-center">
                <RefreshCw className="w-6 h-6 text-gray-400 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
              </div>
            ) : data?.logs?.length === 0 ? (
              <div className="p-8 text-center">
                <Check className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
              </div>
            ) : (
              data?.logs?.map((log) => (
                <NotificationItem key={log.id} log={log} isUnread={isUnread(log)} />
              ))
            )}
          </div>

          {/* Footer */}
          {hasNotifications && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing last {data?.logs?.length ?? 0} activities
              </p>
              <a
                href="/audit"
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                onClick={() => setIsOpen(false)}
              >
                View all
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
