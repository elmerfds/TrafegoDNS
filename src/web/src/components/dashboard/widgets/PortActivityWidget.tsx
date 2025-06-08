/**
 * Port Activity Widget
 * Recent port activity and changes monitoring
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Plus, Minus, RefreshCw, Clock, TrendingUp } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortActivity {
  id: string
  port: number
  action: 'opened' | 'closed' | 'reserved' | 'released' | 'scanned' | 'conflict'
  service?: string
  container?: string
  user?: string
  timestamp: string
  details?: string
}

function usePortActivity() {
  return useQuery({
    queryKey: ['port-activity'],
    queryFn: async (): Promise<PortActivity[]> => {
      try {
        const response = await api.get('/ports/activity')
        return response.data.data || []
      } catch {
        // Mock data if API fails
        return [
          {
            id: '1',
            port: 3000,
            action: 'opened',
            service: 'React Dev Server',
            container: 'web-app',
            user: 'docker-compose',
            timestamp: new Date(Date.now() - 300000).toISOString(),
            details: 'Container started successfully'
          },
          {
            id: '2',
            port: 8080,
            action: 'reserved',
            service: 'HTTP Proxy',
            user: 'kubernetes',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            details: 'Reserved for 1 hour'
          },
          {
            id: '3',
            port: 5432,
            action: 'conflict',
            service: 'PostgreSQL',
            container: 'database',
            timestamp: new Date(Date.now() - 900000).toISOString(),
            details: 'Port already in use by another service'
          },
          {
            id: '4',
            port: 6379,
            action: 'closed',
            service: 'Redis Cache',
            container: 'redis-server',
            user: 'docker-compose',
            timestamp: new Date(Date.now() - 1200000).toISOString(),
            details: 'Container stopped'
          },
          {
            id: '5',
            port: 443,
            action: 'scanned',
            service: 'HTTPS',
            timestamp: new Date(Date.now() - 1500000).toISOString(),
            details: 'Port scan detected open status'
          }
        ]
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
  })
}

export function PortActivityWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: activities = [], isLoading, error } = usePortActivity()

  const getActionColor = (action: string) => {
    switch (action) {
      case 'opened': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      case 'reserved': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'released': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'scanned': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'conflict': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'opened': return <Plus className="h-4 w-4" />
      case 'closed': return <Minus className="h-4 w-4" />
      case 'reserved': return <Clock className="h-4 w-4" />
      case 'released': return <RefreshCw className="h-4 w-4" />
      case 'scanned': return <TrendingUp className="h-4 w-4" />
      case 'conflict': return <Activity className="h-4 w-4" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  // Get activity stats for the last 24 hours
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentActivities = activities.filter(a => new Date(a.timestamp) > last24Hours)
  const openedCount = recentActivities.filter(a => a.action === 'opened').length
  const conflictCount = recentActivities.filter(a => a.action === 'conflict').length

  return (
    <WidgetBase
      {...props}
      title="Port Activity"
      icon={Activity}
      description="Recent port activity and changes"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant={conflictCount > 0 ? 'destructive' : 'default'}>
          {recentActivities.length} events (24h)
        </Badge>
      }
    >
      <div className="space-y-3">
        {/* Activity Feed */}
        {activities.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activities.slice(0, 8).map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getActionIcon(activity.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-medium text-sm">
                      Port {activity.port}
                    </span>
                    <Badge variant="outline" className={getActionColor(activity.action)}>
                      {activity.action}
                    </Badge>
                  </div>
                  
                  {activity.service && (
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {activity.service}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {activity.container && (
                      <span>Container: {activity.container}</span>
                    )}
                    {activity.user && (
                      <span>By: {activity.user}</span>
                    )}
                  </div>
                  
                  {activity.details && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {activity.details}
                    </p>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent port activity</p>
          </div>
        )}

        {/* Activity Stats */}
        {recentActivities.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {openedCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Opened
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {conflictCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Conflicts
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">
                {recentActivities.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/port-monitoring')}
          >
            View All
          </Button>
          {conflictCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => navigate('/port-management')}
            >
              Resolve
            </Button>
          )}
        </div>
      </div>
    </WidgetBase>
  )
}

export const portActivityDefinition: WidgetDefinition = {
  id: 'port-activity',
  name: 'Port Activity',
  description: 'Recent port activity and changes',
  category: 'ports',
  icon: Activity,
  defaultSize: { w: 4, h: 10 },
  minSize: { w: 3, h: 8 },
  maxSize: { w: 6, h: 12 }
}