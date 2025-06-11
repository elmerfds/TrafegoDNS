/**
 * System Alerts Widget
 * Shows important system alerts and warnings
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemAlert {
  id: string
  type: 'warning' | 'error' | 'info'
  title: string
  description: string
  timestamp: string
}

function useSystemAlerts() {
  return useQuery({
    queryKey: ['system-alerts'],
    queryFn: async (): Promise<SystemAlert[]> => {
      try {
        // Try to get orphaned records as alerts
        const response = await api.get('/dns/orphaned')
        const orphaned = response.data.data
        
        if (orphaned && orphaned.count > 0) {
          return [{
            id: 'orphaned-records',
            type: 'warning',
            title: 'Orphaned DNS Records',
            description: `${orphaned.count} orphaned DNS records need attention`,
            timestamp: new Date().toISOString()
          }]
        }
        return []
      } catch {
        // Fallback to mock data if API fails
        return []
      }
    },
    refetchInterval: 60000, // Check every minute
  })
}

export function SystemAlertsWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: alerts = [], isLoading, error } = useSystemAlerts()

  return (
    <WidgetBase
      {...props}
      title="System Alerts"
      icon={AlertTriangle}
      description="Important system alerts and warnings"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
    >
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <div>
              <h3 className="font-medium text-green-700 dark:text-green-300">All Clear!</h3>
              <p className="text-sm text-green-600 dark:text-green-400">
                No system alerts at this time
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Last checked: {new Date().toLocaleTimeString()}
            </div>
          </div>
        ) : (
          alerts.map((alert) => (
            <Alert 
              key={alert.id}
              className={
                alert.type === 'error' 
                  ? 'border-red-200 bg-red-50 dark:bg-red-950/30' 
                  : alert.type === 'warning'
                  ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/30'
                  : 'border-blue-200 bg-blue-50 dark:bg-blue-950/30'
              }
            >
              <AlertTriangle className={`h-4 w-4 ${
                alert.type === 'error' 
                  ? 'text-red-600' 
                  : alert.type === 'warning'
                  ? 'text-orange-600'
                  : 'text-blue-600'
              }`} />
              <AlertTitle className={
                alert.type === 'error' 
                  ? 'text-red-800 dark:text-red-200' 
                  : alert.type === 'warning'
                  ? 'text-orange-800 dark:text-orange-200'
                  : 'text-blue-800 dark:text-blue-200'
              }>
                {alert.title}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p className={
                  alert.type === 'error' 
                    ? 'text-red-700 dark:text-red-300' 
                    : alert.type === 'warning'
                    ? 'text-orange-700 dark:text-orange-300'
                    : 'text-blue-700 dark:text-blue-300'
                }>
                  {alert.description}
                </p>
                {alert.id === 'orphaned-records' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/50"
                    onClick={() => navigate('/orphaned-records')}
                  >
                    <AlertTriangle className="h-3 w-3 mr-2" />
                    View Orphaned Records
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ))
        )}
      </div>
    </WidgetBase>
  )
}

export const systemAlertsDefinition: WidgetDefinition = {
  id: 'system-alerts',
  name: 'System Alerts',
  description: 'Important system alerts and warnings',
  category: 'system',
  icon: AlertTriangle,
  defaultSize: createResponsiveSizes({ w: 20, h: 4 }),
  minSize: createResponsiveSizes({ w: 8, h: 3 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 24, h: 10 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}