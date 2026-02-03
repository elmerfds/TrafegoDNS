/**
 * Dashboard Page
 */
import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Cable, Webhook, AlertTriangle } from 'lucide-react';
import { healthApi, dnsApi, providersApi, tunnelsApi, webhooksApi } from '../api';
import { Badge } from '../components/common';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
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
        <h3 className="text-lg font-medium text-gray-900 mb-4">Provider Status</h3>
        {health?.checks.providers && health.checks.providers.length > 0 ? (
          <div className="space-y-3">
            {health.checks.providers.map((provider) => (
              <div key={provider.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center">
                  <Server className="w-5 h-5 text-gray-400 mr-3" />
                  <span className="text-sm font-medium text-gray-900">{provider.name}</span>
                </div>
                <Badge variant={provider.connected ? 'success' : 'error'}>
                  {provider.connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p>No providers configured</p>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Version</p>
            <p className="text-sm font-medium text-gray-900">{health?.version ?? '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Uptime</p>
            <p className="text-sm font-medium text-gray-900">
              {health?.uptime ? formatUptime(health.uptime) : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Database</p>
            <Badge variant={health?.checks.database ? 'success' : 'error'}>
              {health?.checks.database ? 'Connected' : 'Disconnected'}
            </Badge>
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
