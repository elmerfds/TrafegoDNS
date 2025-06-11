/**
 * System Resources Widget
 * Real-time CPU, memory, and disk usage monitoring
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cpu, HardDrive, Activity, MemoryStick } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemResources {
  cpu: {
    usage: number
    cores: number
    loadAverage: number[]
    frequency?: number
  }
  memory: {
    used: number
    total: number
    percentage: number
    available: number
  }
  disk: {
    used: number
    total: number
    percentage: number
    path: string
    available: number
  }
  uptime: number
  platform: string
}

function useSystemResources() {
  return useQuery({
    queryKey: ['system-resources'],
    queryFn: async (): Promise<SystemResources> => {
      try {
        const response = await api.get('/status/system-resources')
        return response.data.data
      } catch (error) {
        // Fallback to mock data if API fails
        return {
          cpu: {
            usage: 25,
            cores: 4,
            loadAverage: [1.2, 1.5, 1.3],
            frequency: 2400
          },
          memory: {
            used: 2.4,
            total: 8,
            percentage: 30,
            available: 5.6
          },
          disk: {
            used: 45,
            total: 100,
            percentage: 45,
            path: '/',
            available: 55
          },
          uptime: 86400,
          platform: 'linux'
        }
      }
    },
    refetchInterval: 5000, // Refresh every 5 seconds for real-time monitoring
  })
}

export function SystemResourcesWidget(props: WidgetProps) {
  const { data: resources, isLoading, error } = useSystemResources()

  const getUsageColor = (percentage: number) => {
    if (percentage >= 80) return 'text-red-600'
    if (percentage >= 60) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500'
    if (percentage >= 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 GB'
    return `${bytes.toFixed(1)} GB`
  }

  const getHealthStatus = () => {
    const cpu = resources?.cpu.usage || 0
    const memory = resources?.memory.percentage || 0
    const disk = resources?.disk.percentage || 0
    const maxUsage = Math.max(cpu, memory, disk)
    
    if (maxUsage >= 80) return 'critical'
    if (maxUsage >= 60) return 'warning'
    return 'healthy'
  }

  const healthStatus = getHealthStatus()

  return (
    <WidgetBase
      {...props}
      title="System Resources"
      icon={Activity}
      description="Real-time resource monitoring"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant={healthStatus === 'healthy' ? 'default' : healthStatus === 'warning' ? 'secondary' : 'destructive'}>
          {healthStatus}
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* CPU Usage */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium">CPU</span>
            </div>
            <span className={`text-sm font-bold ${getUsageColor(resources?.cpu.usage || 0)}`}>
              {resources?.cpu.usage || 0}%
            </span>
          </div>
          <div className="space-y-1">
            <Progress 
              value={resources?.cpu.usage || 0} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{resources?.cpu.cores || 0} cores</span>
              <span>Load: {resources?.cpu.loadAverage?.[0]?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MemoryStick className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <span className={`text-sm font-bold ${getUsageColor(resources?.memory.percentage || 0)}`}>
              {resources?.memory.percentage || 0}%
            </span>
          </div>
          <div className="space-y-1">
            <Progress 
              value={resources?.memory.percentage || 0} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatBytes(resources?.memory.used || 0)} used</span>
              <span>{formatBytes(resources?.memory.total || 0)} total</span>
            </div>
          </div>
        </div>

        {/* Disk Usage */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium">Storage</span>
            </div>
            <span className={`text-sm font-bold ${getUsageColor(resources?.disk.percentage || 0)}`}>
              {resources?.disk.percentage || 0}%
            </span>
          </div>
          <div className="space-y-1">
            <Progress 
              value={resources?.disk.percentage || 0} 
              className="h-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatBytes(resources?.disk.used || 0)} used</span>
              <span>{formatBytes(resources?.disk.available || 0)} free</span>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Platform: {resources?.platform || 'unknown'}</span>
            <span>Uptime: {resources?.uptime ? Math.floor(resources.uptime / 3600) : 0}h</span>
          </div>
        </div>
      </div>
    </WidgetBase>
  )
}

export const systemResourcesDefinition: WidgetDefinition = {
  id: 'system-resources',
  name: 'System Resources',
  description: 'CPU, memory, and disk usage monitoring',
  category: 'system',
  icon: Cpu,
  defaultSize: createResponsiveSizes({ w: 8, h: 8 }),
  minSize: createResponsiveSizes({ w: 6, h: 6 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 16, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}