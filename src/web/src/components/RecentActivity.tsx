import { useState, useEffect, useCallback, useRef } from 'react'
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
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { useSocketEvent, useSocket } from '@/hooks/useSocket'
import { cn } from '@/lib/utils'

interface ActivityEvent {
  id: string
  type: 'created' | 'updated' | 'deleted' | 'orphaned'
  recordType: string
  hostname: string
  timestamp: string
  details?: string
  isRealtime?: boolean // Mark events that came from WebSocket
}

// Maximum number of events to store in memory
const MAX_EVENTS = 20

// Event expiry time (30 minutes)
const EVENT_EXPIRY_MS = 30 * 60 * 1000

export function RecentActivity() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const socket = useSocket()
  
  // In-memory event store for real-time events
  const [realtimeEvents, setRealtimeEvents] = useState<ActivityEvent[]>([])
  const eventIdCounter = useRef(0)
  
  // Subscribe to all events when component mounts
  useEffect(() => {
    if (socket && socket.connected) {
      // Subscribe to DNS events
      socket.emit('subscribe', 'dns:record:created')
      socket.emit('subscribe', 'dns:record:updated')
      socket.emit('subscribe', 'dns:record:deleted')
      socket.emit('subscribe', 'dns:orphaned:updated')
      
      // Also subscribe to the generic events that might be published
      socket.emit('subscribe', 'DNS_RECORD_CREATED')
      socket.emit('subscribe', 'DNS_RECORD_UPDATED')
      socket.emit('subscribe', 'DNS_RECORD_DELETED')
      
      return () => {
        // Unsubscribe on unmount
        socket.emit('unsubscribe', 'dns:record:created')
        socket.emit('unsubscribe', 'dns:record:updated')
        socket.emit('unsubscribe', 'dns:record:deleted')
        socket.emit('unsubscribe', 'dns:orphaned:updated')
        socket.emit('unsubscribe', 'DNS_RECORD_CREATED')
        socket.emit('unsubscribe', 'DNS_RECORD_UPDATED')
        socket.emit('unsubscribe', 'DNS_RECORD_DELETED')
      }
    }
  }, [socket])
  
  // Helper to add a real-time event
  const addRealtimeEvent = useCallback((event: Omit<ActivityEvent, 'id'>) => {
    setRealtimeEvents(prev => {
      const newEvent: ActivityEvent = {
        ...event,
        id: `realtime-${eventIdCounter.current++}`,
        isRealtime: true
      }
      
      // Add new event at the beginning and limit total events
      const updated = [newEvent, ...prev].slice(0, MAX_EVENTS)
      
      // Remove expired events
      const now = Date.now()
      return updated.filter(e => {
        const eventTime = new Date(e.timestamp).getTime()
        return now - eventTime < EVENT_EXPIRY_MS
      })
    })
  }, [])
  
  // Listen for real-time DNS events with the new event structure
  useSocketEvent('event', (event: { type: string; data: any }) => {
    console.log('Received WebSocket event:', event)
    
    switch (event.type) {
      case 'dns:record:created':
      case 'DNS_RECORD_CREATED':
        // Handle both possible data structures
        const createdRecord = event.data?.record || event.data?.value || event.data
        if (createdRecord && (createdRecord.type || createdRecord.recordType)) {
          addRealtimeEvent({
            type: 'created',
            recordType: createdRecord.type || createdRecord.recordType,
            hostname: createdRecord.hostname || createdRecord.name,
            timestamp: new Date().toISOString(),
            details: 'Real-time update'
          })
        }
        // Also invalidate queries for consistency
        queryClient.invalidateQueries({ queryKey: ['recent-dns-records'] })
        break
        
      case 'dns:record:updated':
      case 'DNS_RECORD_UPDATED':
        // Handle both possible data structures
        const updatedRecord = event.data?.record || event.data?.value || event.data
        if (updatedRecord && (updatedRecord.type || updatedRecord.recordType)) {
          addRealtimeEvent({
            type: 'updated',
            recordType: updatedRecord.type || updatedRecord.recordType,
            hostname: updatedRecord.hostname || updatedRecord.name,
            timestamp: new Date().toISOString(),
            details: 'Real-time update'
          })
        }
        queryClient.invalidateQueries({ queryKey: ['recent-dns-records'] })
        break
        
      case 'dns:record:deleted':
      case 'DNS_RECORD_DELETED':
        // Handle both possible data structures
        const deletedRecord = event.data?.record || event.data?.value || event.data
        if (deletedRecord && (deletedRecord.type || deletedRecord.recordType)) {
          addRealtimeEvent({
            type: 'deleted',
            recordType: deletedRecord.type || deletedRecord.recordType,
            hostname: deletedRecord.hostname || deletedRecord.name,
            timestamp: new Date().toISOString(),
            details: event.data?.reason || deletedRecord.reason || 'Real-time update'
          })
        }
        queryClient.invalidateQueries({ queryKey: ['recent-dns-records'] })
        queryClient.invalidateQueries({ queryKey: ['recent-orphaned-history'] })
        break
        
      case 'dns:orphaned:updated':
        if (event.data?.records && Array.isArray(event.data.records)) {
          event.data.records.forEach((record: any) => {
            addRealtimeEvent({
              type: 'orphaned',
              recordType: record.type,
              hostname: record.hostname || record.name,
              timestamp: new Date().toISOString(),
              details: `In grace period - Real-time update`
            })
          })
        }
        queryClient.invalidateQueries({ queryKey: ['current-orphaned'] })
        break
    }
  })
  
  // Clean up expired events periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimeEvents(prev => {
        const now = Date.now()
        return prev.filter(e => {
          const eventTime = new Date(e.timestamp).getTime()
          return now - eventTime < EVENT_EXPIRY_MS
        })
      })
    }, 60000) // Check every minute
    
    return () => clearInterval(interval)
  }, [])
  
  // Fetch recent DNS records to generate activity
  const { data: dnsRecordsData } = useQuery({
    queryKey: ['recent-dns-records'],
    queryFn: async () => {
      const response = await api.get('/dns/records?limit=10')
      return response.data
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Fetch orphaned records history for recent deletions
  const { data: orphanedHistoryData } = useQuery({
    queryKey: ['recent-orphaned-history'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned/history?limit=5')
      return response.data
    },
    refetchInterval: 15000,
  })

  // Fetch current orphaned records
  const { data: orphanedData } = useQuery({
    queryKey: ['current-orphaned'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned')
      return response.data
    },
    refetchInterval: 15000,
  })

  // Generate activities from available data
  const activities: ActivityEvent[] = [...realtimeEvents] // Start with real-time events
  
  // Add recent DNS records as created/updated activities (but avoid duplicates with real-time events)
  if (dnsRecordsData?.data?.records) {
    dnsRecordsData.data.records.slice(0, 10).forEach((record: any) => {
      // Check if this record already exists in real-time events (by hostname and type)
      const isDuplicate = realtimeEvents.some(e => 
        e.hostname === (record.hostname || record.name) && 
        e.recordType === record.type &&
        // Consider it duplicate if the event happened in the last minute
        new Date().getTime() - new Date(e.timestamp).getTime() < 60000
      )
      
      if (!isDuplicate) {
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
      }
    })
  }
  
  // Add current orphaned records (but avoid duplicates with real-time events)
  if (orphanedData?.data?.records) {
    orphanedData.data.records.slice(0, 5).forEach((record: any) => {
      const isDuplicate = realtimeEvents.some(e => 
        e.type === 'orphaned' &&
        e.hostname === (record.hostname || record.name) && 
        e.recordType === record.type &&
        new Date().getTime() - new Date(e.timestamp).getTime() < 60000
      )
      
      if (!isDuplicate) {
        activities.push({
          id: `orphaned-current-${record.id}`,
          type: 'orphaned',
          recordType: record.type,
          hostname: record.hostname || record.name,
          timestamp: record.orphanedAt || new Date().toISOString(),
          details: `In grace period (${record.elapsedMinutes || 0} minutes)`
        })
      }
    })
  }
  
  // Add orphaned history as deleted activities (but avoid duplicates with real-time events)
  if (orphanedHistoryData?.data?.records) {
    orphanedHistoryData.data.records.slice(0, 5).forEach((record: any) => {
      const isDuplicate = realtimeEvents.some(e => 
        e.type === 'deleted' &&
        e.hostname === (record.hostname || record.name) && 
        e.recordType === record.type &&
        Math.abs(new Date(e.timestamp).getTime() - new Date(record.deletedAt).getTime()) < 60000
      )
      
      if (!isDuplicate) {
        activities.push({
          id: `orphaned-${record.historyId}`,
          type: 'deleted',
          recordType: record.type,
          hostname: record.hostname || record.name,
          timestamp: record.deletedAt,
          details: record.deletionReason
        })
      }
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

  // Count real-time events
  const realtimeEventCount = realtimeEvents.length
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Recent Activity
            {realtimeEventCount > 0 && (
              <Badge variant="secondary" className="animate-pulse">
                {realtimeEventCount} live
              </Badge>
            )}
          </CardTitle>
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
              <div 
                key={activity.id} 
                className={cn(
                  "flex items-start gap-3 transition-all duration-500",
                  activity.isRealtime && "animate-in fade-in-0 slide-in-from-top-2"
                )}
              >
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
                    {activity.isRealtime && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Live
                      </Badge>
                    )}
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