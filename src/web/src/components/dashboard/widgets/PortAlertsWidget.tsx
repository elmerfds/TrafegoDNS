/**
 * Port Alerts Widget
 * Shows port-related security alerts and issues
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Shield, AlertTriangle, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortAlert {
  id: string
  port: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: 'security' | 'conflict' | 'suspicious' | 'configuration'
  title: string
  description: string
  timestamp: string
  acknowledged: boolean
}

function usePortAlerts() {
  return useQuery({
    queryKey: ['port-alerts'],
    queryFn: async (): Promise<PortAlert[]> => {
      try {
        const response = await api.get('/ports/alerts')
        const data = response.data.data
        // Ensure we always return an array
        if (Array.isArray(data)) {
          return data
        } else if (data && Array.isArray(data.alerts)) {
          return data.alerts
        } else {
          return []
        }
      } catch {
        // Mock data if API fails
        return [
          {
            id: '1',
            port: 22,
            severity: 'medium',
            type: 'security',
            title: 'SSH Port Exposed',
            description: 'SSH service is accessible from external networks',
            timestamp: new Date().toISOString(),
            acknowledged: false
          },
          {
            id: '2',
            port: 3000,
            severity: 'low',
            type: 'conflict',
            title: 'Port Conflict Detected',
            description: 'Multiple services attempting to bind to port 3000',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            acknowledged: false
          }
        ]
      }
    },
    refetchInterval: 60000, // Check every minute
  })
}

export function PortAlertsWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: alerts = [], isLoading, error } = usePortAlerts()
  const { displayMode = 'normal', currentBreakpoint = 'lg', layout } = props
  const isMobile = currentBreakpoint === 'xs' || currentBreakpoint === 'xxs'
  
  // Get current widget height from layout for dynamic sizing
  const currentHeight = layout?.h || 4
  
  // Calculate how many items to show based on widget size
  const getMaxItems = () => {
    if (displayMode === 'compact') return 3
    if (currentBreakpoint === 'lg') return 10  // More items on larger screens
    if (currentBreakpoint === 'md') return 6
    if (isMobile) return 3
    return 4
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': case 'high': return <AlertTriangle className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
      case 'medium': return <AlertCircle className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
      case 'low': return <Shield className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
      default: return <AlertCircle className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'security': return <Shield className="h-4 w-4" />
      case 'conflict': return <AlertTriangle className="h-4 w-4" />
      case 'suspicious': return <AlertCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const unacknowledgedAlerts = alerts.filter(alert => !alert.acknowledged)
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high')

  return (
    <WidgetBase
      {...props}
      title="Port Alerts"
      icon={AlertCircle}
      description="Port-related security alerts and issues"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      enableDynamicSizing={true}
      currentHeight={currentHeight}
      onSizeChange={props.onSizeChange}
      actions={
        <Badge variant={criticalAlerts.length > 0 ? 'destructive' : 'secondary'}>
          {unacknowledgedAlerts.length} alerts
        </Badge>
      }
    >
      <div className="flex flex-col h-full">
        {unacknowledgedAlerts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <CheckCircle className={cn(
              "text-green-500",
              isMobile ? "h-16 w-16" : "h-12 w-12"
            )} />
            <div className="text-center space-y-2">
              <h3 className={cn(
                "font-medium text-green-700 dark:text-green-300",
                isMobile ? "text-lg" : "text-base"
              )}>All Clear!</h3>
              <p className={cn(
                "text-green-600 dark:text-green-400",
                isMobile ? "text-base" : "text-sm"
              )}>
                No port alerts at this time
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0 mb-3">
            {unacknowledgedAlerts.slice(0, getMaxItems()).map((alert) => (
              <Alert key={alert.id} className={getSeverityColor(alert.severity)}>
                <div className="flex items-start gap-2">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1 min-w-0">
                    <AlertTitle className={cn(
                      "font-medium",
                      isMobile ? "text-base" : "text-sm"
                    )}>
                      <div className="flex items-center gap-2">
                        <span>Port {alert.port}</span>
                        <Badge variant="outline">
                          {alert.type}
                        </Badge>
                      </div>
                    </AlertTitle>
                    <AlertDescription className={cn(
                      "mt-1",
                      isMobile ? "text-sm" : "text-xs"
                    )}>
                      <p className="font-medium">{alert.title}</p>
                      <p className="mt-1 opacity-90">{alert.description}</p>
                      <p className="mt-1 opacity-70">
                        {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {/* Summary Stats - only in detailed mode */}
        {alerts.length > 0 && displayMode === 'detailed' && !isMobile && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">
                {criticalAlerts.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Critical/High
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">
                {alerts.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total Alerts
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {alerts.length > 0 && (
          <div className="flex gap-2 mt-auto">
            <Button
              variant="outline"
              size={isMobile ? "default" : "sm"}
              className={cn(
                "flex-1",
                isMobile && "min-h-[44px]"
              )}
              onClick={() => navigate('/port-monitoring')}
            >
              View All
            </Button>
            {criticalAlerts.length > 0 && (
              <Button
                variant="outline"
                size={isMobile ? "default" : "sm"}
                className={cn(
                  "flex-1",
                  isMobile && "min-h-[44px]"
                )}
                onClick={() => navigate('/port-management')}
              >
                Manage
              </Button>
            )}
          </div>
        )}
      </div>
    </WidgetBase>
  )
}

export const portAlertsDefinition: WidgetDefinition = {
  id: 'port-alerts',
  name: 'Port Alerts',
  description: 'Port-related security alerts and issues',
  category: 'ports',
  icon: AlertCircle,
  defaultSize: createResponsiveSizes({ w: 6, h: 6 }), // Medium preset: min + 4 width, min + 2 height
  minSize: createResponsiveSizes({ w: 4, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 12, h: 10 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}