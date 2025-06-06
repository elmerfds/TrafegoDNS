/**
 * System Resources Widget
 * Shows CPU, memory, and disk usage
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cpu, HardDrive, Activity } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Progress } from '@/components/ui/progress'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemResources {
  cpu: {
    usage: number
    cores: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    percentage: number
  }
  disk: {
    used: number
    total: number
    percentage: number
    path: string
  }
  lastUpdate: string
}

function useSystemResources() {
  return useQuery({
    queryKey: ['system-resources'],
    queryFn: async (): Promise<SystemResources> => {
      // Mock data - in a real app, this would come from a system monitoring API
      return {
        cpu: {
          usage: Math.floor(Math.random() * 40) + 10, // 10-50%
          cores: 4,
          loadAverage: [1.2, 1.5, 1.3]
        },
        memory: {
          used: 2.4,
          total: 8,
          percentage: 30
        },
        disk: {
          used: 45,
          total: 100,
          percentage: 45,
          path: '/'
        },
        lastUpdate: new Date().toISOString()
      }
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export function SystemResourcesWidget(props: WidgetProps) {
  const { data: resources, isLoading, error } = useSystemResources()

  const getUsageColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500'
    if (percentage >= 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <WidgetBase
      {...props}
      title="System Resources"
      icon={Activity}
      description="CPU, memory, and disk usage"
      isLoading={isLoading}
      error={error?.message}
    >
      <div className="space-y-4">
        {/* CPU Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">CPU</span>
            </div>
            <span className="text-sm text-muted-foreground">{resources?.cpu.usage || 0}%</span>
          </div>
          <Progress 
            value={resources?.cpu.usage || 0} 
            className={`h-2 ${getUsageColor(resources?.cpu.usage || 0)}`}
          />
          <div className="text-xs text-muted-foreground">
            {resources?.cpu.cores || 0} cores • Load: {resources?.cpu.loadAverage?.[0]?.toFixed(2) || '0.00'}
          </div>
        </div>

        {/* Memory Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <span className="text-sm text-muted-foreground">{resources?.memory.percentage || 0}%</span>
          </div>
          <Progress 
            value={resources?.memory.percentage || 0} 
            className={`h-2 ${getUsageColor(resources?.memory.percentage || 0)}`}
          />
          <div className="text-xs text-muted-foreground">
            {resources?.memory.used || 0} GB / {resources?.memory.total || 0} GB used
          </div>
        </div>

        {/* Disk Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium">Disk</span>
            </div>
            <span className="text-sm text-muted-foreground">{resources?.disk.percentage || 0}%</span>
          </div>
          <Progress 
            value={resources?.disk.percentage || 0} 
            className={`h-2 ${getUsageColor(resources?.disk.percentage || 0)}`}
          />
          <div className="text-xs text-muted-foreground">
            {resources?.disk.used || 0} GB / {resources?.disk.total || 0} GB used ({resources?.disk.path || '/'})
          </div>
        </div>

        {/* Last Update */}
        {resources?.lastUpdate && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-gray-200 dark:border-gray-700">
            Updated: {new Date(resources.lastUpdate).toLocaleTimeString()}
          </div>
        )}
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
  defaultSize: { w: 4, h: 8 },
  minSize: { w: 3, h: 6 },
  maxSize: { w: 6, h: 10 }
}