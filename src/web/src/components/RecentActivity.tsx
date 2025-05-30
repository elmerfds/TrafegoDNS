import { useQuery } from '@tanstack/react-query'
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
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'

interface ActivityEvent {
  id: string
  type: 'created' | 'updated' | 'deleted' | 'orphaned'
  recordType: string
  hostname: string
  timestamp: string
  details?: string
}

export function RecentActivity() {
  const navigate = useNavigate()
  
  // For now, we'll use the audit logs endpoint when it's available
  // This is a placeholder implementation
  const { data: activityData } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      try {
        // Try to get audit logs if endpoint exists
        const response = await api.get('/audit/logs?limit=5')
        return response.data
      } catch (error) {
        // Fallback to empty data if endpoint doesn't exist yet
        return { data: [] }
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const activities = activityData?.data || []

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <Plus className="h-4 w-4 text-green-600" />
      case 'updated':
        return <Pencil className="h-4 w-4 text-blue-600" />
      case 'deleted':
        return <Trash2 className="h-4 w-4 text-red-600" />
      case 'orphaned':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />
      default:
        return <Activity className="h-4 w-4 text-gray-600" />
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'created':
        return 'text-green-600'
      case 'updated':
        return 'text-blue-600'
      case 'deleted':
        return 'text-red-600'
      case 'orphaned':
        return 'text-orange-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest DNS record changes</CardDescription>
        </div>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate('/dns-records')}
        >
          View All
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity: ActivityEvent) => (
              <div key={activity.id} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm">
                    <span className={`font-medium ${getActivityColor(activity.type)}`}>
                      {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
                    </span>
                    {' '}
                    <Badge variant="outline" className="ml-1">
                      {activity.recordType}
                    </Badge>
                    {' record for '}
                    <span className="font-medium">{activity.hostname}</span>
                  </p>
                  {activity.details && (
                    <p className="text-xs text-muted-foreground">{activity.details}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}