import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Responsive, WidthProvider, Layout } from 'react-grid-layout'
import type { SavedLayout, DashboardLayout } from '@/types/dashboard'
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
  Minimize2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Layout as LayoutIcon,
  Network,
  Lock,
  Search,
  Monitor,
  Wifi,
  AlertCircle,
  Clock,
  Database,
  Eye
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { RecentActivity } from '@/components/RecentActivity'
import { PauseControls } from '@/components/PauseControls'
import { useToast } from '@/components/ui/use-toast'
import { usePortStore, usePortStatistics, useReservationsData, useServersData } from '@/store/portStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

// Import CSS for react-grid-layout
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '@/styles/dashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Available widgets definition
const availableWidgets = [
  // Core System Widgets
  { id: 'stats', name: 'System Statistics', category: 'Core', icon: Activity, description: 'Key system metrics and statistics' },
  { id: 'alerts', name: 'System Alerts', category: 'Core', icon: AlertTriangle, description: 'Important system alerts and warnings' },
  { id: 'system-overview', name: 'System Overview', category: 'Core', icon: Shield, description: 'System version, mode, and configuration' },
  { id: 'service-health', name: 'Service Health', category: 'Core', icon: Activity, description: 'Status of core services' },
  { id: 'system-resources', name: 'System Resources', category: 'Core', icon: Cpu, description: 'CPU, memory, and disk usage' },
  { id: 'pause-controls', name: 'Pause Controls', category: 'Core', icon: Settings, description: 'System pause and resume controls' },
  { id: 'recent-activity', name: 'Recent Activity', category: 'Core', icon: Clock, description: 'Latest system activity and events' },
  
  // DNS & Networking Widgets  
  { id: 'dns-health', name: 'DNS Health', category: 'DNS', icon: Globe, description: 'DNS provider status and health' },
  { id: 'container-monitoring', name: 'Container Monitoring', category: 'DNS', icon: Container, description: 'Docker container status' },
  { id: 'provider-status', name: 'Provider Status', category: 'DNS', icon: Link2, description: 'DNS provider connection status' },
  { id: 'issues-monitoring', name: 'Issues Monitoring', category: 'DNS', icon: AlertTriangle, description: 'System issues and monitoring' },
  { id: 'quick-actions', name: 'Quick Actions', category: 'DNS', icon: Settings, description: 'Common DNS management actions' },
  
  // Port Management Widgets
  { id: 'port-statistics', name: 'Port Statistics', category: 'Ports', icon: Network, description: 'Port monitoring statistics and overview' },
  { id: 'port-reservations', name: 'Port Reservations', category: 'Ports', icon: Lock, description: 'Active port reservations' },
  { id: 'port-availability', name: 'Port Availability', category: 'Ports', icon: Wifi, description: 'Real-time port availability status' },
  { id: 'port-scanner', name: 'Quick Port Scanner', category: 'Ports', icon: Search, description: 'Quick port scanning widget' },
  { id: 'port-alerts', name: 'Port Alerts', category: 'Ports', icon: AlertCircle, description: 'Port-related security alerts' },
  { id: 'server-status', name: 'Server Status', category: 'Ports', icon: Server, description: 'Monitored servers status' },
  { id: 'port-activity', name: 'Port Activity', category: 'Ports', icon: Monitor, description: 'Recent port activity and changes' },
  { id: 'port-recommendations', name: 'Port Recommendations', category: 'Ports', icon: Eye, description: 'Port usage recommendations' }
]

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
    { i: 'port-statistics', x: 0, y: 18, w: 6, h: 6, minH: 4, minW: 3 },
    { i: 'port-reservations', x: 6, y: 18, w: 6, h: 6, minH: 4, minW: 3 },
    { i: 'pause-controls', x: 0, y: 24, w: 4, h: 7, minH: 6, minW: 3 },
    { i: 'recent-activity', x: 4, y: 24, w: 8, h: 5, minH: 4, minW: 4 },
    { i: 'provider-status', x: 0, y: 31, w: 6, h: 6, minH: 4, minW: 3 },
    { i: 'issues-monitoring', x: 6, y: 31, w: 6, h: 6, minH: 4, minW: 3 },
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
    { i: 'port-statistics', x: 0, y: 33, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'port-reservations', x: 5, y: 33, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'pause-controls', x: 0, y: 39, w: 10, h: 7, minH: 6, minW: 5 },
    { i: 'recent-activity', x: 0, y: 46, w: 10, h: 5, minH: 4, minW: 5 },
    { i: 'provider-status', x: 0, y: 51, w: 5, h: 6, minH: 4, minW: 3 },
    { i: 'issues-monitoring', x: 5, y: 51, w: 5, h: 6, minH: 4, minW: 3 },
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
    { i: 'port-statistics', x: 0, y: 51, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'port-reservations', x: 0, y: 57, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'pause-controls', x: 0, y: 63, w: 6, h: 8, minH: 7, minW: 6 },
    { i: 'recent-activity', x: 0, y: 71, w: 6, h: 5, minH: 4, minW: 6 },
    { i: 'provider-status', x: 0, y: 76, w: 6, h: 6, minH: 5, minW: 6 },
    { i: 'issues-monitoring', x: 0, y: 82, w: 6, h: 6, minH: 5, minW: 6 },
  ]
}

