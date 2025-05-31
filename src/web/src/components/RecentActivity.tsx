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
  
  // Fetch recent DNS records to generate activity
  const { data: dnsRecordsData } = useQuery({
    queryKey: ['recent-dns-records'],
    queryFn: async () => {
      const response = await api.get('/dns/records?limit=10')
      return response.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch orphaned records history for recent deletions
  const { data: orphanedHistoryData } = useQuery({
    queryKey: ['recent-orphaned-history'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned/history?limit=5')
      return response.data
    },
    refetchInterval: 30000,
  })

  // Fetch current orphaned records
  const { data: orphanedData } = useQuery({
    queryKey: ['current-orphaned'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned')
      return response.data
    },
    refetchInterval: 30000,
  })

  // Generate activities from available data
  const activities: ActivityEvent[] = []
  
  // Add recent DNS records as created/updated activities
  if (dnsRecordsData?.data?.records) {
    dnsRecordsData.data.records.slice(0, 5).forEach((record: any) => {
      // Use createdAt or updatedAt to determine activity type
      const createdAt = new Date(record.createdAt || record.created_at || Date.now())
      const updatedAt = new Date(record.updatedAt || record.updated_at || createdAt)
      
      // If updated is significantly after created, it's an update
      const isUpdate = updatedAt.getTime() - createdAt.getTime() > 60000 // 1 minute difference
      
      activities.push({
        id: `dns-${record.id}`,
        type: isUpdate ? 'updated' : 'created',
        recordType: record.type,
        hostname: record.hostname || record.name,
        timestamp: (isUpdate ? updatedAt : createdAt).toISOString(),
        details: record.isManaged ? 'Managed by TrafegoDNS' : 'External record'
      })
    })
  }
  
  // Add current orphaned records
  if (orphanedData?.data?.records) {
    orphanedData.data.records.slice(0, 3).forEach((record: any) => {
      activities.push({
        id: `orphaned-current-${record.id}`,
        type: 'orphaned',
        recordType: record.type,
        hostname: record.hostname || record.name,
        timestamp: record.orphanedAt || new Date().toISOString(),
        details: `In grace period (${record.elapsedMinutes || 0} minutes)`
      })
    })
  }
  
  // Add orphaned history as deleted activities
  if (orphanedHistoryData?.data?.records) {
    orphanedHistoryData.data.records.slice(0, 3).forEach((record: any) => {
      activities.push({
        id: `orphaned-${record.historyId}`,
        type: 'deleted',
        recordType: record.type,
        hostname: record.hostname || record.name,
        timestamp: record.deletedAt,
        details: record.deletionReason
      })
    })
  }
  
  // Sort activities by timestamp (most recent first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  
  // Limit to 5 most recent activities
  const recentActivities = activities.slice(0, 5)

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
        {recentActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentActivities.map((activity: ActivityEvent) => (
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