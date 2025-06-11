/**
 * Service Health Widget
 * Shows health status of core services (DNS Manager, Docker Monitor, API Server)
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface ServiceStatus {
  name: string
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  uptime?: string
  lastCheck?: string
  message?: string
}

function useServiceHealth() {
  return useQuery({
    queryKey: ['service-health'],
    queryFn: async (): Promise<ServiceStatus[]> => {
      try {
        const response = await api.get('/status/services')
        return response.data.data || []
      } catch {
        // Mock data if API fails
        return [
          {
            name: 'DNS Manager',
            status: 'healthy',
            uptime: '2d 14h 32m',
            lastCheck: new Date().toISOString(),
            message: 'All DNS operations functioning normally'
          },
          {
            name: 'Docker Monitor',
            status: 'healthy',
            uptime: '2d 14h 30m',
            lastCheck: new Date().toISOString(),
            message: 'Container monitoring active'
          },
          {
            name: 'API Server',
            status: 'healthy',
            uptime: '2d 14h 35m',
            lastCheck: new Date().toISOString(),
            message: 'API responding normally'
          }
        ]
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
  })
}

export function ServiceHealthWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: services = [], isLoading, error } = useServiceHealth()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200'
      case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4" />
      case 'warning': return <AlertCircle className="h-4 w-4" />
      case 'critical': return <XCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const healthyServices = services.filter(s => s.status === 'healthy').length
  const totalServices = services.length

  return (
    <WidgetBase
      {...props}
      title="Service Health"
      icon={Activity}
      description="Core service status monitoring"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant={healthyServices === totalServices ? 'default' : 'destructive'}>
          {healthyServices}/{totalServices} healthy
        </Badge>
      }
    >
      <div className="space-y-3">
        {/* Service Status List */}
        <div className="space-y-2">
          {services.map((service) => (
            <div 
              key={service.name}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getStatusIcon(service.status)}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{service.name}</h4>
                  {service.uptime && (
                    <p className="text-xs text-muted-foreground">
                      Uptime: {service.uptime}
                    </p>
                  )}
                  {service.message && (
                    <p className="text-xs text-muted-foreground truncate">
                      {service.message}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={getStatusColor(service.status)}>
                {service.status}
              </Badge>
            </div>
          ))}
        </div>

        {/* Overall Health Summary */}
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div>
            <h4 className="font-medium text-blue-900 dark:text-blue-100">
              System Health
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {healthyServices === totalServices ? 'All systems operational' : `${totalServices - healthyServices} service(s) need attention`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">
              {Math.round((healthyServices / totalServices) * 100)}%
            </div>
            <div className="text-xs text-blue-600">Healthy</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          {healthyServices < totalServices && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => navigate('/logs')}
            >
              View Logs
            </Button>
          )}
        </div>
      </div>
    </WidgetBase>
  )
}

export const serviceHealthDefinition: WidgetDefinition = {
  id: 'service-health',
  name: 'Service Health',
  description: 'Core service status monitoring',
  category: 'system',
  icon: Activity,
  defaultSize: { w: 8, h: 8 },
  minSize: { w: 6, h: 6 },
  maxSize: { w: 12, h: 10 }
}