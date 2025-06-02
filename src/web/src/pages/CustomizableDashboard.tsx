import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Responsive, WidthProvider, Layout } from 'react-grid-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Activity, 
  Globe, 
  Container, 
  Link2, 
  Server,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Shield,
  Cpu,
  HardDrive,
  GripVertical,
  Save,
  RotateCcw,
  Settings,
  Minimize2
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { RecentActivity } from '@/components/RecentActivity'
import { PauseControls } from '@/components/PauseControls'
import { useToast } from '@/components/ui/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Import CSS for react-grid-layout
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Default layouts for different breakpoints with minimal gaps
const defaultLayouts = {
  lg: [
    { i: 'stats', x: 0, y: 0, w: 12, h: 4, minH: 3, minW: 6 },
    { i: 'alerts', x: 0, y: 4, w: 12, h: 2, minH: 2, minW: 6 },
    { i: 'system-overview', x: 0, y: 6, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'service-health', x: 4, y: 6, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'system-resources', x: 8, y: 6, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'dns-health', x: 0, y: 12, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'container-monitoring', x: 4, y: 12, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'quick-actions', x: 8, y: 12, w: 4, h: 6, minH: 4, minW: 3 },
    { i: 'pause-controls', x: 0, y: 18, w: 4, h: 7, minH: 6, minW: 3 },
    { i: 'recent-activity', x: 4, y: 18, w: 8, h: 5, minH: 4, minW: 4 },
    { i: 'provider-status', x: 0, y: 25, w: 6, h: 6, minH: 4, minW: 3 },
    { i: 'issues-monitoring', x: 6, y: 25, w: 6, h: 6, minH: 4, minW: 3 },
  ],
  md: [
    { i: 'stats', x: 0, y: 0, w: 10, h: 6, minH: 4, minW: 5 },
    { i: 'alerts', x: 0, y: 6, w: 10, h: 3, minH: 2, minW: 5 },
    { i: 'system-overview', x: 0, y: 9, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'service-health', x: 5, y: 9, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'system-resources', x: 0, y: 15, w: 10, h: 6, minH: 4, minW: 5 },
    { i: 'dns-health', x: 0, y: 21, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'container-monitoring', x: 5, y: 21, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'quick-actions', x: 0, y: 27, w: 10, h: 6, minH: 4, minW: 5 },
    { i: 'pause-controls', x: 0, y: 33, w: 10, h: 7, minH: 6, minW: 5 },
    { i: 'recent-activity', x: 0, y: 40, w: 10, h: 5, minH: 4, minW: 5 },
    { i: 'provider-status', x: 0, y: 45, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'issues-monitoring', x: 5, y: 45, w: 5, h: 6, minH: 4, minW: 3 },
  ],
  sm: [
    { i: 'stats', x: 0, y: 0, w: 6, h: 12, minH: 8, minW: 6 },
    { i: 'alerts', x: 0, y: 12, w: 6, h: 3, minH: 2, minW: 6 },
    { i: 'system-overview', x: 0, y: 15, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'service-health', x: 0, y: 21, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'system-resources', x: 0, y: 27, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'dns-health', x: 0, y: 33, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'container-monitoring', x: 0, y: 39, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'quick-actions', x: 0, y: 45, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'pause-controls', x: 0, y: 51, w: 6, h: 8, minH: 7, minW: 6 },
    { i: 'recent-activity', x: 0, y: 59, w: 6, h: 5, minH: 4, minW: 6 },
    { i: 'provider-status', x: 0, y: 64, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'issues-monitoring', x: 0, y: 70, w: 6, h: 6, minH: 5, minW: 6 },
  ]
}

