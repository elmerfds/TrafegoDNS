/**
 * System Alerts Widget
 * @deprecated This widget has been replaced with the SystemStatusIndicator in the header
 * @see SystemStatusIndicator component in /components/system-status/
 * 
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
        // Try to get current orphaned records as alerts (not history)
        const response = await api.get('/dns/orphaned')
        const orphaned = response.data.data
        
        // Debug log to help identify the issue
        console.debug('SystemAlerts: Orphaned records API response:', orphaned)
        
        // Only show alerts for CURRENT orphaned records that need attention
        // These are records that are still marked as orphaned and exist at the provider
        if (orphaned && orphaned.records && orphaned.records.length > 0) {
          return [{
            id: 'orphaned-records',
            type: 'warning',
            title: 'Orphaned DNS Records',
            description: `${orphaned.records.length} orphaned DNS records need attention`,
            timestamp: new Date().toISOString()
          }]
        }
        return []
      } catch (error) {
        console.error('SystemAlerts: Failed to fetch orphaned records:', error)
        // Fallback to empty array if API fails
        return []
      }
    },
    refetchInterval: 60000, // Check every minute
  })
}

export function SystemAlertsWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: alerts = [], isLoading, error } = useSystemAlerts()
  const { displayMode = 'normal', currentBreakpoint = 'lg' } = props

  // Determine max alerts to show based on size
  const getMaxAlerts = () => {
    if (displayMode === 'compact') return 1
    if (currentBreakpoint === 'xs' || currentBreakpoint === 'sm') return 2
    return 3
  }

  const maxAlerts = getMaxAlerts()
  const visibleAlerts = alerts.slice(0, maxAlerts)
  const hasMoreAlerts = alerts.length > maxAlerts

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
      <div className="flex flex-col h-full">
        {alerts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className={`${displayMode === 'compact' ? 'h-4 w-4' : 'h-5 w-5'}`} />
              <span className={`font-medium ${displayMode === 'compact' ? 'text-sm' : 'text-base'}`}>
                All Clear
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-2 min-h-0 overflow-hidden">
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`
                    flex items-start gap-2 p-2 rounded-md border
                    ${alert.type === 'error' 
                      ? 'border-red-200 bg-red-50/50 dark:bg-red-950/20' 
                      : alert.type === 'warning'
                      ? 'border-orange-200 bg-orange-50/50 dark:bg-orange-950/20'
                      : 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20'
                    }
                  `}
                >
                  <AlertTriangle className={`
                    ${displayMode === 'compact' ? 'h-3 w-3 mt-0.5' : 'h-4 w-4 mt-0.5'} flex-shrink-0
                    ${alert.type === 'error' 
                      ? 'text-red-600' 
                      : alert.type === 'warning'
                      ? 'text-orange-600'
                      : 'text-blue-600'
                    }
                  `} />
                  
                  <div className="flex-1 min-w-0">
                    <div className={`
                      font-medium truncate
                      ${displayMode === 'compact' ? 'text-xs' : 'text-sm'}
                      ${alert.type === 'error' 
                        ? 'text-red-800 dark:text-red-200' 
                        : alert.type === 'warning'
                        ? 'text-orange-800 dark:text-orange-200'
                        : 'text-blue-800 dark:text-blue-200'
                      }
                    `}>
                      {alert.title}
                    </div>
                    
                    {displayMode !== 'compact' && (
                      <div className={`
                        text-xs truncate mt-1
                        ${alert.type === 'error' 
                          ? 'text-red-700 dark:text-red-300' 
                          : alert.type === 'warning'
                          ? 'text-orange-700 dark:text-orange-300'
                          : 'text-blue-700 dark:text-blue-300'
                        }
                      `}>
                        {alert.description}
                      </div>
                    )}
                  </div>
                  
                  {alert.id === 'orphaned-records' && (
                    <Button 
                      variant="ghost" 
                      size={displayMode === 'compact' ? 'sm' : 'sm'}
                      className="h-auto p-1 flex-shrink-0"
                      onClick={() => navigate('/orphaned-records')}
                      title="View Orphaned Records"
                    >
                      <AlertTriangle className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            {hasMoreAlerts && (
              <div className="pt-2 mt-auto">
                <div className="text-xs text-muted-foreground text-center">
                  +{alerts.length - maxAlerts} more alert{alerts.length - maxAlerts !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </>
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
  defaultSize: createResponsiveSizes({ w: 12, h: 3 }), // Much more compact default
  minSize: createResponsiveSizes({ w: 6, h: 2 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 24, h: 8 }), // Reduced max height
  responsiveDisplay: {
    lg: 'normal',
    md: 'normal', 
    sm: 'compact',
    xs: 'compact'
  }
}