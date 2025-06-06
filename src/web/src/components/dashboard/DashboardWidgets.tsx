import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  X,
  Network,
  Lock,
  Search,
  Monitor,
  Wifi,
  AlertCircle,
  Clock,
  Eye
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { RecentActivity } from '@/components/RecentActivity'
import { PauseControls } from '@/components/PauseControls'

interface WidgetProps {
  widgetId: string
  isEditMode: boolean
  onRemove?: () => void
  data?: any
}

export const SystemStatsWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Activity className="h-5 w-5" />
          System Statistics
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">12</div>
          <div className="text-sm text-gray-600">DNS Records</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">3</div>
          <div className="text-sm text-gray-600">Active Containers</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">2</div>
          <div className="text-sm text-gray-600">Providers</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">98%</div>
          <div className="text-sm text-gray-600">Uptime</div>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const SystemAlertsWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <AlertTriangle className="h-5 w-5" />
          System Alerts
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm">All systems operational</span>
      </div>
    </CardContent>
  </Card>
)

export const SystemOverviewWidget = ({ isEditMode, onRemove }: WidgetProps) => {
  const navigate = useNavigate()
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
            <Shield className="h-5 w-5" />
            System Overview
          </CardTitle>
          {isEditMode && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Version</span>
            <Badge variant="secondary">v2.1.0</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Mode</span>
            <Badge variant="outline">Direct</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Status</span>
            <Badge className="bg-green-100 text-green-800">Running</Badge>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-4"
            onClick={() => navigate('/settings')}
          >
            View Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export const ServiceHealthWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Activity className="h-5 w-5" />
          Service Health
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm">DNS Manager</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600">Healthy</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">Docker Monitor</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600">Healthy</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">API Server</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600">Healthy</span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const SystemResourcesWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Cpu className="h-5 w-5" />
          System Resources
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>CPU</span>
            <span>24%</span>
          </div>
          <Progress value={24} className="h-2" />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Memory</span>
            <span>68%</span>
          </div>
          <Progress value={68} className="h-2" />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Disk</span>
            <span>42%</span>
          </div>
          <Progress value={42} className="h-2" />
        </div>
      </div>
    </CardContent>
  </Card>
)

export const PauseControlsWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Clock className="h-5 w-5" />
          Pause Controls
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <PauseControls />
    </CardContent>
  </Card>
)

export const RecentActivityWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Clock className="h-5 w-5" />
          Recent Activity
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <RecentActivity />
    </CardContent>
  </Card>
)

// DNS Widgets
export const DNSHealthWidget = ({ isEditMode, onRemove }: WidgetProps) => {
  const navigate = useNavigate()
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
            <Globe className="h-5 w-5" />
            DNS Health
          </CardTitle>
          {isEditMode && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Total Records</span>
            <Badge variant="secondary">12</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Orphaned</span>
            <Badge variant="destructive">2</Badge>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-4"
            onClick={() => navigate('/dns-records')}
          >
            View DNS Records
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export const ContainerMonitoringWidget = ({ isEditMode, onRemove }: WidgetProps) => {
  const navigate = useNavigate()
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
            <Container className="h-5 w-5" />
            Container Monitoring
          </CardTitle>
          {isEditMode && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm">Running</span>
            <Badge className="bg-green-100 text-green-800">3</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm">Stopped</span>
            <Badge variant="secondary">1</Badge>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-4"
            onClick={() => navigate('/containers')}
          >
            View Containers
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export const ProviderStatusWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <Link2 className="h-5 w-5" />
          Provider Status
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm">Cloudflare</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-green-600">Connected</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm">DigitalOcean</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-xs text-red-600">Offline</span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const QuickActionsWidget = ({ isEditMode, onRemove }: WidgetProps) => {
  const navigate = useNavigate()
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
            <TrendingUp className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          {isEditMode && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/dns-records')}
          >
            DNS Records
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/containers')}
          >
            Containers
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/hostnames')}
          >
            Hostnames
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/orphaned-records')}
          >
            Orphaned
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export const IssuesMonitoringWidget = ({ isEditMode, onRemove }: WidgetProps) => (
  <Card className="h-full">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
          <AlertTriangle className="h-5 w-5" />
          Issues Monitoring
        </CardTitle>
        {isEditMode && onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span className="text-sm">No issues detected</span>
      </div>
    </CardContent>
  </Card>
)

// Port Widgets
export const PortStatisticsWidget = ({ isEditMode, onRemove, data }: WidgetProps) => {
  const navigate = useNavigate()
  
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditMode && <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />}
            <Network className="h-5 w-5" />
            Port Statistics
          </CardTitle>
          {isEditMode && onRemove && (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data?.totalPorts || 0}</div>
            <div className="text-sm text-gray-600">Total Ports</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data?.availablePorts || 0}</div>
            <div className="text-sm text-gray-600">Available</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{data?.usedPorts || 0}</div>
            <div className="text-sm text-gray-600">In Use</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{data?.reservedPorts || 0}</div>
            <div className="text-sm text-gray-600">Reserved</div>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full mt-4"
          onClick={() => navigate('/port-monitoring')}
        >
          View Details
        </Button>
      </CardContent>
    </Card>
  )
}

// Export all widgets as a map for easy lookup
export const widgetComponents: Record<string, React.ComponentType<WidgetProps>> = {
  'stats': SystemStatsWidget,
  'alerts': SystemAlertsWidget,
  'system-overview': SystemOverviewWidget,
  'service-health': ServiceHealthWidget,
  'system-resources': SystemResourcesWidget,
  'pause-controls': PauseControlsWidget,
  'recent-activity': RecentActivityWidget,
  'dns-health': DNSHealthWidget,
  'container-monitoring': ContainerMonitoringWidget,
  'provider-status': ProviderStatusWidget,
  'quick-actions': QuickActionsWidget,
  'issues-monitoring': IssuesMonitoringWidget,
  'port-statistics': PortStatisticsWidget,
  // Add more widgets as needed
}