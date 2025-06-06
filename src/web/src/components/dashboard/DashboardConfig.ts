import { Layout } from 'react-grid-layout'
import { 
  Activity, 
  Globe, 
  Container, 
  Link2, 
  Server,
  AlertTriangle,
  Shield,
  Settings,
  Network,
  Lock,
  Search,
  Monitor,
  Wifi,
  AlertCircle,
  Clock,
  Eye
} from 'lucide-react'

// Widget configuration type
export interface WidgetConfig {
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
}

// Available widgets definition
export const availableWidgets = [
  // Core System Widgets
  { id: 'stats', name: 'System Statistics', category: 'Core', icon: Activity, description: 'Key system metrics and statistics' },
  { id: 'alerts', name: 'System Alerts', category: 'Core', icon: AlertTriangle, description: 'Important system alerts and warnings' },
  { id: 'system-overview', name: 'System Overview', category: 'Core', icon: Shield, description: 'System version, mode, and configuration' },
  { id: 'service-health', name: 'Service Health', category: 'Core', icon: Activity, description: 'Status of core services' },
  { id: 'system-resources', name: 'System Resources', category: 'Core', icon: Activity, description: 'CPU, memory, and disk usage' },
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
  { id: 'port-suggestions', name: 'Port Generator', category: 'Ports', icon: Eye, description: 'Generate available ports for different service types' }
]

// Widget size configurations for responsive design
export const widgetConfig: Record<string, WidgetConfig> = {
  // Core widgets
  'stats': { defaultSize: { w: 12, h: 4 }, minSize: { w: 4, h: 3 } },
  'alerts': { defaultSize: { w: 12, h: 2 }, minSize: { w: 4, h: 2 } },
  'system-overview': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  'service-health': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  'system-resources': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  'pause-controls': { defaultSize: { w: 4, h: 7 }, minSize: { w: 2, h: 6 } },
  'recent-activity': { defaultSize: { w: 8, h: 5 }, minSize: { w: 4, h: 4 } },
  
  // DNS widgets
  'dns-health': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  'container-monitoring': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  'provider-status': { defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },
  'issues-monitoring': { defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },
  'quick-actions': { defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  
  // Port widgets
  'port-statistics': { defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },
  'port-reservations': { defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },
  'port-availability': { defaultSize: { w: 4, h: 5 }, minSize: { w: 2, h: 3 } },
  'port-scanner': { defaultSize: { w: 4, h: 5 }, minSize: { w: 2, h: 3 } },
  'port-alerts': { defaultSize: { w: 4, h: 5 }, minSize: { w: 2, h: 3 } },
  'server-status': { defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },
  'port-activity': { defaultSize: { w: 6, h: 5 }, minSize: { w: 3, h: 3 } },
  'port-suggestions': { defaultSize: { w: 4, h: 5 }, minSize: { w: 2, h: 3 } }
}

// Generate default layouts based on widget configuration
export const generateDefaultLayouts = () => {
  const defaultWidgets = [
    'stats', 'alerts', 'system-overview', 'service-health', 'system-resources',
    'dns-health', 'container-monitoring', 'quick-actions',
    'port-statistics', 'port-reservations', 'pause-controls', 'recent-activity',
    'provider-status', 'issues-monitoring'
  ]
  
  const layouts: { [breakpoint: string]: Layout[] } = {}
  
  // Large screens (12 columns)
  layouts.lg = []
  let y = 0
  let x = 0
  
  defaultWidgets.forEach(widgetId => {
    const config = widgetConfig[widgetId]
    if (!config) return
    
    const { w, h } = config.defaultSize
    const { w: minW, h: minH } = config.minSize
    
    // If widget doesn't fit in current row, move to next row
    if (x + w > 12) {
      y += Math.max(4, minH) // Add some vertical spacing
      x = 0
    }
    
    layouts.lg.push({ i: widgetId, x, y, w, h, minW, minH })
    x += w
  })
  
  // Medium screens (10 columns) - more compact
  layouts.md = []
  y = 0
  x = 0
  
  defaultWidgets.forEach(widgetId => {
    const config = widgetConfig[widgetId]
    if (!config) return
    
    let { w, h } = config.defaultSize
    const { w: minW, h: minH } = config.minSize
    
    // Scale down width for medium screens
    w = Math.min(w, Math.max(minW, Math.floor(w * 0.8)))
    
    if (x + w > 10) {
      y += Math.max(4, minH)
      x = 0
    }
    
    layouts.md.push({ i: widgetId, x, y, w, h, minW: Math.max(2, minW), minH })
    x += w
  })
  
  // Small screens (4 columns) - single column layout
  layouts.sm = []
  y = 0
  
  defaultWidgets.forEach(widgetId => {
    const config = widgetConfig[widgetId]
    if (!config) return
    
    const h = config.defaultSize.h
    const minH = config.minSize.h
    
    // All widgets take full width on mobile
    layouts.sm.push({ 
      i: widgetId, 
      x: 0, 
      y, 
      w: 4, 
      h: Math.max(minH, Math.floor(h * 0.8)), 
      minW: 1, 
      minH: Math.max(2, minH - 1)
    })
    y += Math.max(minH, Math.floor(h * 0.8))
  })
  
  return layouts
}

// Responsive breakpoints configuration
export const responsiveConfig = {
  breakpoints: { lg: 1200, md: 996, sm: 768 },
  cols: { lg: 12, md: 10, sm: 4 }
}

// Grid layout configuration
export const gridConfig = {
  rowHeight: 60,
  margin: [12, 8] as [number, number],
  containerPadding: [0, 0] as [number, number],
  preventCollision: false
}