import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Globe, Container, Link2 } from 'lucide-react'

export function DashboardPage() {
  const { data: statusResponse } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const response = await api.get('/status')
      return response.data
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const status = statusResponse?.data

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.name}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-medium">{status?.version || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mode</span>
            <span className="font-medium">{status?.mode || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">DNS Provider</span>
            <span className="font-medium">{status?.provider || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Uptime</span>
            <span className="font-medium">{status?.uptime || 'N/A'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}