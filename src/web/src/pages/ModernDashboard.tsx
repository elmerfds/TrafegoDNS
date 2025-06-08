/**
 * Modern Customizable Dashboard
 * Clean, responsive dashboard with modern widget system
 */

import React, { useState, useEffect } from 'react'
import { Responsive, WidthProvider, Layout } from 'react-grid-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Settings, 
  Plus, 
  Save, 
  RotateCcw, 
  Layout as LayoutIcon,
  Edit2,
  Check,
  X
} from 'lucide-react'

// Dashboard components
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import { useWidgetRegistry, useWidgetRegistration } from '@/hooks/useWidgetRegistry'

// Widget imports
import { 
  SystemStatsWidget, 
  systemStatsDefinition 
} from '@/components/dashboard/widgets/SystemStatsWidget'
import { 
  SystemAlertsWidget, 
  systemAlertsDefinition 
} from '@/components/dashboard/widgets/SystemAlertsWidget'
import { 
  SystemResourcesWidget, 
  systemResourcesDefinition 
} from '@/components/dashboard/widgets/SystemResourcesWidget'
import { 
  DNSHealthWidget, 
  dnsHealthDefinition 
} from '@/components/dashboard/widgets/DNSHealthWidget'
import { 
  ContainerMonitoringWidget, 
  containerMonitoringDefinition 
} from '@/components/dashboard/widgets/ContainerMonitoringWidget'
import { 
  PortMonitoringWidget, 
  portMonitoringDefinition 
} from '@/components/dashboard/widgets/PortMonitoringWidget'
import { 
  StatusOverviewWidget, 
  statusOverviewDefinition 
} from '@/components/dashboard/widgets/StatusOverviewWidget'
import { 
  QuickActionsWidget, 
  quickActionsDefinition 
} from '@/components/dashboard/widgets/QuickActionsWidget'
import { 
  PortCheckerWidget, 
  portCheckerDefinition 
} from '@/components/dashboard/widgets/PortCheckerWidget'
import { 
  PortSuggestionsWidget, 
  portSuggestionsDefinition 
} from '@/components/dashboard/widgets/PortSuggestionsWidget'
import { 
  PortAlertsWidget, 
  portAlertsDefinition 
} from '@/components/dashboard/widgets/PortAlertsWidget'
import { 
  ServiceHealthWidget, 
  serviceHealthDefinition 
} from '@/components/dashboard/widgets/ServiceHealthWidget'
import { 
  ProviderStatusWidget, 
  providerStatusDefinition 
} from '@/components/dashboard/widgets/ProviderStatusWidget'
import { 
  PortScannerWidget, 
  portScannerDefinition 
} from '@/components/dashboard/widgets/PortScannerWidget'
import { 
  PortReservationsWidget, 
  portReservationsDefinition 
} from '@/components/dashboard/widgets/PortReservationsWidget'
import { 
  PortActivityWidget, 
  portActivityDefinition 
} from '@/components/dashboard/widgets/PortActivityWidget'
import { 
  RecentActivityWidget, 
  recentActivityDefinition 
} from '@/components/dashboard/widgets/RecentActivityWidget'
import { 
  PauseControlWidget, 
  pauseControlDefinition 
} from '@/components/dashboard/widgets/PauseControlWidget'

// Styles
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '@/styles/dashboard.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

// Responsive configuration with better adaptive sizing
const responsiveConfig = {
  breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480 },
  cols: { lg: 12, md: 10, sm: 6, xs: 4 },
  margin: [12, 12] as [number, number], // Reduced margins for better space utilization
  containerPadding: [12, 12] as [number, number],
  rowHeight: 60
}

// Widget registry setup - Now with 17 widgets matching old dashboard functionality
const availableWidgets = [
  // Core System Widgets
  { definition: statusOverviewDefinition, component: StatusOverviewWidget },
  { definition: systemStatsDefinition, component: SystemStatsWidget },
  { definition: systemAlertsDefinition, component: SystemAlertsWidget },
  { definition: systemResourcesDefinition, component: SystemResourcesWidget },
  { definition: serviceHealthDefinition, component: ServiceHealthWidget },
  { definition: recentActivityDefinition, component: RecentActivityWidget },
  { definition: quickActionsDefinition, component: QuickActionsWidget },
  { definition: pauseControlDefinition, component: PauseControlWidget },
  
  // DNS & Networking Widgets
  { definition: dnsHealthDefinition, component: DNSHealthWidget },
  { definition: providerStatusDefinition, component: ProviderStatusWidget },
  { definition: containerMonitoringDefinition, component: ContainerMonitoringWidget },
  
  // Port Management Widgets (matching old dashboard)
  { definition: portMonitoringDefinition, component: PortMonitoringWidget },
  { definition: portCheckerDefinition, component: PortCheckerWidget },
  { definition: portSuggestionsDefinition, component: PortSuggestionsWidget },
  { definition: portAlertsDefinition, component: PortAlertsWidget },
  { definition: portScannerDefinition, component: PortScannerWidget },
  { definition: portReservationsDefinition, component: PortReservationsWidget },
  { definition: portActivityDefinition, component: PortActivityWidget }
]

function AddWidgetDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const { addWidget } = useDashboard()
  const registry = useWidgetRegistry()
  
  const categories = ['system', 'dns', 'ports', 'monitoring', 'containers']
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>
            Choose a widget to add to your dashboard
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {categories.map(category => {
            const widgets = registry.getByCategory(category)
            if (widgets.length === 0) return null
            
            return (
              <div key={category}>
                <h4 className="font-medium mb-3 text-sm uppercase tracking-wide text-muted-foreground">
                  {category}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {widgets.map(widget => (
                    <Card
                      key={widget.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        addWidget(widget.id, widget)
                        setIsOpen(false)
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <widget.icon className="h-6 w-6 text-primary mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-sm">{widget.name}</h5>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {widget.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DashboardToolbar() {
  const {
    isEditing,
    hasUnsavedChanges,
    isSaving,
    setEditing,
    saveLayout,
    resetLayout,
    layouts,
    currentLayout
  } = useDashboard()

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your DNS records and container status in real-time
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && (
          <Badge variant="outline" className="bg-orange-50 text-orange-700">
            Unsaved Changes
          </Badge>
        )}
        
        {/* Save button */}
        {hasUnsavedChanges && (
          <Button
            variant="default"
            size="sm"
            onClick={() => saveLayout()}
            disabled={isSaving}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        )}
        
        {/* Edit toggle */}
        <Button
          variant={isEditing ? "default" : "outline"}
          size="sm"
          onClick={() => setEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Done
            </>
          ) : (
            <>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </>
          )}
        </Button>
        
        {/* Add widget (only in edit mode) */}
        {isEditing && <AddWidgetDialog />}
        
        {/* Layout management */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <LayoutIcon className="h-4 w-4 mr-2" />
              Layouts
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Manage Layouts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={resetLayout}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </DropdownMenuItem>
            
            {layouts.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Saved Layouts</DropdownMenuLabel>
                {layouts.map(layout => (
                  <DropdownMenuItem key={layout.id}>
                    <span className="flex-1">{layout.name}</span>
                    {layout.is_active && (
                      <Badge variant="secondary" className="ml-2">Active</Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function DashboardGrid() {
  const {
    widgets,
    hiddenWidgets,
    isEditing,
    updateLayout,
    removeWidget,
    currentLayouts
  } = useDashboard()
  const registry = useWidgetRegistry()

  const visibleWidgets = widgets.filter(id => !hiddenWidgets.has(id))

  const handleLayoutChange = (layout: Layout[], allLayouts: Record<string, Layout[]>) => {
    updateLayout(allLayouts)
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={currentLayouts}
      onLayoutChange={handleLayoutChange}
      breakpoints={responsiveConfig.breakpoints}
      cols={responsiveConfig.cols}
      rowHeight={responsiveConfig.rowHeight}
      margin={responsiveConfig.margin}
      containerPadding={responsiveConfig.containerPadding}
      isDraggable={isEditing}
      isResizable={isEditing}
      draggableHandle={isEditing ? ".drag-handle" : ""}
      compactType="vertical" // Always compact for better space utilization
      preventCollision={false}
      autoSize={true} // Auto-size container to content
      useCSSTransforms={true} // Better performance and animations
    >
      {visibleWidgets.map(widgetId => {
        const widgetComponent = registry.get(widgetId)
        if (!widgetComponent) {
          return (
            <div key={widgetId}>
              <Card className="h-full">
                <CardContent className="p-4">
                  <p>Widget "{widgetId}" not found</p>
                </CardContent>
              </Card>
            </div>
          )
        }

        const WidgetComponent = widgetComponent.component
        return (
          <div key={widgetId}>
            <WidgetComponent
              id={widgetId}
              isEditing={isEditing}
              onRemove={() => removeWidget(widgetId)}
              widgetDefinition={widgetComponent.definition}
            />
          </div>
        )
      })}
    </ResponsiveGridLayout>
  )
}

function DashboardContent() {
  const registry = useWidgetRegistry()
  
  // Register available widgets
  useWidgetRegistration(availableWidgets)

  return (
    <div className="container mx-auto p-6">
      <DashboardToolbar />
      <DashboardGrid />
    </div>
  )
}

export function ModernDashboard() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  )
}

export default ModernDashboard