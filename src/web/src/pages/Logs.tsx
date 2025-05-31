import React, { useState, useEffect, useRef } from 'react'
import { useSocket } from '@/hooks/useSocket'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Search, Trash2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogEntry {
  level: string
  message: string
  formattedMessage: string
  timestamp: string
  symbol: string
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

export function LogsPage() {
  const { socket, isConnected } = useSocket()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logLevel, setLogLevel] = useState<string>('info')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const maxLogs = 1000 // Maximum number of logs to keep in memory

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live Logs</h1>
        <p className="text-gray-600">Monitor application activity in real-time</p>
      </div>

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
              className="bg-gray-900 rounded-lg p-4 h-[600px] overflow-y-auto font-mono text-sm"
            >
              {levelFilteredLogs.length === 0 ? (
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
              </div>
              <div>
                {isPaused && <Badge variant="secondary">Paused</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}