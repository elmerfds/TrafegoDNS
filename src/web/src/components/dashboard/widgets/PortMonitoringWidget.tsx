/**
 * Modern Port Monitoring Widget
 * Shows port statistics and monitoring status
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Network, Activity, Lock, AlertTriangle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortMonitoringData {
  statistics: {
    totalMonitoredPorts: number
    systemPortsInUse: number
    availablePortsInRange: number
    alertCount: number
  }
  reservations: number
  monitoring_active: boolean
}

function usePortMonitoringData() {
  return useQuery({
    queryKey: ['port-monitoring'],
    queryFn: async (): Promise<PortMonitoringData> => {
      let data: PortMonitoringData = {
        statistics: {
          totalMonitoredPorts: 0,
          systemPortsInUse: 0,
          availablePortsInRange: 0,
          alertCount: 0
        },
        reservations: 0,
        monitoring_active: false
      }

      // Try to get port statistics
      try {
        const statsRes = await api.get('/ports/statistics')
        if (statsRes.data.data) {
          data.statistics = {
            totalMonitoredPorts: statsRes.data.data.totalMonitoredPorts || 0,
            systemPortsInUse: statsRes.data.data.systemPortsInUse || 0,
            availablePortsInRange: statsRes.data.data.availablePortsInRange || 0,
            alertCount: statsRes.data.data.alertCount || 0
          }
          data.monitoring_active = true
        }
      } catch (error) {
        console.warn('Port statistics not available:', error)
      }

      // Try to get reservations count
      try {
        const reservationsRes = await api.get('/ports/reservations')
        if (reservationsRes.data.data) {
          data.reservations = Array.isArray(reservationsRes.data.data) ? reservationsRes.data.data.length : 0
        }
      } catch (error) {
        console.warn('Port reservations not available:', error)
      }

      // Try to get alerts count if statistics didn't work
      if (!data.monitoring_active) {
        try {
          const alertsRes = await api.get('/ports/alerts')
          if (alertsRes.data.data) {
            data.statistics.alertCount = Array.isArray(alertsRes.data.data) ? alertsRes.data.data.length : 0
          }
        } catch (error) {
          console.warn('Port alerts not available:', error)
        }
      }

      return data
    },
    refetchInterval: 30000,
    retry: 2,
  })
}

export function PortMonitoringWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: portData, isLoading, error } = usePortMonitoringData()
  const { displayMode, currentBreakpoint } = props
  const isMobile = currentBreakpoint === 'xs' || currentBreakpoint === 'xxs'

  // Calculate metrics
  const totalPorts = portData?.statistics.totalMonitoredPorts || 0
  const usedPorts = portData?.statistics.systemPortsInUse || 0
  const reservedPorts = portData?.reservations || 0
  const availablePorts = portData?.statistics.availablePortsInRange || 0
  const alertCount = portData?.statistics.alertCount || 0
  
  const usagePercentage = totalPorts > 0 ? (usedPorts / totalPorts) * 100 : 0

  const metrics = [
    {
      name: 'Total Monitored',
      value: totalPorts,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30'
    },
    {
      name: 'In Use',
      value: usedPorts,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-950/30'
    },
    {
      name: 'Reserved',
      value: reservedPorts,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30'
    },
    {
      name: 'Available',
      value: availablePorts,
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-950/30'
    }
  ]

  const actions = (
    <Badge variant={portData?.monitoring_active ? 'default' : 'secondary'}>
      {portData?.monitoring_active ? 'Active' : 'Inactive'}
    </Badge>
  )

  return (
    <WidgetBase
      {...props}
      title="Port Monitoring"
      icon={Network}
      description="Port usage statistics and monitoring"
      isLoading={isLoading}
      actions={actions}
      widgetDefinition={props.widgetDefinition}
    >
      <div className="space-y-4">
        {/* Usage Overview */}
        <div className="space-y-2">
          <div className={cn(
            "flex justify-between",
            isMobile ? "text-base" : "text-sm"
          )}>
            <span>Port Usage</span>
            <span>{usagePercentage.toFixed(1)}%</span>
          </div>
          <Progress value={usagePercentage} className={cn(isMobile ? "h-3" : "h-2")} />
          <div className={cn(
            "text-muted-foreground",
            isMobile ? "text-sm" : "text-xs"
          )}>
            {usedPorts} of {totalPorts} ports in use
          </div>
        </div>

        {/* Metrics Grid */}
        <div className={cn(
          "grid gap-3",
          isMobile ? "grid-cols-2" : "grid-cols-2"
        )}>
          {metrics.map((metric) => (
            <div
              key={metric.name}
              className={cn(
                `${metric.bgColor} rounded-lg text-center transition-all hover:scale-105`,
                isMobile ? "p-4" : "p-3"
              )}
            >
              <div className={cn(
                `font-bold ${metric.color}`,
                isMobile ? "text-xl" : "text-lg"
              )}>
                {metric.value}
              </div>
              <div className={cn(
                "text-gray-600 dark:text-gray-400",
                isMobile ? "text-sm" : "text-xs"
              )}>
                {metric.name}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Status */}
        {alertCount > 0 && (
          <div className={cn(
            "flex items-center gap-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800",
            isMobile ? "p-3" : "p-2"
          )}>
            <AlertTriangle className={cn("text-yellow-600", isMobile ? "h-5 w-5" : "h-4 w-4")} />
            <span className={cn(
              "text-yellow-800 dark:text-yellow-200",
              isMobile ? "text-base" : "text-sm"
            )}>
              {alertCount} alerts detected
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(
              "flex-1",
              isMobile && "min-h-[44px]"
            )}
            onClick={() => navigate('/port-monitoring')}
          >
            <Activity className={cn("mr-1", isMobile ? "h-4 w-4" : "h-3 w-3")} />
            Details
          </Button>
          <Button
            variant="outline"
            size={isMobile ? "default" : "sm"}
            className={cn(
              "flex-1",
              isMobile && "min-h-[44px]"
            )}
            onClick={() => navigate('/port-management')}
          >
            <Lock className={cn("mr-1", isMobile ? "h-4 w-4" : "h-3 w-3")} />
            Manage
          </Button>
        </div>

        {/* Last Update */}
        {portData?.monitoring_active && (
          <div className={cn(
            "text-muted-foreground text-center",
            isMobile ? "text-sm" : "text-xs"
          )}>
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        )}
      </div>
    </WidgetBase>
  )
}

export const portMonitoringDefinition: WidgetDefinition = {
  id: 'port-monitoring',
  name: 'Port Monitoring',
  description: 'Port usage statistics and monitoring status',
  category: 'ports',
  icon: Network,
  defaultSize: createResponsiveSizes({ w: 12, h: 6 }),
  minSize: createResponsiveSizes({ w: 8, h: 5 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 16, h: 8 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}