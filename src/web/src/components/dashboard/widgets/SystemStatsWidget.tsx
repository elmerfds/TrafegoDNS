/**
 * Modern System Statistics Widget
 * Displays key system metrics in a clean, responsive layout
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemStats {
  dnsRecords: number
  activeContainers: number
  providers: number
  uptime: string
  lastUpdate: string
}

// Hook for fetching system statistics
function useSystemStats() {
  return useQuery({
    queryKey: ['system-stats'],
    queryFn: async (): Promise<SystemStats> => {
      // Mock data for now - replace with actual API calls
      return {
        dnsRecords: 12,
        activeContainers: 3,
        providers: 2,
        uptime: '99.8%',
        lastUpdate: new Date().toISOString()
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

export function SystemStatsWidget(props: WidgetProps) {
  const { data: stats, isLoading, error } = useSystemStats()

  const statItems = [
    {
      name: 'DNS Records',
      value: stats?.dnsRecords || 0,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30'
    },
    {
      name: 'Active Containers',
      value: stats?.activeContainers || 0,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30'
    },
    {
      name: 'Providers',
      value: stats?.providers || 0,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30'
    },
    {
      name: 'Uptime',
      value: stats?.uptime || '0%',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30'
    }
  ]

  return (
    <WidgetBase
      {...props}
      title="System Statistics"
      icon={Activity}
      description="Key system metrics and statistics"
      isLoading={isLoading}
      error={error?.message}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full">
        {statItems.map((stat) => (
          <div
            key={stat.name}
            className={`${stat.bgColor} rounded-lg p-4 flex flex-col items-center justify-center text-center transition-all hover:scale-105`}
          >
            <div className={`text-2xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {stat.name}
            </div>
          </div>
        ))}
      </div>
      
      {stats?.lastUpdate && (
        <div className="mt-4 flex items-center justify-center text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3 mr-1" />
          Last updated: {new Date(stats.lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </WidgetBase>
  )
}

// Widget definition for registration
export const systemStatsDefinition: WidgetDefinition = {
  id: 'system-stats',
  name: 'System Statistics',
  description: 'Key system metrics and statistics',
  category: 'system',
  icon: Activity,
  defaultSize: { w: 12, h: 4 },
  minSize: { w: 6, h: 3 },
  maxSize: { w: 12, h: 6 }
}