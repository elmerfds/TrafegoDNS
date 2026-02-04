/**
 * Dashboard Page
 */
import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Cable, Webhook, CheckCircle, XCircle, Activity, Clock, Database } from 'lucide-react';
import { healthApi, dnsApi, providersApi, tunnelsApi, webhooksApi } from '../api';
import { Badge } from '../components/common';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  return (
    <div className="card hover:shadow-lg transition-shadow duration-200 border-l-4" style={{ borderLeftColor: color.replace('bg-', '') }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-4 rounded-xl ${color} bg-opacity-10`}>
          <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.getHealth(),
    refetchInterval: 30000,
  });

  const { data: dnsRecords } = useQuery({
    queryKey: ['dns-records', { limit: 1 }],
    queryFn: () => dnsApi.listRecords({ limit: 1 }),
  });

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providersApi.listProviders(),
  });

  const { data: tunnels } = useQuery({
    queryKey: ['tunnels'],
    queryFn: () => tunnelsApi.listTunnels(),
  });

  const { data: webhooks } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => webhooksApi.listWebhooks(),
  });

  const activeProviders = providers?.filter((p) => p.enabled).length ?? 0;
  const activeTunnels = tunnels?.filter((t) => t.status === 'active').length ?? 0;
  const enabledWebhooks = webhooks?.filter((w) => w.enabled).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">System Status</h2>
        <Badge
          variant={health?.status === 'healthy' ? 'success' : health?.status === 'degraded' ? 'warning' : 'error'}
        >
          {health?.status ?? 'unknown'}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="DNS Records"
          value={dnsRecords?.pagination.total ?? 0}
          icon={Globe}
          color="bg-blue-500"
          subtitle="Total managed records"
        />
        <StatCard
          title="Providers"
          value={`${activeProviders}/${providers?.length ?? 0}`}
          icon={Server}
          color="bg-green-500"
          subtitle="Active providers"
        />
        <StatCard
          title="Tunnels"
          value={`${activeTunnels}/${tunnels?.length ?? 0}`}
          icon={Cable}
          color="bg-purple-500"
          subtitle="Active tunnels"
        />
        <StatCard
          title="Webhooks"
          value={`${enabledWebhooks}/${webhooks?.length ?? 0}`}
          icon={Webhook}
          color="bg-orange-500"
          subtitle="Enabled webhooks"
        />
      </div>

      {/* Provider Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Provider Status</h3>
          <Badge variant="default">{providers?.length ?? 0} configured</Badge>
        </div>
        {providers && providers.length > 0 ? (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center">
                  <div className={`p-2 rounded-lg ${provider.enabled ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <Server className={`w-5 h-5 ${provider.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                  </div>
                  <div className="ml-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{provider.name}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{provider.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {provider.isDefault && (
                    <Badge variant="info" size="sm">Default</Badge>
                  )}
                  <Badge variant={provider.enabled ? 'success' : 'warning'}>
                    {provider.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Server className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="font-medium">No providers configured</p>
            <p className="text-sm mt-1">Add a DNS provider to get started</p>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Activity className="w-8 h-8 text-blue-500 mr-3" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Version</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{health?.version ?? '-'}</p>
            </div>
          </div>
          <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Clock className="w-8 h-8 text-green-500 mr-3" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Uptime</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {health?.uptime ? formatUptime(health.uptime) : '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Database className="w-8 h-8 text-purple-500 mr-3" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Database</p>
              <div className="flex items-center mt-1">
                {health?.checks.database ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500 mr-1" />
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}
