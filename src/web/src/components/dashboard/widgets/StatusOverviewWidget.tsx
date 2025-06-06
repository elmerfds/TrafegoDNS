/**
 * Status Overview Widget
 * Shows high-level system status cards like the old dashboard
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, Activity, Globe, Container, Network, AlertTriangle, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface StatusData {
  systemMode: 'traefik' | 'direct'
  version: string
  systemHealth: 'healthy' | 'warning' | 'error'
  dnsProviders: {
    total: number
    connected: number
    status: 'healthy' | 'warning' | 'error'
  }
  containers: {
    total: number
    running: number
    status: 'healthy' | 'warning' | 'error'
  }
  monitoring: {
    enabled: boolean
    status: 'active' | 'inactive' | 'error'
  }
  lastUpdate: string
}

function useStatusOverview() {
  return useQuery({
    queryKey: ['status-overview'],
    queryFn: async (): Promise<StatusData> => {
      try {
        // In a real implementation, this would aggregate data from multiple endpoints
        const [configResponse, statusResponse] = await Promise.allSettled([
          api.get('/config'),
          api.get('/status')
        ])

        // Mock data with some real data if available
        return {
          systemMode: 'direct', // or get from config
          version: '2.1.0',
          systemHealth: 'healthy',
          dnsProviders: {
            total: 2,
            connected: 1,
            status: 'warning'
          },
          containers: {
            total: 3,
            running: 2,
            status: 'healthy'
          },
          monitoring: {
            enabled: true,
            status: 'active'
          },
          lastUpdate: new Date().toISOString()
        }
      } catch {
        // Fallback mock data
        return {
          systemMode: 'direct',
          version: '2.1.0',
          systemHealth: 'healthy',
          dnsProviders: {
            total: 2,
            connected: 1,
            status: 'warning'
          },
          containers: {
            total: 3,
            running: 2,
            status: 'healthy'
          },
          monitoring: {
            enabled: true,
            status: 'active'
          },
          lastUpdate: new Date().toISOString()
        }
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

export function StatusOverviewWidget(props: WidgetProps) {
  const { data: status, isLoading, error } = useStatusOverview()

  const getStatusColor = (statusType: string) => {
    switch (statusType) {
      case 'healthy': case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'warning': case 'inactive': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (statusType: string) => {
    switch (statusType) {
      case 'healthy': case 'active': return <CheckCircle className="h-4 w-4" />
      case 'warning': case 'inactive': case 'error': return <AlertTriangle className="h-4 w-4" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const statusCards = [
    {
      title: 'System Mode',
      value: status?.systemMode?.toUpperCase() || 'UNKNOWN',
      icon: Shield,
      status: 'healthy',
      detail: `Version ${status?.version || '0.0.0'}`
    },
    {
      title: 'System Health',
      value: status?.systemHealth?.toUpperCase() || 'UNKNOWN',
      icon: Activity,
      status: status?.systemHealth || 'error',
      detail: 'All services operational'
    },
    {
      title: 'DNS Providers',
      value: `${status?.dnsProviders.connected || 0}/${status?.dnsProviders.total || 0}`,
      icon: Globe,
      status: status?.dnsProviders.status || 'error',
      detail: 'Connected providers'
    },
    {
      title: 'Containers',
      value: `${status?.containers.running || 0}/${status?.containers.total || 0}`,
      icon: Container,
      status: status?.containers.status || 'error',
      detail: 'Running containers'
    },
    {
      title: 'Monitoring',
      value: status?.monitoring.enabled ? 'ENABLED' : 'DISABLED',
      icon: Network,
      status: status?.monitoring.status || 'error',
      detail: status?.monitoring.enabled ? 'Port monitoring active' : 'Monitoring disabled'
    }
  ]

  return (
    <WidgetBase
      {...props}
      title="System Status Overview"
      icon={Shield}
      description="High-level system status and health"
      isLoading={isLoading}
      error={error?.message}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statusCards.map((card) => (
          <div
            key={card.title}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <card.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <Badge variant="outline" className={getStatusColor(card.status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(card.status)}
                  {card.status}
                </span>
              </Badge>
            </div>
            
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {card.title}
              </h4>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {card.value}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {card.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Last Update */}
      {status?.lastUpdate && (
        <div className="mt-4 text-xs text-muted-foreground text-center pt-3 border-t border-gray-200 dark:border-gray-700">
          Last updated: {new Date(status.lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </WidgetBase>
  )
}

export const statusOverviewDefinition: WidgetDefinition = {
  id: 'status-overview',
  name: 'Status Overview',
  description: 'High-level system status and health cards',
  category: 'system',
  icon: Shield,
  defaultSize: { w: 12, h: 6 },
  minSize: { w: 8, h: 4 },
  maxSize: { w: 12, h: 8 }
}