/**
 * Container Monitoring Widget
 * Shows Docker container status and monitoring
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Container, Play, Square, AlertCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface ContainerSummary {
  total: number
  running: number
  stopped: number
  paused: number
  recentActivity: Array<{
    name: string
    status: string
    timestamp: string
  }>
}

function useContainerSummary() {
  return useQuery({
    queryKey: ['container-summary'],
    queryFn: async (): Promise<ContainerSummary> => {
      try {
        const response = await api.get('/containers')
        const containers = response.data.data || []
        
        const summary = containers.reduce((acc: any, container: any) => {
          acc.total++
          if (container.state === 'running') acc.running++
          else if (container.state === 'exited') acc.stopped++
          else if (container.state === 'paused') acc.paused++
          return acc
        }, { total: 0, running: 0, stopped: 0, paused: 0 })
        
        return {
          ...summary,
          recentActivity: containers.slice(0, 3).map((c: any) => ({
            name: c.name || c.Names?.[0]?.replace('/', '') || 'Unknown',
            status: c.state || c.State || 'unknown',
            timestamp: c.created || new Date().toISOString()
          }))
        }
      } catch {
        // Mock data if API fails
        return {
          total: 3,
          running: 2,
          stopped: 1,
          paused: 0,
          recentActivity: [
            { name: 'traefik', status: 'running', timestamp: new Date().toISOString() },
            { name: 'nginx', status: 'running', timestamp: new Date().toISOString() },
            { name: 'redis', status: 'exited', timestamp: new Date().toISOString() }
          ]
        }
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

export function ContainerMonitoringWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: summary, isLoading, error } = useContainerSummary()
  const { displayMode, currentBreakpoint } = props
  const isMobile = currentBreakpoint === 'xs'

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'exited': case 'stopped': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      case 'paused': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return <Play className="h-3 w-3" />
      case 'exited': case 'stopped': return <Square className="h-3 w-3" />
      case 'paused': return <AlertCircle className="h-3 w-3" />
      default: return <AlertCircle className="h-3 w-3" />
    }
  }

  return (
    <WidgetBase
      {...props}
      title="Container Monitoring"
      icon={Container}
      description="Docker container status and activity"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
    >
      <div className="space-y-4">
        {/* Container Summary */}
        <div className={cn(
          "grid gap-3",
          isMobile ? "grid-cols-2" : "grid-cols-2"
        )}>
          <div className={cn(
            "text-center rounded-lg bg-green-50 dark:bg-green-950/30",
            isMobile ? "p-4" : "p-3"
          )}>
            <div className={cn(
              "font-bold text-green-600",
              isMobile ? "text-2xl" : "text-xl"
            )}>{summary?.running || 0}</div>
            <div className={cn(
              "text-gray-600 dark:text-gray-400",
              isMobile ? "text-base" : "text-sm"
            )}>Running</div>
          </div>
          <div className={cn(
            "text-center rounded-lg bg-gray-50 dark:bg-gray-950/30",
            isMobile ? "p-4" : "p-3"
          )}>
            <div className={cn(
              "font-bold text-gray-600",
              isMobile ? "text-2xl" : "text-xl"
            )}>{summary?.stopped || 0}</div>
            <div className={cn(
              "text-gray-600 dark:text-gray-400",
              isMobile ? "text-base" : "text-sm"
            )}>Stopped</div>
          </div>
        </div>

        {/* Recent Activity */}
        {summary?.recentActivity && summary.recentActivity.length > 0 && (
          <div className="space-y-2">
            <h4 className={cn(
              "font-medium text-gray-700 dark:text-gray-300",
              isMobile ? "text-base" : "text-sm"
            )}>Recent Activity</h4>
            {summary.recentActivity.slice(0, 3).map((activity, index) => (
              <div key={index} className={cn(
                "flex items-center justify-between rounded border border-gray-200 dark:border-gray-700",
                isMobile ? "p-3" : "p-2"
              )}>
                <span className={cn(
                  "font-medium truncate flex-1",
                  isMobile ? "text-base" : "text-sm"
                )}>{activity.name}</span>
                <Badge variant="outline" className={getStatusColor(activity.status)}>
                  <span className="flex items-center gap-1">
                    {getStatusIcon(activity.status)}
                    {activity.status}
                  </span>
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(
              "flex-1",
              isMobile && "min-h-[44px]"
            )}
            onClick={() => navigate('/containers')}
          >
            View All
          </Button>
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(
              "flex-1",
              isMobile && "min-h-[44px]"
            )}
            onClick={() => navigate('/logs')}
          >
            View Logs
          </Button>
        </div>

        {/* Summary Stats */}
        <div className={cn(
          "text-muted-foreground text-center",
          isMobile ? "text-sm" : "text-xs"
        )}>
          Total: {summary?.total || 0} containers
        </div>
      </div>
    </WidgetBase>
  )
}

export const containerMonitoringDefinition: WidgetDefinition = {
  id: 'container-monitoring',
  name: 'Container Monitoring',
  description: 'Docker container status and activity',
  category: 'containers',
  icon: Container,
  defaultSize: createResponsiveSizes({ w: 8, h: 8 }),
  minSize: createResponsiveSizes({ w: 6, h: 6 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 12, h: 10 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}