export function CustomizableDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [layouts, setLayouts] = useState<any>(defaultLayouts)
  const [isEditMode, setIsEditMode] = useState(false)
  
  // Load saved layouts from localStorage
  useEffect(() => {
    const savedLayouts = localStorage.getItem('dashboardLayouts')
    if (savedLayouts) {
      try {
        setLayouts(JSON.parse(savedLayouts))
      } catch (e) {
        console.error('Failed to load saved layouts')
      }
    }
  }, [])

  // API queries
  const { data: statusResponse } = useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const response = await api.get('/status')
      return response.data
    },
    refetchInterval: 5000,
  })

  const { data: orphanedResponse } = useQuery({
    queryKey: ['orphaned-summary'],
    queryFn: async () => {
      const response = await api.get('/dns/orphaned?limit=5')
      return response.data
    },
    refetchInterval: 10000,
  })

  const { data: metricsResponse } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await api.get('/status/metrics')
      return response.data
    },
    refetchInterval: 5000,
  })

  const status = statusResponse?.data
  const orphaned = orphanedResponse?.data
  const metrics = metricsResponse?.data

  const stats = [
    {
      name: 'Active DNS Records',
      value: status?.statistics?.totalRecords || 0,
      icon: Globe,
      color: 'text-blue-600',
    },
    {
      name: 'Monitored Containers',
      value: status?.statistics?.totalContainers || 0,
      icon: Container,
      color: 'text-green-600',
    },
    {
      name: 'Managed Hostnames',
      value: status?.statistics?.totalHostnames || 0,
      icon: Link2,
      color: 'text-purple-600',
    },
    {
      name: 'System Status',
      value: status?.healthy ? 'Healthy' : 'Unhealthy',
      icon: Activity,
      color: status?.healthy ? 'text-green-600' : 'text-red-600',
    },
  ]

  const handleLayoutChange = (currentLayout: Layout[], allLayouts: any) => {
    // Always update layouts to maintain state
    setLayouts(allLayouts)
    
    // Auto-save layouts when in edit mode
    if (isEditMode) {
      localStorage.setItem('dashboardLayouts', JSON.stringify(allLayouts))
    }
  }

  const saveLayouts = () => {
    localStorage.setItem('dashboardLayouts', JSON.stringify(layouts))
    toast({
      title: 'Layout saved',
      description: 'Your dashboard layout has been saved successfully.',
    })
    setIsEditMode(false)
  }

  const resetLayouts = () => {
    const newLayouts = { ...defaultLayouts }
    setLayouts(newLayouts)
    localStorage.removeItem('dashboardLayouts')
    toast({
      title: 'Layout reset',
      description: 'Dashboard layout has been reset to default.',
    })
    setIsEditMode(false)
  }

  const compactLayout = () => {
    const compactedLayouts = { ...layouts }
    
    // Compact each breakpoint layout
    Object.keys(compactedLayouts).forEach(breakpoint => {
      if (compactedLayouts[breakpoint] && Array.isArray(compactedLayouts[breakpoint])) {
        // Sort all widgets by Y position then X position
        const sortedWidgets = [...compactedLayouts[breakpoint]].sort((a: any, b: any) => {
          if (a.y === b.y) return a.x - b.x
          return a.y - b.y
        })
        
        // Track occupied spaces
        const occupiedSpaces = new Map<string, boolean>()
        
        // Place each widget in the first available position
        sortedWidgets.forEach((widget: any) => {
          let placed = false
          let testY = 0
          
          while (!placed) {
            let canPlace = true
            
            // Check if space is available
            for (let x = widget.x; x < widget.x + widget.w; x++) {
              for (let y = testY; y < testY + widget.h; y++) {
                if (occupiedSpaces.get(`${x},${y}`)) {
                  canPlace = false
                  break
                }
              }
              if (!canPlace) break
            }
            
            if (canPlace) {
              // Place widget
              widget.y = testY
              
              // Mark space as occupied
              for (let x = widget.x; x < widget.x + widget.w; x++) {
                for (let y = testY; y < testY + widget.h; y++) {
                  occupiedSpaces.set(`${x},${y}`, true)
                }
              }
              
              placed = true
            } else {
              testY++
            }
          }
        })
        
        compactedLayouts[breakpoint] = sortedWidgets
      }
    })
    
    setLayouts(compactedLayouts)
    toast({
      title: 'Layout compacted',
      description: 'Removed gaps between widgets.',
    })
  }

  // Widget components wrapped in a card with drag handle
  const renderWidget = (key: string) => {
    switch (key) {
      case 'stats':
        return (
          <div className="h-full overflow-hidden">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4 h-full">
              {stats.map((stat) => (
                <Card key={stat.name} className="h-full flex flex-col overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
                    <CardTitle className="text-xs sm:text-sm font-medium leading-tight line-clamp-2">
                      {stat.name}
                    </CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color} flex-shrink-0`} />
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="text-xl sm:text-2xl font-bold truncate">{stat.value}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <TrendingUp className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">Stable</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )

      case 'alerts':
        return orphaned && orphaned.count > 0 ? (
          <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/30 h-full">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800 dark:text-orange-200">Orphaned Records Detected</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-orange-700 dark:text-orange-300">
                There are {orphaned.count} orphaned DNS records that may need attention.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/50"
                onClick={() => navigate('/orphaned-records')}
              >
                <AlertTriangle className="h-3 w-3 mr-2" />
                View Orphaned Records
              </Button>
            </AlertDescription>
          </Alert>
        ) : null

      case 'system-overview':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                System Overview
              </CardTitle>
              <CardDescription>Core system information and configuration</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-y-auto">
              <div className="grid gap-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <Badge variant="outline">{status?.version || 'N/A'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Mode</span>
                  <Badge variant="outline">{status?.mode || 'N/A'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Provider</span>
                  <Badge variant="outline">{status?.provider || 'N/A'}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Domain</span>
                  <Badge variant="outline" className="max-w-24 sm:max-w-32 truncate text-xs">
                    {status?.services?.dnsProvider?.domain || status?.domain || 'N/A'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Uptime</span>
                  <span className="font-medium text-sm">
                    {status?.uptime ? formatUptime(status.uptime) : 'N/A'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 'service-health':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Service Health
              </CardTitle>
              <CardDescription>Real-time status of core services</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              {status?.services?.dnsProvider && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">DNS Provider</span>
                  </div>
                  <Badge variant={status.services.dnsProvider.status === 'active' ? 'default' : 'destructive'}>
                    {status.services.dnsProvider.status}
                  </Badge>
                </div>
              )}
              {status?.services?.dockerMonitor && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Container className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Docker Monitor</span>
                  </div>
                  <Badge 
                    variant={status.services.dockerMonitor.status === 'connected' ? 'default' : 'destructive'}
                  >
                    {status.services.dockerMonitor.status}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">API Server</span>
                </div>
                <Badge variant="default">active</Badge>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Overall Health</span>
                  <span className="text-sm font-medium">
                    {status?.healthy ? '100%' : '0%'}
                  </span>
                </div>
                <Progress 
                  value={status?.healthy ? 100 : 0} 
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>
        )

      case 'system-resources':
        return metrics ? (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                System Resources
              </CardTitle>
              <CardDescription>Current resource utilization</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Memory Usage</span>
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round((metrics.system.memory.used / metrics.system.memory.total) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={(metrics.system.memory.used / metrics.system.memory.total) * 100} 
                  className="h-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  {formatBytes(metrics.system.memory.used)} / {formatBytes(metrics.system.memory.total)}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">CPU Load</span>
                  </div>
                  <span className="text-sm font-medium">
                    {Math.round(Math.min((metrics.system.cpu.load[0] / metrics.system.cpu.cores) * 100, 100))}%
                  </span>
                </div>
                <Progress 
                  value={Math.min((metrics.system.cpu.load[0] / metrics.system.cpu.cores) * 100, 100)} 
                  className="h-2"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Load: {metrics.system.cpu.load[0].toFixed(2)} / {metrics.system.cpu.cores} cores
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  Process Memory: {formatBytes(metrics.process.memory.heapUsed)}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null

      case 'dns-health':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                DNS Records Health
              </CardTitle>
              <CardDescription>Distribution and health of DNS records</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Records</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{status?.statistics?.totalRecords || 0}</span>
                  <TrendingUp className="h-3 w-3 text-green-500" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Orphaned Records</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-lg ${(orphaned?.count || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {orphaned?.count || 0}
                  </span>
                  {(orphaned?.count || 0) > 0 ? 
                    <AlertTriangle className="h-3 w-3 text-orange-500" /> : 
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  }
                </div>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Health Score</span>
                  <span className="text-sm font-medium">
                    {status?.statistics?.totalRecords ? 
                      Math.round((status.statistics.totalRecords / (status.statistics.totalRecords + (orphaned?.count || 0))) * 100) : 0
                    }%
                  </span>
                </div>
                <Progress 
                  value={status?.statistics?.totalRecords ? 
                    ((status.statistics.totalRecords / (status.statistics.totalRecords + (orphaned?.count || 0))) * 100) : 0
                  } 
                  className="h-3"
                />
              </div>
            </CardContent>
          </Card>
        )

      case 'container-monitoring':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Container className="h-5 w-5" />
                Container Monitoring
              </CardTitle>
              <CardDescription>Docker container DNS management status</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Containers</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{status?.statistics?.totalContainers || 0}</span>
                  <TrendingUp className="h-3 w-3 text-blue-500" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">With DNS Labels</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{status?.statistics?.totalHostnames || 0}</span>
                  <TrendingUp className="h-3 w-3 text-green-500" />
                </div>
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">DNS Coverage</span>
                  <span className="text-sm font-medium">
                    {status?.statistics?.totalContainers ? 
                      Math.round((status.statistics.totalHostnames / status.statistics.totalContainers) * 100) : 0
                    }%
                  </span>
                </div>
                <Progress 
                  value={status?.statistics?.totalContainers ? 
                    ((status.statistics.totalHostnames / status.statistics.totalContainers) * 100) : 0
                  } 
                  className="h-3"
                />
              </div>
            </CardContent>
          </Card>
        )

      case 'quick-actions':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>Frequently used management actions</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-y-auto">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => navigate('/dns-records')}
              >
                <Globe className="h-4 w-4 mr-2" />
                Manage DNS Records
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => navigate('/containers')}
              >
                <Container className="h-4 w-4 mr-2" />
                View Containers
              </Button>
              {(orphaned?.count || 0) > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-orange-600 border-orange-200 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/30"
                  onClick={() => navigate('/orphaned-records')}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Fix Orphaned Records ({orphaned.count})
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={() => navigate('/settings')}
              >
                <Server className="h-4 w-4 mr-2" />
                System Settings
              </Button>
            </CardContent>
          </Card>
        )

      case 'pause-controls':
        return (
          <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <PauseControls />
            </div>
          </div>
        )

      case 'recent-activity':
        return <RecentActivity />

      case 'provider-status':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Provider Status
              </CardTitle>
              <CardDescription>DNS provider connection and health</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Provider</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{status?.provider || 'Unknown'}</Badge>
                  <Badge variant={status?.services?.dnsProvider?.status === 'active' ? 'default' : 'destructive'}>
                    {status?.services?.dnsProvider?.status === 'active' ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Managed Domain</span>
                <span className="text-sm font-medium max-w-32 sm:max-w-48 truncate">
                  {status?.services?.dnsProvider?.domain || status?.domain || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Records Managed</span>
                <span className="text-sm font-medium">{status?.statistics?.totalRecords || 0}</span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Health Score</span>
                  <span className="text-sm font-medium">
                    {status?.services?.dnsProvider?.status === 'active' ? 
                      (orphaned?.count ? Math.max(70, 100 - (orphaned.count * 5)) : 100) : 0
                    }%
                  </span>
                </div>
                <Progress 
                  value={status?.services?.dnsProvider?.status === 'active' ? 
                    (orphaned?.count ? Math.max(70, 100 - (orphaned.count * 5)) : 100) : 0
                  } 
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>
        )

      case 'issues-monitoring':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Issues & Monitoring
              </CardTitle>
              <CardDescription>Current system issues and monitoring status</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Issues</span>
                <div className="flex items-center gap-2">
                  {(orphaned?.count || 0) > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-600">{orphaned.count} orphaned</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-green-600">No issues</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last Sync</span>
                <span className="text-sm font-medium">
                  {status?.uptime ? 'Active' : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">System Uptime</span>
                <span className="text-sm font-medium">
                  {status?.uptime ? formatUptime(status.uptime) : 'N/A'}
                </span>
              </div>
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/settings')}
                >
                  <Server className="h-4 w-4 mr-2" />
                  System Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your DNS records and container status in real-time
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Dashboard Settings
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditMode(!isEditMode)}>
              <GripVertical className="h-4 w-4 mr-2" />
              {isEditMode ? 'Exit Edit Mode' : 'Edit Layout'}
            </DropdownMenuItem>
            {isEditMode && (
              <>
                <DropdownMenuItem onClick={compactLayout}>
                  <Minimize2 className="h-4 w-4 mr-2" />
                  Compact Layout
                </DropdownMenuItem>
                <DropdownMenuItem onClick={saveLayouts}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Layout
                </DropdownMenuItem>
                <DropdownMenuItem onClick={resetLayouts} className="text-destructive">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isEditMode && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Edit Mode:</span> Drag widgets to rearrange, resize by dragging corners. 
            Click "Save Layout" when done.
          </AlertDescription>
        </Alert>
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        onLayoutChange={handleLayoutChange}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        rowHeight={40}
        margin={[12, 8]}
        containerPadding={[0, 0]}
        compactType={isEditMode ? null : "vertical"}
        preventCollision={false}
        draggableHandle={isEditMode ? ".drag-handle" : ""}
        verticalCompact={!isEditMode}
        transformScale={1}
        resizeHandles={['se', 's', 'e']}
        useCSSTransforms={true}
      >
        {['stats', 'alerts', 'system-overview', 'service-health', 'system-resources', 'dns-health', 'container-monitoring', 'quick-actions', 'pause-controls', 'recent-activity', 'provider-status', 'issues-monitoring'].map(widgetId => {
          const widget = renderWidget(widgetId)
          if (!widget) return null
          
          return (
            <div key={widgetId} className={isEditMode ? 'dashboard-item-edit h-full' : 'h-full'}>
              {isEditMode && (
                <div className="drag-handle absolute top-0 left-0 right-0 bg-muted/50 backdrop-blur-sm p-2 flex items-center gap-2 cursor-move z-10 border-b border-border rounded-t">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium capitalize text-foreground">
                    {widgetId.replace(/-/g, ' ')}
                  </span>
                </div>
              )}
              <div className={isEditMode ? 'pt-10 h-full overflow-hidden' : 'h-full overflow-hidden'}>
                {widget}
              </div>
            </div>
          )
        })}
      </ResponsiveGridLayout>
    </div>
  )
}

// Helper functions
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  
  return parts.join(' ') || '< 1m'
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let value = bytes
  
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  
  return `${value.toFixed(1)} ${units[i]}`
}