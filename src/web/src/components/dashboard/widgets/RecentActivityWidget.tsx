/**
 * Recent Activity Widget
 * Shows latest DNS and system activities
 */

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Plus, Pencil, Trash2, Settings, Eye, ArrowRight } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useSocketEvent } from '@/hooks/useSocket'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface ActivityEvent {
  id: string
  type: 'created' | 'updated' | 'deleted' | 'managed' | 'tracked'
  recordType: string
  hostname: string
  timestamp: string
  details: string
  source: 'dns' | 'orphaned' | 'managed'
}

const activityIcons = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  managed: Settings,
  tracked: Eye
}

const activityColors = {
  created: 'text-green-600',
  updated: 'text-blue-600',
  deleted: 'text-red-600',
  managed: 'text-purple-600',
  tracked: 'text-orange-600'
}

const activityBadgeVariants = {
  created: 'default' as const,
  updated: 'secondary' as const,
  deleted: 'destructive' as const,
  managed: 'outline' as const,
  tracked: 'outline' as const
}

function useRecentActivity() {
  return useQuery({
    queryKey: ['recent-activity'],
    queryFn: async (): Promise<ActivityEvent[]> => {
      try {
        const response = await api.get('/activity/recent?limit=8')
        return response.data.data?.activities || []
      } catch {
        // Mock data if API fails
        return [
          {
            id: '1',
            type: 'created',
            recordType: 'A',
            hostname: 'app.example.com',
            timestamp: new Date(Date.now() - 300000).toISOString(),
            details: 'Created A record',
            source: 'dns'
          },
          {
            id: '2',
            type: 'updated',
            recordType: 'CNAME',
            hostname: 'www.example.com',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            details: 'Updated CNAME record',
            source: 'dns'
          },
          {
            id: '3',
            type: 'managed',
            recordType: 'A',
            hostname: 'api.example.com',
            timestamp: new Date(Date.now() - 900000).toISOString(),
            details: 'Started managing hostname',
            source: 'managed'
          },
          {
            id: '4',
            type: 'deleted',
            recordType: 'TXT',
            hostname: 'old.example.com',
            timestamp: new Date(Date.now() - 1200000).toISOString(),
            details: 'Deleted TXT record',
            source: 'dns'
          }
        ]
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

export function RecentActivityWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: activities = [], isLoading, error } = useRecentActivity()

  // Listen for real-time events to trigger data refresh
  useSocketEvent('event', (event: { type: string; data: any }) => {
    if (event.type.includes('dns:') || event.type.includes('DNS_')) {
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
    }
  })

  const formatActivityTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      
      if (diffInMinutes < 1) return 'Just now'
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`
      if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
      return `${Math.floor(diffInMinutes / 1440)}d ago`
    } catch {
      return 'Unknown time'
    }
  }

  const getActivityDescription = (activity: ActivityEvent) => {
    switch (activity.type) {
      case 'created':
        return `Created ${activity.recordType} record`
      case 'updated':
        return `Updated ${activity.recordType} record`
      case 'deleted':
        return `Deleted ${activity.recordType} record`
      case 'managed':
        return 'Started managing hostname'
      case 'tracked':
        return 'Added hostname to tracking'
      default:
        return activity.details || 'Activity occurred'
    }
  }

  const recentCount = activities.filter(a => {
    const activityTime = new Date(a.timestamp)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    return activityTime > oneHourAgo
  }).length

  return (
    <WidgetBase
      {...props}
      title="Recent Activity"
      icon={Activity}
      description="Latest DNS and system activities"
      isLoading={isLoading}
      error={error?.message}
      actions={
        <Badge variant="default">
          {recentCount} in last hour
        </Badge>
      }
    >
      <div className="space-y-3">
        {/* Activity Feed */}
        {activities.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {activities.map((activity, index) => {
              const Icon = activityIcons[activity.type] || Activity
              const colorClass = activityColors[activity.type] || 'text-gray-600'
              
              return (
                <div 
                  key={activity.id} 
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-muted/50",
                    index < activities.length - 1 && "border-b border-border/50 pb-3 mb-3"
                  )}
                >
                  <div className={cn(
                    'rounded-full p-1.5 mt-0.5 flex-shrink-0',
                    activity.type === 'created' && 'bg-green-100 dark:bg-green-900/30',
                    activity.type === 'updated' && 'bg-blue-100 dark:bg-blue-900/30',
                    activity.type === 'deleted' && 'bg-red-100 dark:bg-red-900/30',
                    activity.type === 'managed' && 'bg-purple-100 dark:bg-purple-900/30',
                    activity.type === 'tracked' && 'bg-orange-100 dark:bg-orange-900/30'
                  )}>
                    <Icon className={cn('h-3 w-3', colorClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {activity.hostname}
                      </span>
                      <Badge 
                        variant={activityBadgeVariants[activity.type]}
                        className="text-xs"
                      >
                        {activity.recordType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {getActivityDescription(activity)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatActivityTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
            <p className="text-xs">Activity will appear here as you manage DNS records</p>
          </div>
        )}

        {/* Activity Stats */}
        {activities.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {activities.filter(a => a.type === 'created').length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Created
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {activities.filter(a => a.type === 'updated').length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Updated
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {activities.filter(a => a.type === 'deleted').length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Deleted
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
            onClick={() => navigate('/logs?tab=activity')}
          >
            View All
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/dns-records')}
          >
            Manage DNS
          </Button>
        </div>
      </div>
    </WidgetBase>
  )
}

export const recentActivityDefinition: WidgetDefinition = {
  id: 'recent-activity',
  name: 'Recent Activity',
  description: 'Latest DNS and system activities',
  category: 'system',
  icon: Activity,
  defaultSize: { w: 4, h: 10 },
  minSize: { w: 3, h: 8 },
  maxSize: { w: 6, h: 12 }
}