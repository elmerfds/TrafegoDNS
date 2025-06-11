/**
 * Status Overview Widget
 * Modern system status overview with real API data
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Globe, Container, Network, AlertTriangle, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface SystemStatus {
  mode: 'traefik' | 'direct'
  version: string
  uptime: number
  healthy: boolean
}

interface DNSStatus {
  providers: {
    total: number
    connected: number
    names: string[]
  }
  records: {
    total: number
    managed: number
  }
}

interface ContainerStatus {
  total: number
  running: number
  stopped: number
  monitoring: boolean
}

function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: async (): Promise<SystemStatus> => {
      try {
        const response = await api.get('/status')
        const data = response.data.data
        return {
          mode: data.operationMode || data.mode || 'unknown',
          version: data.version || '1.0.0',
          uptime: data.uptime || 0,
          healthy: data.healthy ?? true
        }
      } catch (error) {
        // Fallback data if API fails
        return {
          mode: 'direct',
          version: '1.0.0',
          uptime: 0,
          healthy: false
        }
      }
    },
    refetchInterval: 30000,
  })
}

function useDNSStatus() {
  return useQuery({
    queryKey: ['dns-status'],
    queryFn: async (): Promise<DNSStatus> => {
      try {
        const statusRes = await api.get('/status')
        const statusData = statusRes.data.data
        
        // Extract DNS info from the main status endpoint
        const provider = statusData.services?.dnsProvider
        const statistics = statusData.statistics
        const isConnected = provider?.status === 'connected' || provider?.status === 'active'
        
        return {
          providers: {
            total: provider ? 1 : 0,
            connected: isConnected ? 1 : 0,
            names: provider ? [provider.type] : []
          },
          records: {
            // Only show records if provider is connected
            total: isConnected ? (statistics?.totalRecords || 0) : 0,
            managed: isConnected ? (statistics?.totalRecords || 0) : 0
          }
        }
      } catch (error) {
        // Fallback data if API fails
        return {
          providers: {
            total: 1,
            connected: 0,
            names: ['Unknown']
          },
          records: {
            total: 0,
            managed: 0
          }
        }
      }
    },
    refetchInterval: 30000,
  })
}

function useContainerStatus() {
  return useQuery({
    queryKey: ['container-status'], 
    queryFn: async (): Promise<ContainerStatus> => {
      try {
        const statusRes = await api.get('/status')
        const statusData = statusRes.data.data
        const statistics = statusData.statistics
        
        // Use container info from the main status endpoint
        const totalContainers = statistics?.totalContainers || 0
        const dockerStatus = statusData.services?.docker
        
        return {
          total: totalContainers,
          running: totalContainers, // Assume running if they're being tracked
          stopped: 0,
          monitoring: dockerStatus?.connected ?? true
        }
      } catch (error) {
        // Fallback data if API fails
        return {
          total: 0,
          running: 0,
          stopped: 0,
          monitoring: false
        }
      }
    },
    refetchInterval: 30000,
  })
}

export function StatusOverviewWidget(props: WidgetProps) {
  const { displayMode = 'normal', currentBreakpoint = 'lg' } = props
  const { data: systemStatus, isLoading: systemLoading, error: systemError } = useSystemStatus()
  const { data: dnsStatus, isLoading: dnsLoading } = useDNSStatus() 
  const { data: containerStatus, isLoading: containerLoading } = useContainerStatus()

  const isLoading = systemLoading || dnsLoading || containerLoading
  const error = systemError?.message
  
  // Responsive layout configuration
  const isCompact = displayMode === 'compact' || currentBreakpoint === 'xs'
  const showDetails = displayMode === 'detailed' && currentBreakpoint === 'lg'

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`
    return `${Math.floor(seconds / 60)}m`
  }

  const getOverallHealth = () => {
    const systemHealthy = systemStatus?.healthy ?? false
    const dnsHealthy = (dnsStatus?.providers.connected ?? 0) > 0
    const containersHealthy = (containerStatus?.running ?? 0) > 0
    
    if (systemHealthy && dnsHealthy && containersHealthy) return 'healthy'
    if (!systemHealthy) return 'error'
    return 'warning'
  }

  const overallHealth = getOverallHealth()

  return (
    <WidgetBase
      {...props}
      title="System Status"
      icon={Activity}
      description="Real-time system overview"
      isLoading={isLoading}
      error={error}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant={overallHealth === 'healthy' ? 'default' : overallHealth === 'warning' ? 'secondary' : 'destructive'}>
          {overallHealth === 'healthy' ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
          {overallHealth}
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* Main Status Grid - Responsive layout */}
        <div className={`grid gap-3 ${
          isCompact 
            ? 'grid-cols-2' 
            : currentBreakpoint === 'sm' 
              ? 'grid-cols-2' 
              : 'grid-cols-4'
        }`}>
          {/* System Health */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-900 dark:text-blue-100">System</span>
            </div>
            <div className={`font-bold text-blue-900 dark:text-blue-100 ${isCompact ? 'text-sm' : 'text-lg'}`}>
              {systemStatus?.mode?.toUpperCase() || 'UNKNOWN'}
            </div>
            {!isCompact && (
              <div className="text-xs text-blue-700 dark:text-blue-300">
                {systemStatus?.uptime ? formatUptime(systemStatus.uptime) : 'Unknown'} uptime
              </div>
            )}
          </div>

          {/* DNS Providers */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium text-green-900 dark:text-green-100">DNS</span>
            </div>
            <div className={`font-bold text-green-900 dark:text-green-100 ${isCompact ? 'text-sm' : 'text-lg'}`}>
              {dnsStatus?.providers.connected || 0}/{dnsStatus?.providers.total || 0}
            </div>
            {!isCompact && (
              <div className="text-xs text-green-700 dark:text-green-300">
                {dnsStatus?.records.total || 0} records • {dnsStatus?.providers.names?.[0] || 'none'}
              </div>
            )}
          </div>

          {/* Containers */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-3 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <Container className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-900 dark:text-purple-100">Containers</span>
            </div>
            <div className={`font-bold text-purple-900 dark:text-purple-100 ${isCompact ? 'text-sm' : 'text-lg'}`}>
              {containerStatus?.running || 0}/{containerStatus?.total || 0}
            </div>
            {!isCompact && (
              <div className="text-xs text-purple-700 dark:text-purple-300">
                running
              </div>
            )}
          </div>

          {/* Monitoring */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl p-3 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium text-orange-900 dark:text-orange-100">Monitoring</span>
            </div>
            <div className={`font-bold text-orange-900 dark:text-orange-100 ${isCompact ? 'text-sm' : 'text-lg'}`}>
              {containerStatus?.monitoring ? 'ON' : 'OFF'}
            </div>
            {!isCompact && (
              <div className="text-xs text-orange-700 dark:text-orange-300">
                port monitor
              </div>
            )}
          </div>
        </div>
      </div>
    </WidgetBase>
  )
}

export const statusOverviewDefinition: WidgetDefinition = {
  id: 'status-overview',
  name: 'System Status',
  description: 'Real-time system overview with health indicators',
  category: 'system',
  icon: Activity,
  defaultSize: createResponsiveSizes({ w: 16, h: 6 }),
  minSize: createResponsiveSizes({ w: 8, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 24, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal', 
    sm: 'compact',
    xs: 'compact'
  }
}