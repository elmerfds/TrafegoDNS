import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { 
  Activity, 
  Globe, 
  Container, 
  Link2, 
  Clock,
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Shield,
  Cpu,
  HardDrive
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { RecentActivity } from '@/components/RecentActivity'

export function DashboardPage() {
  const navigate = useNavigate()
  
  const { data: statusResponse } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const response = await api.get('/status')
      return response.data
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const { data: orphanedResponse } = useQuery({
    queryKey: ['orphaned-summary'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned?limit=5')
      return response.data
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const { data: metricsResponse } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await api.get('/status/metrics')
      return response.data
    },
    refetchInterval: 5000,
  })

  const status = statusResponse?.data
  const orphaned = orphanedResponse?.data
  const metrics = metricsResponse?.data

  const stats = [
    {
      name: 'Active DNS Records',
      value: status?.statistics?.totalRecords || 0,
      icon: Globe,
      color: 'text-blue-600',
    },
    {
      name: 'Monitored Containers',
      value: status?.statistics?.totalContainers || 0,
      icon: Container,
      color: 'text-green-600',
    },
    {
      name: 'Managed Hostnames',
      value: status?.statistics?.totalHostnames || 0,
      icon: Link2,
      color: 'text-purple-600',
    },
    {
      name: 'System Status',
      value: status?.healthy ? 'Healthy' : 'Unhealthy',
      icon: Activity,
      color: status?.healthy ? 'text-green-600' : 'text-red-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your DNS records and container status in real-time
        </p>
      </div>

      {/* Main Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium leading-tight">
                {stat.name}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color} flex-shrink-0`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stat.value}</div>
              {/* Add trend indicators */}
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-xs text-muted-foreground">Stable</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Critical Alerts - Moved Higher */}
      {orphaned && orphaned.count > 0 && (
        <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800 dark:text-orange-200">Orphaned Records Detected</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-orange-700 dark:text-orange-300">
              There are {orphaned.count} orphaned DNS records that may need attention.
            </p>
            <Button 
              variant="outline" 
              size="sm"
              className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/50"
              onClick={() => navigate('/orphaned-records')}
            >
              <AlertTriangle className="h-3 w-3 mr-2" />
              View Orphaned Records
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Combined System Overview */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              System Overview
            </CardTitle>
            <CardDescription>Core system information and configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Version</span>
                <Badge variant="outline">{status?.version || 'N/A'}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Mode</span>
                <Badge variant="outline">{status?.mode || 'N/A'}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Provider</span>
                <Badge variant="outline">{status?.provider || 'N/A'}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Domain</span>
                <Badge variant="outline" className="max-w-24 sm:max-w-32 truncate text-xs">
                  {status?.services?.dnsProvider?.domain || status?.domain || 'N/A'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Uptime</span>
                <span className="font-medium text-sm">
                  {status?.uptime ? formatUptime(status.uptime) : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Service Health
            </CardTitle>
            <CardDescription>Real-time status of core services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status?.services?.dnsProvider && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">DNS Provider</span>
                </div>
                <Badge variant={status.services.dnsProvider.status === 'active' ? 'default' : 'destructive'}>
                  {status.services.dnsProvider.status}
                </Badge>
              </div>
            )}
            {status?.services?.dockerMonitor && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Container className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Docker Monitor</span>
                </div>
                <Badge 
                  variant={status.services.dockerMonitor.status === 'connected' ? 'default' : 'destructive'}
                >
                  {status.services.dockerMonitor.status}
                </Badge>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">API Server</span>
              </div>
              <Badge variant="default">active</Badge>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Overall Health</span>
                <span className="text-sm font-medium">
                  {status?.healthy ? '100%' : '0%'}
                </span>
              </div>
              <Progress 
                value={status?.healthy ? 100 : 0} 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* System Resources */}
        {metrics && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                System Resources
              </CardTitle>
              <CardDescription>Current resource utilization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Memory Usage</span>
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round((metrics.system.memory.used / metrics.system.memory.total) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={(metrics.system.memory.used / metrics.system.memory.total) * 100} 
                  className="h-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {formatBytes(metrics.system.memory.used)} / {formatBytes(metrics.system.memory.total)}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">CPU Load</span>
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round(Math.min((metrics.system.cpu.load[0] / metrics.system.cpu.cores) * 100, 100))}%
                  </span>
                </div>
                <Progress 
                  value={Math.min((metrics.system.cpu.load[0] / metrics.system.cpu.cores) * 100, 100)} 
                  className="h-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Load: {metrics.system.cpu.load[0].toFixed(2)} / {metrics.system.cpu.cores} cores
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  Process Memory: {formatBytes(metrics.process.memory.heapUsed)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {/* DNS and Container Analytics */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              DNS Records Health
            </CardTitle>
            <CardDescription>Distribution and health of DNS records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Active Records</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{status?.statistics?.totalRecords || 0}</span>
                <TrendingUp className="h-3 w-3 text-green-500" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Orphaned Records</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${(orphaned?.count || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {orphaned?.count || 0}
                </span>
                {(orphaned?.count || 0) > 0 ? 
                  <TrendingDown className="h-3 w-3 text-orange-500" /> : 
                  <CheckCircle className="h-3 w-3 text-green-500" />
                }
              </div>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Health Score</span>
                <span className="text-sm font-medium">
                  {status?.statistics?.totalRecords ? 
                    Math.round((status.statistics.totalRecords / (status.statistics.totalRecords + (orphaned?.count || 0))) * 100) : 0
                  }%
                </span>
              </div>
              <Progress 
                value={status?.statistics?.totalRecords ? 
                  ((status.statistics.totalRecords / (status.statistics.totalRecords + (orphaned?.count || 0))) * 100) : 0
                } 
                className="h-3"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Container className="h-5 w-5" />
              Container Monitoring
            </CardTitle>
            <CardDescription>Docker container DNS management status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Containers</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{status?.statistics?.totalContainers || 0}</span>
                <TrendingUp className="h-3 w-3 text-blue-500" />
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">With DNS Labels</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{status?.statistics?.totalHostnames || 0}</span>
                <TrendingUp className="h-3 w-3 text-green-500" />
              </div>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">DNS Coverage</span>
                <span className="text-sm font-medium">
                  {status?.statistics?.totalContainers ? 
                    Math.round((status.statistics.totalHostnames / status.statistics.totalContainers) * 100) : 0
                  }%
                </span>
              </div>
              <Progress 
                value={status?.statistics?.totalContainers ? 
                  ((status.statistics.totalHostnames / status.statistics.totalContainers) * 100) : 0
                } 
                className="h-3"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Frequently used management actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full justify-start"
              onClick={() => navigate('/dns-records')}
            >
              <Globe className="h-4 w-4 mr-2" />
              Manage DNS Records
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full justify-start"
              onClick={() => navigate('/containers')}
            >
              <Container className="h-4 w-4 mr-2" />
              View Containers
            </Button>
            {(orphaned?.count || 0) > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start text-orange-600 border-orange-200 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
                onClick={() => navigate('/orphaned-records')}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Fix Orphaned Records ({orphaned.count})
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full justify-start"
              onClick={() => navigate('/settings')}
            >
              <Server className="h-4 w-4 mr-2" />
              System Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <RecentActivity />

      {/* Provider Performance - Simplified */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Provider Status
            </CardTitle>
            <CardDescription>DNS provider connection and health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Provider</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{status?.provider || 'Unknown'}</Badge>
                <Badge variant={status?.services?.dnsProvider?.status === 'active' ? 'default' : 'destructive'}>
                  {status?.services?.dnsProvider?.status === 'active' ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Managed Domain</span>
              <span className="text-sm font-medium max-w-32 sm:max-w-48 truncate">
                {status?.services?.dnsProvider?.domain || status?.domain || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Records Managed</span>
              <span className="text-sm font-medium">{status?.statistics?.totalRecords || 0}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Health Score</span>
                <span className="text-sm font-medium">
                  {status?.services?.dnsProvider?.status === 'active' ? 
                    (orphaned?.count ? Math.max(70, 100 - (orphaned.count * 5)) : 100) : 0
                  }%
                </span>
              </div>
              <Progress 
                value={status?.services?.dnsProvider?.status === 'active' ? 
                  (orphaned?.count ? Math.max(70, 100 - (orphaned.count * 5)) : 100) : 0
                } 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Issues & Monitoring
            </CardTitle>
            <CardDescription>Current system issues and monitoring status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Issues</span>
              <div className="flex items-center gap-2">
                {(orphaned?.count || 0) > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-600">{orphaned.count} orphaned</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">No issues</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Sync</span>
              <span className="text-sm font-medium">
                {status?.uptime ? 'Active' : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">System Uptime</span>
              <span className="text-sm font-medium">
                {status?.uptime ? formatUptime(status.uptime) : 'N/A'}
              </span>
            </div>
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => navigate('/settings')}
              >
                <Server className="h-4 w-4 mr-2" />
                System Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Helper functions
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  
  return parts.join(' ') || '< 1m'
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let value = bytes
  
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  
  return `${value.toFixed(1)} ${units[i]}`
}