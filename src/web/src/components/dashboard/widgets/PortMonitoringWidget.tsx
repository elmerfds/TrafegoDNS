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
    >
      <div className="space-y-4">
        {/* Usage Overview */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Port Usage</span>
            <span>{usagePercentage.toFixed(1)}%</span>
          </div>
          <Progress value={usagePercentage} className="h-2" />
          <div className="text-xs text-muted-foreground">
            {usedPorts} of {totalPorts} ports in use
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.name}
              className={`${metric.bgColor} rounded-lg p-3 text-center transition-all hover:scale-105`}
            >
              <div className={`text-lg font-bold ${metric.color}`}>
                {metric.value}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {metric.name}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Status */}
        {alertCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              {alertCount} alerts detected
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/port-monitoring')}
          >
            <Activity className="h-3 w-3 mr-1" />
            Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/port-management')}
          >
            <Lock className="h-3 w-3 mr-1" />
            Manage
          </Button>
        </div>

        {/* Last Update */}
        {portData?.monitoring_active && (
          <div className="text-xs text-muted-foreground text-center">
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
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 4, h: 5 },
  maxSize: { w: 8, h: 8 }
}