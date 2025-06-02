import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { 
  Plus, 
  Pencil, 
  Trash2, 
  AlertTriangle,
  Activity,
  ArrowRight,
  Settings,
  Eye
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useSocketEvent } from '@/hooks/useSocket'
import { cn } from '@/lib/utils'

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

export function RecentActivity() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Fetch recent activity from persistent API
  const { data: activityData, isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const response = await api.get('/activity/recent?limit=10')
      return response.data.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Listen for real-time events to trigger data refresh
  useSocketEvent('event', (event: { type: string; data: any }) => {
    // Refresh activity data when we receive relevant events
    if (event.type.includes('dns:') || event.type.includes('DNS_')) {
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
    }
  })

  // Also listen for specific events that should trigger refresh
  useSocketEvent('dns:record:created', () => {
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
  })

  useSocketEvent('dns:record:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
  })

  useSocketEvent('dns:record:deleted', () => {
    queryClient.invalidateQueries({ queryKey: ['recent-activity'] })
  })

  const activities: ActivityEvent[] = activityData?.activities || []

  const formatActivityTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
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
        return `Started managing hostname`
      case 'tracked':
        return `Added hostname to tracking`
      default:
        return activity.details || 'Activity occurred'
    }
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Latest DNS and system activities
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/logs?tab=activity')}
            className="text-muted-foreground hover:text-foreground"
          >
            View All
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-sm">Activity will appear here as you manage DNS records</p>
          </div>
        ) : (
          <div className="space-y-4 pr-2">
            {activities.map((activity, index) => {
              const Icon = activityIcons[activity.type] || Activity
              const colorClass = activityColors[activity.type] || 'text-gray-600'
              
              return (
                <div 
                  key={activity.id} 
                  className={cn(
                    "flex items-start space-x-3 p-2 rounded-lg transition-colors hover:bg-muted/50",
                    index === activities.length - 1 ? "mb-0" : "mb-3 border-b border-border/50 pb-3"
                  )}
                >
                  <div className={cn(
                    'rounded-full p-2 mt-0.5 flex-shrink-0',
                    activity.type === 'created' && 'bg-green-100 dark:bg-green-900/30',
                    activity.type === 'updated' && 'bg-blue-100 dark:bg-blue-900/30',
                    activity.type === 'deleted' && 'bg-red-100 dark:bg-red-900/30',
                    activity.type === 'managed' && 'bg-purple-100 dark:bg-purple-900/30',
                    activity.type === 'tracked' && 'bg-orange-100 dark:bg-orange-900/30'
                  )}>
                    <Icon className={cn('h-4 w-4', colorClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {activity.hostname}
                      </span>
                      <Badge 
                        variant={activityBadgeVariants[activity.type]}
                        className="text-xs flex-shrink-0"
                      >
                        {activity.recordType}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
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
        )}
      </CardContent>
    </Card>
  )
}