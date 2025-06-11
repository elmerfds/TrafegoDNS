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
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface ActivityEvent {
  id: string
  type: string // More flexible to handle various activity types
  recordType: string
  hostname: string
  timestamp: string
  details: string
  source: string // More flexible to handle various sources
}

const getActivityIcon = (type: string) => {
  const lowerType = type.toLowerCase()
  if (lowerType.includes('create') || lowerType.includes('add')) return Plus
  if (lowerType.includes('update') || lowerType.includes('modif') || lowerType.includes('change')) return Pencil
  if (lowerType.includes('delete') || lowerType.includes('remove')) return Trash2
  if (lowerType.includes('manage')) return Settings
  if (lowerType.includes('track')) return Eye
  return Activity // Default icon
}

const getActivityColor = (type: string) => {
  const lowerType = type.toLowerCase()
  if (lowerType.includes('create') || lowerType.includes('add')) return 'text-green-600'
  if (lowerType.includes('update') || lowerType.includes('modif') || lowerType.includes('change')) return 'text-blue-600'
  if (lowerType.includes('delete') || lowerType.includes('remove')) return 'text-red-600'
  if (lowerType.includes('manage')) return 'text-purple-600'
  if (lowerType.includes('track')) return 'text-orange-600'
  return 'text-gray-600' // Default color
}

const getActivityBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
  const lowerType = type.toLowerCase()
  if (lowerType.includes('create') || lowerType.includes('add')) return 'default'
  if (lowerType.includes('update') || lowerType.includes('modif') || lowerType.includes('change')) return 'secondary'
  if (lowerType.includes('delete') || lowerType.includes('remove')) return 'destructive'
  return 'outline' // Default variant
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
  const { displayMode = 'normal', currentBreakpoint = 'lg' } = props
  
  // Calculate how many items to show based on widget size
  const getMaxItems = () => {
    if (displayMode === 'compact') return 3
    if (currentBreakpoint === 'lg') return 8  // More items on larger screens
    if (currentBreakpoint === 'md') return 6
    return 4
  }
  
  // Debug activity types and data structure
  const uniqueTypes = [...new Set(activities.map(a => a.type))]

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
  
  // Calculate activity stats with fallbacks for different possible type values
  const createdCount = activities.filter(a => 
    a.type === 'created' || a.type === 'create' || a.type === 'added' || a.type === 'add'
  ).length
  
  const updatedCount = activities.filter(a => 
    a.type === 'updated' || a.type === 'update' || a.type === 'modified' || a.type === 'changed'
  ).length
  
  const deletedCount = activities.filter(a => 
    a.type === 'deleted' || a.type === 'delete' || a.type === 'removed' || a.type === 'remove'
  ).length
  
  // Include other meaningful types
  const managedCount = activities.filter(a => a.type === 'managed' || a.type === 'tracked').length
  
  // Enhanced debug logging to understand the data
  if (activities.length > 0) {
    console.log('Recent Activity Debug:')
    console.log('- Total activities:', activities.length)
    console.log('- Unique types found:', uniqueTypes)
    console.log('- Count breakdown:', { createdCount, updatedCount, deletedCount, managedCount })
    console.log('- First few activities:', activities.slice(0, 3).map(a => ({ type: a.type, hostname: a.hostname, details: a.details })))
    
    // Show which activities are matching each filter
    console.log('- Activities matching "deleted" filter:', activities.filter(a => 
      a.type === 'deleted' || a.type === 'delete' || a.type === 'removed' || a.type === 'remove'
    ).map(a => a.type))
    
    console.log('- Activities matching "managed" filter:', activities.filter(a => 
      a.type === 'managed' || a.type === 'tracked'
    ).map(a => a.type))
  }

  return (
    <WidgetBase
      {...props}
      title="Recent Activity"
      icon={Activity}
      description="Latest DNS and system activities"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant="default">
          {recentCount} in last hour
        </Badge>
      }
    >
      <div className="flex flex-col h-full">
        {/* Activity Feed */}
        {activities.length > 0 ? (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0 mb-3">
            {activities.slice(0, getMaxItems()).map((activity, index) => {
              const Icon = getActivityIcon(activity.type)
              const colorClass = getActivityColor(activity.type)
              
              return (
                <div 
                  key={activity.id} 
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-muted/50",
                    index < getMaxItems() - 1 && index < activities.length - 1 && "border-b border-border/50 pb-3 mb-3"
                  )}
                >
                  <div className={cn(
                    'rounded-full p-1.5 mt-0.5 flex-shrink-0',
                    getActivityColor(activity.type).includes('green') && 'bg-green-100 dark:bg-green-900/30',
                    getActivityColor(activity.type).includes('blue') && 'bg-blue-100 dark:bg-blue-900/30',
                    getActivityColor(activity.type).includes('red') && 'bg-red-100 dark:bg-red-900/30',
                    getActivityColor(activity.type).includes('purple') && 'bg-purple-100 dark:bg-purple-900/30',
                    getActivityColor(activity.type).includes('orange') && 'bg-orange-100 dark:bg-orange-900/30',
                    getActivityColor(activity.type).includes('gray') && 'bg-gray-100 dark:bg-gray-900/30'
                  )}>
                    <Icon className={cn('h-3 w-3', colorClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {activity.hostname}
                      </span>
                      <Badge 
                        variant={getActivityBadgeVariant(activity.type)}
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
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
            {!displayMode || displayMode !== 'compact' && (
              <p className="text-xs">Activity will appear here as you manage DNS records</p>
            )}
          </div>
        )}

        {/* Activity Stats - Show when there's data and enough space */}
        {activities.length > 0 && displayMode !== 'compact' && (
          <div className={`gap-2 pt-3 mb-3 border-t border-gray-200 dark:border-gray-700 ${
            managedCount > 0 ? 'grid grid-cols-4' : 'grid grid-cols-3'
          }`}>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {createdCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Created
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {updatedCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Updated
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {deletedCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Deleted
              </div>
            </div>
            {managedCount > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-purple-600">
                  {managedCount}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Managed
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions - Always at bottom */}
        <div className="flex gap-2 mt-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/logs?tab=activity')}
          >
            View All
            {displayMode !== 'compact' && <ArrowRight className="h-4 w-4 ml-2" />}
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
  defaultSize: createResponsiveSizes({ w: 8, h: 10 }),
  minSize: createResponsiveSizes({ w: 6, h: 8 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 12, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}