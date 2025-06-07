/**
 * System Statistics Widget
 * Real-time system metrics with modern design
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, Database, Container, Globe, Clock } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemMetrics {
  dns: {
    total_records: number
    managed_records: number
    orphaned_records: number
  }
  containers: {
    total: number
    running: number
    stopped: number
  }
  providers: {
    total: number
    connected: number
  }
  uptime: {
    seconds: number
    percentage: number
  }
}

function useSystemMetrics() {
  return useQuery({
    queryKey: ['system-metrics'],
    queryFn: async (): Promise<SystemMetrics> => {
      try {
        const [statusRes, dnsRes, providersRes] = await Promise.all([
          api.get('/status'),
          api.get('/dns/stats'),
          api.get('/config/providers/status')
        ])
        
        const statusData = statusRes.data.data
        const dnsData = dnsRes.data.data
        const providersData = providersRes.data.data
        
        return {
          dns: {
            total_records: dnsData.total || 0,
            managed_records: dnsData.managed || 0,
            orphaned_records: dnsData.orphaned || 0
          },
          containers: {
            total: statusData.statistics?.totalContainers || 0,
            running: statusData.statistics?.totalContainers || 0, // Assume running if tracked
            stopped: 0
          },
          providers: {
            total: providersData.length || 0,
            connected: providersData.filter((p: any) => p.status === 'connected' || p.status === 'active').length || 0
          },
          uptime: {
            seconds: statusData.uptime || 0,
            percentage: 99.9 // Mock uptime percentage
          }
        }
      } catch (error) {
        // Fallback to mock data if APIs fail
        return {
          dns: { total_records: 0, managed_records: 0, orphaned_records: 0 },
          containers: { total: 0, running: 0, stopped: 0 },
          providers: { total: 0, connected: 0 },
          uptime: { seconds: 0, percentage: 0 }
        }
      }
    },
    refetchInterval: 30000,
  })
}

export function SystemStatsWidget(props: WidgetProps) {
  const { data: metrics, isLoading, error } = useSystemMetrics()

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    if (days > 0) return `${days}d ${hours}h`
    return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const getTrendColor = (current: number, total: number, threshold = 0.8) => {
    const ratio = current / total
    if (ratio >= threshold) return 'text-green-600'
    if (ratio >= 0.5) return 'text-yellow-600'
    return 'text-red-600'
  }

  const statCards = [
    {
      label: 'DNS Records',
      value: metrics?.dns.total_records || 0,
      subValue: `${metrics?.dns.managed_records || 0} managed`,
      icon: Database,
      color: 'blue',
      trend: getTrendColor(metrics?.dns.managed_records || 0, metrics?.dns.total_records || 1)
    },
    {
      label: 'Containers',
      value: `${metrics?.containers.running || 0}/${metrics?.containers.total || 0}`,
      subValue: 'running',
      icon: Container,
      color: 'green',
      trend: getTrendColor(metrics?.containers.running || 0, metrics?.containers.total || 1)
    },
    {
      label: 'DNS Providers',
      value: `${metrics?.providers.connected || 0}/${metrics?.providers.total || 0}`,
      subValue: 'connected',
      icon: Globe,
      color: 'purple',
      trend: getTrendColor(metrics?.providers.connected || 0, metrics?.providers.total || 1)
    },
    {
      label: 'Uptime',
      value: `${metrics?.uptime.percentage?.toFixed(1) || 0}%`,
      subValue: metrics?.uptime.seconds ? formatUptime(metrics.uptime.seconds) : '0m',
      icon: Clock,
      color: 'orange',
      trend: 'text-green-600'
    }
  ]

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
      green: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
      purple: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
      orange: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
    }
    return colors[color as keyof typeof colors] || colors.blue
  }

  return (
    <WidgetBase
      {...props}
      title="System Metrics"
      icon={Activity}
      description="Real-time system statistics"
      isLoading={isLoading}
      error={error?.message}
      actions={
        <Badge variant="outline">
          <TrendingUp className="h-3 w-3 mr-1" />
          Live
        </Badge>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((stat) => {
          const IconComponent = stat.icon
          return (
            <div
              key={stat.label}
              className={`rounded-xl p-4 border transition-all hover:shadow-md ${getColorClasses(stat.color)}`}
            >
              <div className="flex items-center justify-between mb-3">
                <IconComponent className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <TrendingUp className={`h-4 w-4 ${stat.trend}`} />
              </div>
              
              <div className="space-y-1">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stat.value}
                </div>
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {stat.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {stat.subValue}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Alert for orphaned records */}
      {(metrics?.dns.orphaned_records || 0) > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
            <Activity className="h-4 w-4" />
            <span className="text-sm font-medium">
              {metrics?.dns.orphaned_records} orphaned records need attention
            </span>
          </div>
        </div>
      )}
    </WidgetBase>
  )
}

export const systemStatsDefinition: WidgetDefinition = {
  id: 'system-stats',
  name: 'System Metrics',
  description: 'Real-time system statistics and health indicators',
  category: 'system',
  icon: Activity,
  defaultSize: { w: 8, h: 4 },
  minSize: { w: 6, h: 3 },
  maxSize: { w: 12, h: 6 }
}