import React, { useState, useEffect, useRef } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Trash2, Download, RefreshCw, Loader2, Activity, FileText, Plus, Pencil, Settings, Eye, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { useLocation, useSearchParams } from 'react-router-dom'

interface LogEntry {
  level: string
  message: string
  formattedMessage: string
  timestamp: string
  symbol: string
}

interface ActivityEvent {
  id: string
  type: 'created' | 'updated' | 'deleted' | 'managed' | 'tracked'
  recordType: string
  hostname: string
  timestamp: string
  details: string
  source: 'dns' | 'orphaned' | 'managed'
}

const logLevelColors: Record<string, string> = {
  error: 'text-red-500',
  warn: 'text-yellow-500',
  info: 'text-blue-500',
  http: 'text-green-500',
  verbose: 'text-gray-500',
  debug: 'text-purple-500',
  silly: 'text-gray-400'
}

const logLevelBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  error: 'destructive',
  warn: 'secondary',
  info: 'default',
  http: 'outline',
  verbose: 'outline',
  debug: 'outline',
  silly: 'outline'
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

export function LogsPage() {
  const { socket, isConnected } = useSocket()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logLevel, setLogLevel] = useState<string>('info')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [activitySearchQuery, setActivitySearchQuery] = useState('')
  const logContainerRef = useRef<HTMLDivElement>(null)
  const maxLogs = 1000 // Maximum number of logs to keep in memory
  
  // Get active tab from URL params
  const activeTab = searchParams.get('tab') || 'logs'

  // Query to fetch existing logs
  const { data: existingLogs, isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['logs', logLevel],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('limit', '500') // Get more initial logs
      if (logLevel !== 'silly') { // Don't filter if showing all levels
        params.append('level', logLevel)
      }
      
      const response = await api.get(`/logs?${params}`)
      return response.data.data.logs as LogEntry[]
    },
    staleTime: 0, // Always consider stale so refresh button works
  })

  // Query to fetch recent activity
  const { data: activityData, isLoading: isLoadingActivity, refetch: refetchActivity } = useQuery({
    queryKey: ['recent-activity-full'],
    queryFn: async () => {
      const response = await api.get('/activity/recent?limit=100') // Get more activities for full page
      return response.data.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Initialize logs from API data
  useEffect(() => {
    if (existingLogs && existingLogs.length > 0) {
      setLogs(existingLogs)
    }
  }, [existingLogs])

  // WebSocket subscription for real-time logs
  useEffect(() => {
    if (!socket || !isConnected) return

    // Subscribe to logs
    socket.emit('subscribe:logs', { level: logLevel })

    // Listen for log events
    const handleLog = (logEntry: LogEntry) => {
      if (!isPaused) {
        setLogs(prevLogs => {
          const newLogs = [...prevLogs, logEntry]
          // Keep only the last maxLogs entries
          return newLogs.slice(-maxLogs)
        })
      }
    }

    socket.on('log', handleLog)

    // Cleanup
    return () => {
      socket.off('log', handleLog)
      socket.emit('unsubscribe:logs')
    }
  }, [socket, isConnected, logLevel, isPaused])

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Handle log level change
  const handleLogLevelChange = (newLevel: string) => {
    setLogLevel(newLevel)
    if (socket && isConnected) {
      socket.emit('unsubscribe:logs')
      socket.emit('subscribe:logs', { level: newLevel })
    }
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
  }

  // Refresh logs
  const refreshLogs = async () => {
    try {
      await refetchLogs()
      toast({
        title: 'Logs refreshed',
        description: 'Successfully loaded recent logs from server.',
      })
    } catch (error) {
      toast({
        title: 'Refresh failed',
        description: 'Failed to refresh logs. Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Export logs
  const exportLogs = () => {
    const logsText = logs.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`).join('\n')
    const blob = new Blob([logsText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trafegodns-logs-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Filter logs based on search query
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return log.message.toLowerCase().includes(query) ||
           log.level.toLowerCase().includes(query)
  })

  // Get log level priority for filtering
  const logLevelPriority: Record<string, number> = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  }

  // Filter logs by level
  const levelFilteredLogs = filteredLogs.filter(log => {
    const currentPriority = logLevelPriority[logLevel] || 2
    const logPriority = logLevelPriority[log.level] || 2
    return logPriority <= currentPriority
  })

  // Activity helper functions
  const activities: ActivityEvent[] = activityData?.activities || []
  
  const filteredActivities = activities.filter(activity => {
    if (!activitySearchQuery) return true
    const query = activitySearchQuery.toLowerCase()
    return activity.hostname.toLowerCase().includes(query) ||
           activity.recordType.toLowerCase().includes(query) ||
           activity.details.toLowerCase().includes(query) ||
           activity.type.toLowerCase().includes(query)
  })

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

  // Handle tab change
  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Logs & Activity</h1>
        <p className="text-gray-600">Monitor application logs and activity in real-time</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Live Logs
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs">
          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Log Stream</CardTitle>
              <CardDescription>
                {isConnected ? (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 bg-red-500 rounded-full" />
                    Disconnected
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="pause-logs">Pause</Label>
                <Switch
                  id="pause-logs"
                  checked={isPaused}
                  onCheckedChange={setIsPaused}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-scroll">Auto-scroll</Label>
                <Switch
                  id="auto-scroll"
                  checked={autoScroll}
                  onCheckedChange={setAutoScroll}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={logLevel} onValueChange={handleLogLevelChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Log level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="verbose">Verbose</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="silly">Silly</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshLogs}
                disabled={isLoadingLogs}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingLogs && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={clearLogs}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={exportLogs}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>

            {/* Log display */}
            <div 
              ref={logContainerRef}
              className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 h-[600px] overflow-y-auto font-mono text-sm"
            >
              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-500 mr-2" />
                  <span className="text-gray-500">Loading logs...</span>
                </div>
              ) : levelFilteredLogs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  {isPaused ? 'Log streaming is paused' : 'No logs to display'}
                </div>
              ) : (
                <div className="space-y-1">
                  {levelFilteredLogs.map((log, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="text-gray-500 text-xs whitespace-nowrap">
                        {log.timestamp}
                      </span>
                      <Badge 
                        variant={logLevelBadgeVariants[log.level] || 'default'}
                        className="text-xs min-w-[60px] text-center"
                      >
                        {log.level.toUpperCase()}
                      </Badge>
                      <span className={cn('flex-1 break-all', logLevelColors[log.level] || 'text-gray-300')}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div>
                Showing {levelFilteredLogs.length} of {logs.length} logs
                {logs.length >= maxLogs && ' (max reached)'}
                {existingLogs && existingLogs.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({existingLogs.length} loaded from server)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isPaused && <Badge variant="secondary">Paused</Badge>}
                {isLoadingLogs && <Badge variant="outline">Refreshing...</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>
                    Complete history of DNS and system activities
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchActivity()}
                  disabled={isLoadingActivity}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingActivity && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search activities..."
                    value={activitySearchQuery}
                    onChange={(e) => setActivitySearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Activity display */}
                <div className="max-h-[600px] overflow-y-auto">
                  {isLoadingActivity ? (
                    <div className="space-y-3">
                      {[...Array(10)].map((_, i) => (
                        <div key={i} className="flex items-center space-x-3">
                          <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredActivities.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <h3 className="text-lg font-medium">No activity found</h3>
                      <p className="text-sm">
                        {activitySearchQuery ? 'Try adjusting your search terms' : 'Activity will appear here as you manage DNS records'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredActivities.map((activity) => {
                        const Icon = activityIcons[activity.type] || Activity
                        const colorClass = activityColors[activity.type] || 'text-gray-600'
                        
                        return (
                          <div key={activity.id} className="flex items-start space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                            <div className={cn(
                              'rounded-full p-3 mt-0.5',
                              activity.type === 'created' && 'bg-green-100 dark:bg-green-900/20',
                              activity.type === 'updated' && 'bg-blue-100 dark:bg-blue-900/20',
                              activity.type === 'deleted' && 'bg-red-100 dark:bg-red-900/20',
                              activity.type === 'managed' && 'bg-purple-100 dark:bg-purple-900/20',
                              activity.type === 'tracked' && 'bg-orange-100 dark:bg-orange-900/20'
                            )}>
                              <Icon className={cn('h-5 w-5', colorClass)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-semibold text-base truncate">
                                  {activity.hostname}
                                </span>
                                <Badge 
                                  variant={activityBadgeVariants[activity.type]}
                                  className="text-xs"
                                >
                                  {activity.recordType}
                                </Badge>
                                <Badge 
                                  variant="outline"
                                  className="text-xs capitalize"
                                >
                                  {activity.type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {getActivityDescription(activity)}
                              </p>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{formatActivityTime(activity.timestamp)}</span>
                                <span className="capitalize">Source: {activity.source}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Status bar */}
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
                  <div>
                    Showing {filteredActivities.length} of {activities.length} activities
                  </div>
                  <div>
                    {isLoadingActivity && <Badge variant="outline">Loading...</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}