export function CustomizableDashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [layouts, setLayouts] = useState<{ [breakpoint: string]: Layout[] }>(defaultLayouts)
  const [isEditMode, setIsEditMode] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newLayoutName, setNewLayoutName] = useState('')
  const [editingLayoutName, setEditingLayoutName] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [showWidgetDialog, setShowWidgetDialog] = useState(false)
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set())
  
  // Port widget interaction states
  const [quickPortCheck, setQuickPortCheck] = useState('')
  const [portCheckLoading, setPortCheckLoading] = useState(false)
  const [showQuickReservation, setShowQuickReservation] = useState(false)
  const [reservationPort, setReservationPort] = useState('')
  const [reservationContainer, setReservationContainer] = useState('')
  
  // Port monitoring data
  const { statistics: portStats, loading: portStatsLoading } = usePortStatistics()
  const { reservations, loading: reservationsLoading } = useReservationsData()
  const { servers, loading: serversLoading } = useServersData()
  const { fetchStatistics, fetchReservations, fetchServers } = usePortStore()
  
  // Load port monitoring data
  useEffect(() => {
    fetchStatistics()
    fetchReservations()
    fetchServers()
  }, [fetchStatistics, fetchReservations, fetchServers])
  
  // Load all saved layouts
  const { data: savedLayoutsData } = useQuery({
    queryKey: ['dashboard-layouts'],
    queryFn: async () => {
      const response = await api.get('/user/dashboard-layouts')
      return response.data
    },
  })
  
  // Load active layout
  const { data: activeLayoutData } = useQuery({
    queryKey: ['dashboard-layouts-active'],
    queryFn: async () => {
      const response = await api.get('/user/dashboard-layouts/active')
      return response.data
    },
  })
  
  // Update layouts when active layout is loaded
  useEffect(() => {
    if (activeLayoutData?.data?.layout) {
      setLayouts(activeLayoutData.data.layout)
    }
  }, [activeLayoutData])
  
  // Mutation for saving a new layout
  const saveLayoutMutation = useMutation({
    mutationFn: async ({ name, layout }: { name: string, layout: { [breakpoint: string]: Layout[] } }) => {
      const response = await api.put(`/user/dashboard-layouts/${encodeURIComponent(name)}`, { layout })
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Layout saved',
        description: 'Your dashboard layout has been saved successfully.',
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
      setShowSaveDialog(false)
      setNewLayoutName('')
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save dashboard layout.',
        variant: 'destructive',
      })
    },
  })
  
  // Mutation for deleting a layout
  const deleteLayoutMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.delete(`/user/dashboard-layouts/${encodeURIComponent(name)}`)
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Layout deleted',
        description: 'The layout has been deleted successfully.',
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete layout.',
        variant: 'destructive',
      })
    },
  })
  
  // Mutation for setting active layout
  const setActiveLayoutMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.put(`/user/dashboard-layouts/${encodeURIComponent(name)}/set-active`)
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Layout activated',
        description: 'The layout has been set as active.',
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to set active layout.',
        variant: 'destructive',
      })
    },
  })

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

  const handleLayoutChange = (currentLayout: Layout[], allLayouts: { [breakpoint: string]: Layout[] }) => {
    // Always update layouts to maintain state
    setLayouts(allLayouts)
  }

  // Widget management functions
  const addWidget = (widgetId: string) => {
    const newLayouts = { ...layouts }
    
    // Define widget-specific sizes for better initial display
    const getWidgetSize = (breakpoint: string) => {
      const isLarge = breakpoint === 'lg'
      const isMedium = breakpoint === 'md'
      
      // Port widgets need more space for their content
      if (widgetId.startsWith('port-')) {
        return {
          w: isLarge ? 6 : isMedium ? 5 : 6,
          h: isLarge ? 8 : isMedium ? 8 : 10,
          minH: 6,
          minW: isLarge ? 4 : isMedium ? 3 : 6
        }
      }
      
      // Stats widget needs full width
      if (widgetId === 'stats') {
        return {
          w: isLarge ? 12 : isMedium ? 10 : 6,
          h: 4,
          minH: 3,
          minW: isLarge ? 6 : isMedium ? 5 : 6
        }
      }
      
      // Default size for other widgets
      return {
        w: isLarge ? 4 : isMedium ? 5 : 6,
        h: 6,
        minH: 4,
        minW: isLarge ? 3 : isMedium ? 3 : 6
      }
    }
    
    Object.keys(newLayouts).forEach(breakpoint => {
      const layout = newLayouts[breakpoint]
      const cols = breakpoint === 'lg' ? 12 : breakpoint === 'md' ? 10 : 6
      const widgetSize = getWidgetSize(breakpoint)
      
      // Find the lowest available position
      let x = 0
      let y = 0
      
      // Calculate the maximum Y position
      const maxY = Math.max(...layout.map((item: Layout) => item.y + item.h), 0)
      
      // Try to place at the bottom
      y = maxY
      x = 0
      
      // Check if there's space in the current row
      while (x <= cols - widgetSize.w) {
        const hasCollision = layout.some((item: Layout) => 
          x < item.x + item.w && x + widgetSize.w > item.x && 
          y < item.y + item.h && y + widgetSize.h > item.y
        )
        
        if (!hasCollision) {
          break
        }
        x += 1
        
        // If we reach the end of the row, move to next row
        if (x > cols - widgetSize.w) {
          x = 0
          y = maxY + 1
        }
      }
      
      // Add the widget
      layout.push({
        i: widgetId,
        x,
        y,
        ...widgetSize
      })
    })
    
    setLayouts(newLayouts)
    setHiddenWidgets(prev => {
      const updated = new Set(prev)
      updated.delete(widgetId)
      return updated
    })
    
    // Auto-save the layout after adding a widget
    setTimeout(() => {
      const currentLayoutName = activeLayoutData?.data?.name || 'default'
      if (currentLayoutName !== 'default') {
        // Update existing layout
        saveLayoutMutation.mutate({ name: currentLayoutName, layout: newLayouts })
      } else {
        // Create a new "My Dashboard" layout to persist changes
        const autoLayoutName = 'My Dashboard'
        saveLayoutMutation.mutate({ name: autoLayoutName, layout: newLayouts })
      }
    }, 500)
    
    toast({
      title: 'Widget added',
      description: 'Widget has been added to your dashboard.',
    })
  }

  const removeWidget = (widgetId: string) => {
    const newLayouts = { ...layouts }
    
    Object.keys(newLayouts).forEach(breakpoint => {
      newLayouts[breakpoint] = newLayouts[breakpoint].filter((item: Layout) => item.i !== widgetId)
    })
    
    setLayouts(newLayouts)
    setHiddenWidgets(prev => new Set([...prev, widgetId]))
    
    // Auto-save the layout after removing a widget
    setTimeout(() => {
      const currentLayoutName = activeLayoutData?.data?.name || 'default'
      if (currentLayoutName !== 'default') {
        // Update existing layout
        saveLayoutMutation.mutate({ name: currentLayoutName, layout: newLayouts })
      } else {
        // Create a new "My Dashboard" layout to persist changes
        const autoLayoutName = 'My Dashboard'
        saveLayoutMutation.mutate({ name: autoLayoutName, layout: newLayouts })
      }
    }, 500)
    
    toast({
      title: 'Widget removed',
      description: 'Widget has been removed from your dashboard.',
    })
  }

  const getVisibleWidgets = () => {
    const currentLayout = layouts.lg || []
    return currentLayout.map((item: Layout) => item.i).filter((id: string) => !hiddenWidgets.has(id))
  }

  const getAvailableWidgets = () => {
    const visibleWidgets = new Set(getVisibleWidgets())
    return availableWidgets.filter(widget => !visibleWidgets.has(widget.id))
  }

  const saveCurrentLayout = (name: string) => {
    saveLayoutMutation.mutate({ name, layout: layouts })
  }
  
  const loadLayout = async (name: string) => {
    try {
      const response = await api.get(`/user/dashboard-layouts/${encodeURIComponent(name)}`)
      if (response.data.data?.layout) {
        setLayouts(response.data.data.layout)
        setActiveLayoutMutation.mutate(name)
        toast({
          title: 'Layout loaded',
          description: `Loaded layout "${name}"`,
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load layout.',
        variant: 'destructive',
      })
    }
  }
  
  const renameLayout = async (oldName: string, newName: string) => {
    try {
      // Get the layout data first
      const response = await api.get(`/user/dashboard-layouts/${encodeURIComponent(oldName)}`)
      if (response.data.data) {
        // Save with new name
        await api.put(`/user/dashboard-layouts/${encodeURIComponent(newName)}`, { layout: response.data.data.layout })
        // Delete old one
        await api.delete(`/user/dashboard-layouts/${encodeURIComponent(oldName)}`)
        // If it was active, set the new one as active
        if (response.data.data.is_active) {
          await api.put(`/user/dashboard-layouts/${encodeURIComponent(newName)}/set-active`)
        }
        toast({
          title: 'Layout renamed',
          description: `Layout renamed to "${newName}"`,
        })
        queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to rename layout.',
        variant: 'destructive',
      })
    }
    setEditingLayoutName(null)
    setNewName('')
  }

  const resetToDefault = () => {
    setLayouts(defaultLayouts)
    toast({
      title: 'Layout reset',
      description: 'Dashboard layout has been reset to default.',
    })
    setIsEditMode(false)
  }

  // Port widget API functions
  const quickCheckPort = async () => {
    if (!quickPortCheck.trim()) return
    
    setPortCheckLoading(true)
    try {
      const response = await api.post('/ports/check-availability', {
        ports: [parseInt(quickPortCheck)],
        protocol: 'tcp',
        server: 'localhost'
      })
      
      const result = response.data.data.ports[0]
      toast({
        title: `Port ${quickPortCheck}`,
        description: result.available ? 'Available ✅' : 'In Use ❌',
        variant: result.available ? 'default' : 'destructive'
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to check port',
        variant: 'destructive'
      })
    } finally {
      setPortCheckLoading(false)
    }
  }

  const createQuickReservation = async () => {
    if (!reservationPort.trim() || !reservationContainer.trim()) return
    
    try {
      await api.post('/ports/reserve', {
        ports: [parseInt(reservationPort)],
        container_id: reservationContainer,
        protocol: 'tcp',
        duration: 3600, // 1 hour
        server: 'localhost'
      })
      
      toast({
        title: 'Port Reserved',
        description: `Port ${reservationPort} reserved for ${reservationContainer}`,
      })
      
      setShowQuickReservation(false)
      setReservationPort('')
      setReservationContainer('')
      
      // Refresh reservations data
      fetchReservations()
    } catch (error: any) {
      toast({
        title: 'Reservation Failed',
        description: error.response?.data?.message || 'Failed to create reservation',
        variant: 'destructive'
      })
    }
  }

  const releaseReservation = async (reservationId: string) => {
    try {
      await api.delete(`/ports/reserve`, {
        data: { reservationId }
      })
      
      toast({
        title: 'Reservation Released',
        description: 'Port reservation has been released',
      })
      
      // Refresh reservations data
      fetchReservations()
    } catch (error: any) {
      toast({
        title: 'Release Failed',
        description: error.response?.data?.message || 'Failed to release reservation',
        variant: 'destructive'
      })
    }
  }

  const compactLayout = () => {
    const compactedLayouts = { ...layouts }
    
    // Compact each breakpoint layout
    Object.keys(compactedLayouts).forEach(breakpoint => {
      if (compactedLayouts[breakpoint] && Array.isArray(compactedLayouts[breakpoint])) {
        // Sort all widgets by Y position then X position
        const sortedWidgets = [...compactedLayouts[breakpoint]].sort((a: Layout, b: Layout) => {
          if (a.y === b.y) return a.x - b.x
          return a.y - b.y
        })
        
        // Track occupied spaces
        const occupiedSpaces = new Map<string, boolean>()
        
        // Place each widget in the first available position
        sortedWidgets.forEach((widget: Layout) => {
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
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                System Resources
              </CardTitle>
              <CardDescription>Current resource utilization</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              {metrics ? (
                <>
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
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-sm text-muted-foreground">Loading metrics...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )

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

      case 'port-statistics':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Port Statistics
              </CardTitle>
              <CardDescription>Port monitoring overview and metrics</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              {portStatsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Range Size</span>
                    <span className="text-lg font-bold">
                      {portStats?.totalMonitoredPorts || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Available</span>
                    <span className="text-lg font-bold text-green-600">
                      {portStats?.availablePortsInRange || portStats?.ports?.byStatus?.closed || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">In Use</span>
                    <span className="text-lg font-bold text-red-600">
                      {portStats?.systemPortsInUse || portStats?.ports?.byStatus?.open || 0}
                    </span>
                  </div>
                  <div className="pt-2 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Port #"
                        value={quickPortCheck}
                        onChange={(e) => setQuickPortCheck(e.target.value)}
                        className="flex-1 h-8 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && quickCheckPort()}
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 px-2"
                        onClick={quickCheckPort}
                        disabled={portCheckLoading || !quickPortCheck.trim()}
                      >
                        {portCheckLoading ? (
                          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Search className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8 text-xs"
                      onClick={() => navigate('/port-management')}
                    >
                      <Monitor className="h-3 w-3 mr-1" />
                      Full View
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )

      case 'port-reservations':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Port Reservations
              </CardTitle>
              <CardDescription>Active port reservations</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              {reservationsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Active Reservations</span>
                    <span className="text-lg font-bold">
                      {Array.isArray(reservations) ? reservations.filter(r => r.status === 'active').length : 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(reservations) && reservations.slice(0, 3).map((reservation) => (
                      <div key={reservation.id} className="flex items-center justify-between p-2 border rounded text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{reservation.port}/{reservation.protocol}</span>
                          <Badge variant="secondary" className="text-xs">
                            {reservation.container_id?.substring(0, 8)}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                          onClick={() => releaseReservation(reservation.id)}
                          title="Release reservation"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 space-y-2">
                    {!showQuickReservation ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-8 text-xs"
                        onClick={() => setShowQuickReservation(true)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Quick Reserve
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <Input
                            placeholder="Port"
                            value={reservationPort}
                            onChange={(e) => setReservationPort(e.target.value)}
                            className="flex-1 h-7 text-xs"
                          />
                          <Input
                            placeholder="Container"
                            value={reservationContainer}
                            onChange={(e) => setReservationContainer(e.target.value)}
                            className="flex-1 h-7 text-xs"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 h-7 text-xs"
                            onClick={createQuickReservation}
                            disabled={!reservationPort.trim() || !reservationContainer.trim()}
                          >
                            Reserve
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2"
                            onClick={() => setShowQuickReservation(false)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8 text-xs"
                      onClick={() => navigate('/port-management?tab=reservations')}
                    >
                      <Lock className="h-3 w-3 mr-1" />
                      Full View
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )

      case 'port-availability':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Port Availability
              </CardTitle>
              <CardDescription>Real-time port availability status</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available Ports</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">
                    {portStats?.availablePortsInRange || 0}
                  </span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monitoring Status</span>
                <Badge variant={portStats?.monitoringEnabled ? 'default' : 'destructive'}>
                  {portStats?.monitoringEnabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Range Health</span>
                  <span className="text-sm font-medium">
                    {portStats?.availablePortsInRange ? Math.round((portStats.availablePortsInRange / (portStats.totalMonitoredPorts || 1)) * 100) : 0}%
                  </span>
                </div>
                <Progress 
                  value={portStats?.availablePortsInRange ? Math.round((portStats.availablePortsInRange / (portStats.totalMonitoredPorts || 1)) * 100) : 0} 
                  className="h-2"
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    fetchStatistics()
                    toast({
                      title: 'Statistics Refreshed',
                      description: 'Port availability data updated',
                    })
                  }}
                  disabled={portStatsLoading}
                >
                  {portStatsLoading ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <Activity className="h-3 w-3 mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'port-scanner':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Quick Port Scanner
              </CardTitle>
              <CardDescription>Scan ports for availability</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Common Port Checks</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Web', ports: [80, 443], icon: Globe },
                    { label: 'Dev', ports: [3000, 8080], icon: Activity },
                    { label: 'DB', ports: [5432, 3306], icon: Database },
                    { label: 'SSH/FTP', ports: [22, 21], icon: Server }
                  ].map(({ label, ports, icon: Icon }) => (
                    <Button 
                      key={label}
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-8 flex flex-col gap-1 p-2"
                      onClick={async () => {
                        setPortCheckLoading(true)
                        try {
                          const response = await api.post('/ports/check-availability', {
                            ports,
                            protocol: 'tcp',
                            server: 'localhost'
                          })
                          
                          const available = response.data.data.ports.filter((p: any) => p.available).length
                          const total = ports.length
                          
                          toast({
                            title: `${label} Ports`,
                            description: `${available}/${total} available`,
                            variant: available === total ? 'default' : 'destructive'
                          })
                        } catch (error) {
                          toast({
                            title: 'Check Failed',
                            description: `Failed to check ${label} ports`,
                            variant: 'destructive'
                          })
                        } finally {
                          setPortCheckLoading(false)
                        }
                      }}
                      disabled={portCheckLoading}
                    >
                      {portCheckLoading ? (
                        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Icon className="h-3 w-3" />
                          <span>{label}</span>
                        </>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-8 text-xs"
                  onClick={() => navigate('/port-management?tab=check')}
                >
                  <Search className="h-3 w-3 mr-1" />
                  Advanced Scan
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'port-alerts':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Port Alerts
              </CardTitle>
              <CardDescription>Port-related security alerts</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Alerts</span>
                <span className="text-lg font-bold">
                  {portStats?.alerts?.total || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Unacknowledged</span>
                <span className="text-lg font-bold text-orange-600">
                  {portStats?.alerts?.unacknowledged || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recent Activity</span>
                <span className="text-sm font-medium">
                  {portStats?.alerts?.recent || 0} in 24h
                </span>
              </div>
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/port-management?tab=alerts')}
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  View Alerts
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'server-status':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Server Status
              </CardTitle>
              <CardDescription>Monitored servers status</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              {serversLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Servers</span>
                    <span className="text-lg font-bold">
                      {Array.isArray(servers) ? servers.length : 0}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {Array.isArray(servers) && servers.slice(0, 3).map((server) => (
                      <div key={server.id} className="flex items-center justify-between p-2 border rounded text-xs">
                        <div className="flex items-center gap-2">
                          <Server className="h-3 w-3" />
                          <span className="font-medium">{server.name}</span>
                        </div>
                        <Badge variant={server.isHost ? 'default' : 'outline'} className="text-xs">
                          {server.isHost ? 'Host' : 'Remote'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => navigate('/port-management?tab=servers')}
                    >
                      <Server className="h-4 w-4 mr-2" />
                      Manage Servers
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )

      case 'port-activity':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Port Activity
              </CardTitle>
              <CardDescription>Recent port activity and changes</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recent Scans</span>
                <span className="text-lg font-bold">
                  {portStats?.scans?.recentScans || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Port Changes</span>
                <span className="text-lg font-bold">
                  {portStats?.ports?.recentActivity || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Scan Time</span>
                <span className="text-sm font-medium">
                  {portStats?.scans?.averageDuration ? `${portStats.scans.averageDuration}ms` : 'N/A'}
                </span>
              </div>
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/port-management?tab=activity')}
                >
                  <Clock className="h-4 w-4 mr-2" />
                  View Activity
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'port-recommendations':
        return (
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Port Recommendations
              </CardTitle>
              <CardDescription>Port usage recommendations</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Quick Suggestions</div>
                <div className="space-y-1">
                  <div className="text-xs text-green-600">✓ Ports 3000-3010 available</div>
                  <div className="text-xs text-blue-600">ℹ Consider port 8080 for web services</div>
                  <div className="text-xs text-orange-600">⚠ Port 80 commonly in use</div>
                </div>
              </div>
              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => navigate('/port-management?tab=suggestions')}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Get Suggestions
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
        <div className="flex gap-2">
          {/* Layout selector */}
          <Select 
            value={activeLayoutData?.data?.name || 'default'}
            onValueChange={(value) => {
              if (value === 'default') {
                resetToDefault()
              } else {
                loadLayout(value)
              }
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select layout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">
                <div className="flex items-center">
                  <LayoutIcon className="h-4 w-4 mr-2" />
                  Default Layout
                </div>
              </SelectItem>
              {savedLayoutsData?.data?.map((layout: SavedLayout) => (
                <SelectItem key={layout.id} value={layout.name}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <LayoutIcon className="h-4 w-4 mr-2" />
                      {editingLayoutName === layout.name ? (
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameLayout(layout.name, newName)
                            } else if (e.key === 'Escape') {
                              setEditingLayoutName(null)
                              setNewName('')
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-6 px-2"
                          autoFocus
                        />
                      ) : (
                        <span>{layout.name}</span>
                      )}
                    </div>
                    {layout.is_active && (
                      <Badge variant="default" className="ml-2 text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Widget Management */}
          <Dialog open={showWidgetDialog} onOpenChange={setShowWidgetDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Widgets
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Manage Dashboard Widgets</DialogTitle>
                <DialogDescription>
                  Add or remove widgets from your dashboard. Drag widgets in edit mode to rearrange them.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {/* Available Widgets by Category */}
                {['Core', 'DNS', 'Ports'].map(category => {
                  const categoryWidgets = getAvailableWidgets().filter(w => w.category === category);
                  if (categoryWidgets.length === 0) return null;
                  
                  return (
                    <div key={category} className="space-y-3">
                      <h3 className="font-medium text-lg">{category} Widgets</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {categoryWidgets.map((widget) => {
                          const IconComponent = widget.icon;
                          return (
                            <div key={widget.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50">
                              <div className="flex items-start gap-3 flex-1">
                                <IconComponent className="h-5 w-5 mt-0.5 text-muted-foreground" />
                                <div className="flex-1">
                                  <div className="font-medium">{widget.name}</div>
                                  <div className="text-sm text-muted-foreground">{widget.description}</div>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => addWidget(widget.id)}
                                className="ml-2"
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                
                {/* Currently Visible Widgets */}
                <div className="space-y-3">
                  <h3 className="font-medium text-lg">Current Widgets</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {getVisibleWidgets().map((widgetId) => {
                      const widget = availableWidgets.find(w => w.id === widgetId);
                      if (!widget) return null;
                      
                      const IconComponent = widget.icon;
                      return (
                        <div key={widget.id} className="flex items-start justify-between p-3 border rounded-lg bg-muted/30">
                          <div className="flex items-start gap-3 flex-1">
                            <IconComponent className="h-5 w-5 mt-0.5 text-muted-foreground" />
                            <div className="flex-1">
                              <div className="font-medium">{widget.name}</div>
                              <div className="text-sm text-muted-foreground">{widget.description}</div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeWidget(widget.id)}
                            className="ml-2 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowWidgetDialog(false)}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Layout Settings
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Edit Layout</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setIsEditMode(!isEditMode)}>
                <GripVertical className="h-4 w-4 mr-2" />
                {isEditMode ? 'Exit Edit Mode' : 'Edit Current Layout'}
              </DropdownMenuItem>
              {isEditMode && (
                <>
                  <DropdownMenuItem onClick={compactLayout}>
                    <Minimize2 className="h-4 w-4 mr-2" />
                    Compact Layout
                  </DropdownMenuItem>
                </>
              )}
              
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Manage Layouts</DropdownMenuLabel>
              
              <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => {
                    e.preventDefault()
                    setShowSaveDialog(true)
                  }}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Layout As...
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Layout</DialogTitle>
                    <DialogDescription>
                      Give your current layout a name to save it for later use.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="name"
                        value={newLayoutName}
                        onChange={(e) => setNewLayoutName(e.target.value)}
                        placeholder="My Custom Layout"
                        className="col-span-3"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      onClick={() => {
                        if (newLayoutName.trim()) {
                          saveCurrentLayout(newLayoutName.trim())
                        }
                      }}
                      disabled={!newLayoutName.trim()}
                    >
                      Save Layout
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {savedLayoutsData?.data && savedLayoutsData.data.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Saved Layouts</DropdownMenuLabel>
                  {savedLayoutsData.data.map((layout: SavedLayout) => (
                    <div key={layout.id} className="flex items-center px-2 py-1.5 text-sm hover:bg-accent rounded-sm">
                      <span className="flex-1 truncate">{layout.name}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingLayoutName(layout.name)
                            setNewName(layout.name)
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Layout</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the layout "{layout.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteLayoutMutation.mutate(layout.name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </>
              )}
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={resetToDefault} className="text-destructive">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        resizeHandles={['se', 's', 'e', 'w', 'sw']}
        useCSSTransforms={true}
      >
        {getVisibleWidgets().map(widgetId => {
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
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeWidget(widgetId);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
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