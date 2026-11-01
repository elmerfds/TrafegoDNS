/**
 * Dashboard Page
 */
import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Cable, Webhook, CheckCircle, XCircle, Activity, Clock, Database, ArrowUpRight } from 'lucide-react';
import { healthApi, dnsApi, providersApi, tunnelsApi, webhooksApi } from '../api';
import { Badge } from '../components/common';
import { ProviderIcon } from '../components/common/ProviderIcon';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  gradient: string;
  subtitle?: string;
  href?: string;
}

function StatCard({ title, value, icon: Icon, gradient, subtitle, href }: StatCardProps) {
  const content = (
    <div className={`relative overflow-hidden rounded-2xl p-6 ${gradient} shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.02] group`}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 rounded-full bg-black/10 blur-xl" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          <p className="text-4xl font-bold text-white mt-2 tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-white/60 mt-2">{subtitle}</p>}
        </div>
        <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>

      {href && (
        <div className="mt-4 flex items-center text-white/70 text-sm group-hover:text-white transition-colors">
          <span>View details</span>
          <ArrowUpRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Welcome back! Here's your DNS management overview.
          </p>
        </div>
        <Badge
          variant={health?.status === 'healthy' ? 'success' : health?.status === 'degraded' ? 'warning' : 'error'}
          className="text-sm px-3 py-1.5"
        >
          <span className="relative flex h-2 w-2 mr-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${health?.status === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${health?.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          {health?.status ?? 'checking...'}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="DNS Records"
          value={dnsRecords?.pagination.total ?? 0}
          icon={Globe}
          gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700"
          subtitle="Total managed records"
          href="/dns"
        />
        <StatCard
          title="Providers"
          value={`${activeProviders}/${providers?.length ?? 0}`}
          icon={Server}
          gradient="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700"
          subtitle="Active providers"
          href="/providers"
        />
        <StatCard
          title="Tunnels"
          value={`${activeTunnels}/${tunnels?.length ?? 0}`}
          icon={Cable}
          gradient="bg-gradient-to-br from-purple-500 via-purple-600 to-fuchsia-700"
          subtitle="Active tunnels"
          href="/tunnels"
        />
        <StatCard
          title="Webhooks"
          value={`${enabledWebhooks}/${webhooks?.length ?? 0}`}
          icon={Webhook}
          gradient="bg-gradient-to-br from-orange-500 via-orange-600 to-red-600"
          subtitle="Enabled webhooks"
          href="/webhooks"
        />
      </div>

      {/* Provider Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Provider Status</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your DNS providers</p>
          </div>
          <Badge variant="default">{providers?.length ?? 0} configured</Badge>
        </div>
        {providers && providers.length > 0 ? (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
              >
                <div className="flex items-center">
                  <ProviderIcon type={provider.type} className="w-10 h-10" />
                  <div className="ml-4">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{provider.name}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{provider.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {provider.isDefault && (
                    <Badge variant="info">Default</Badge>
                  )}
                  <Badge variant={provider.enabled ? 'success' : 'warning'}>
                    {provider.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Server className="w-8 h-8 text-gray-400" />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white">No providers configured</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              Add a DNS provider to start managing your DNS records automatically.
            </p>
            <a
              href="/providers"
              className="inline-flex items-center mt-4 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              Add Provider
              <ArrowUpRight className="w-4 h-4 ml-1" />
            </a>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="card">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Information</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Runtime status and health checks</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-500/20">
              <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Version</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{health?.version ?? '-'}</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
            <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-500/20">
              <Clock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="ml-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Uptime</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                {health?.uptime ? formatUptime(health.uptime) : '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800 rounded-xl border border-gray-200/50 dark:border-gray-700/50">
            <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-500/20">
              <Database className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Database</p>
              <div className="flex items-center mt-1">
                {health?.checks.database ? (
                  <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle className="w-5 h-5 mr-1.5" />
                    <span className="font-semibold">Connected</span>
                  </span>
                ) : (
                  <span className="flex items-center text-red-600 dark:text-red-400">
                    <XCircle className="w-5 h-5 mr-1.5" />
                    <span className="font-semibold">Disconnected</span>
                  </span>
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
