/**
 * DNS Health Widget
 * Real-time DNS provider status and record health monitoring
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, AlertTriangle, CheckCircle, Database, Trash2 } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface DNSHealth {
  records: {
    total: number
    managed: number
    orphaned: number
    by_type: Record<string, number>
  }
  providers: Array<{
    name: string
    type: string
    status: 'connected' | 'disconnected' | 'error'
    record_count: number
    last_sync?: string
    response_time?: number
  }>
  zones: {
    total: number
    active: number
  }
  health_score: number
}

function useDNSHealth() {
  return useQuery({
    queryKey: ['dns-health'],
    queryFn: async (): Promise<DNSHealth> => {
      // Get main status data first (this is guaranteed to work)
      const statusRes = await api.get('/status')
      const statusData = statusRes.data.data
      
      if (!statusData) {
        throw new Error('No status data available')
      }
      
      // Get hostname statistics (managed/preserved counts)
      let hostnames = {
        total: 0,
        managed: 0,
        preserved: 0
      }
      
      try {
        const hostnamesRes = await api.get('/hostnames?limit=1000') // Get all hostnames
        if (hostnamesRes.data.data?.hostnames) {
          const allHostnames = hostnamesRes.data.data.hostnames
          hostnames.total = allHostnames.length
          hostnames.managed = allHostnames.filter((h: any) => h.type === 'managed').length
          hostnames.preserved = allHostnames.filter((h: any) => h.type === 'preserved').length
        }
      } catch (error) {
        console.warn('Hostnames stats not available, using status data')
        // Fallback to status data
        if (statusData.statistics) {
          hostnames = {
            total: statusData.statistics.totalRecords || 0,
            managed: statusData.statistics.totalRecords || 0,
            preserved: 0
          }
        }
      }
      
      // Get DNS records for orphaned count
      let orphanedCount = 0
      try {
        const recordsRes = await api.get('/dns/stats')
        if (recordsRes.data.data) {
          orphanedCount = recordsRes.data.data.orphaned || 0
        }
      } catch (error) {
        console.warn('DNS stats not available for orphaned count')
      }
      
      // Get real provider data
      let providers = []
      
      try {
        const providersRes = await api.get('/config/providers/status')
        if (providersRes.data.data) {
          providers = providersRes.data.data.map((provider: any) => ({
            ...provider,
            // Override the hardcoded 0 record_count with actual hostnames count
            record_count: hostnames.total || 0
          }))
        }
      } catch (error) {
        console.warn('Provider status not available, using status data')
        // Fallback to status data
        const dnsProvider = statusData.services?.dnsProvider
        if (dnsProvider) {
          providers = [{
            name: dnsProvider.type.charAt(0).toUpperCase() + dnsProvider.type.slice(1),
            type: dnsProvider.type,
            status: dnsProvider.status,
            record_count: hostnames.total,
            last_sync: new Date().toISOString(),
            response_time: undefined
          }]
        }
      }
      
      // Get zones data (optional)
      let zones = { total: 0, active: 0 }
      
      try {
        const zonesRes = await api.get('/dns/zones/stats')
        if (zonesRes.data.data) {
          zones = zonesRes.data.data
        }
      } catch (error) {
        console.warn('DNS zones stats not available')
        // Use minimal zone data
        zones = {
          total: providers.length > 0 ? 1 : 0,
          active: providers.filter((p: any) => p.status === 'connected' || p.status === 'active').length > 0 ? 1 : 0
        }
      }
      
      // Calculate real health score
      const connectedProviders = providers.filter((p: any) => p.status === 'connected' || p.status === 'active').length
      const totalProviders = providers.length || 1
      const orphanedRatio = orphanedCount / (hostnames.total || 1)
      const healthScore = Math.round(
        ((connectedProviders / totalProviders) * 0.7 + (1 - orphanedRatio) * 0.3) * 100
      )
      
      return {
        records: {
          total: hostnames.total,
          managed: hostnames.managed,
          orphaned: orphanedCount,
          by_type: {}
        },
        providers,
        zones,
        health_score: healthScore
      }
    },
    refetchInterval: 60000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

export function DNSHealthWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { data: health, isLoading, error } = useDNSHealth()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'disconnected': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-4 w-4" />
      case 'error': return <AlertTriangle className="h-4 w-4" />
      default: return <div className="h-4 w-4 rounded-full bg-gray-400" />
    }
  }

  const getHealthBadge = (score: number) => {
    if (score >= 90) return { variant: 'default' as const, text: 'Excellent' }
    if (score >= 70) return { variant: 'secondary' as const, text: 'Good' }
    if (score >= 50) return { variant: 'secondary' as const, text: 'Fair' }
    return { variant: 'destructive' as const, text: 'Poor' }
  }

  const healthBadge = getHealthBadge(health?.health_score || 0)
  const connectedProviders = health?.providers?.filter(p => p.status === 'connected').length || 0
  const totalProviders = health?.providers?.length || 0

  return (
    <WidgetBase
      {...props}
      title="DNS Health"
      icon={Globe}
      description="Real-time DNS monitoring"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant={healthBadge.variant}>
          {health?.health_score || 0}% {healthBadge.text}
        </Badge>
      }
    >
      <div className="space-y-4">
        {/* DNS Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-900 dark:text-blue-100">Hostnames</span>
            </div>
            <div className="text-lg font-bold text-blue-900 dark:text-blue-100">
              {health?.records.total || 0}
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300">
              {health?.records.managed || 0} managed
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-3 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-purple-900 dark:text-purple-100">Providers</span>
            </div>
            <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
              {connectedProviders}/{totalProviders}
            </div>
            <div className="text-xs text-purple-700 dark:text-purple-300">
              connected
            </div>
          </div>
        </div>

        {/* Provider Status List */}
        {health?.providers && health.providers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Providers</h4>
            <div className="space-y-2">
              {health.providers.map((provider) => (
                <div key={provider.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(provider.status)}
                    <div>
                      <div className="text-sm font-medium">{provider.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {provider.record_count} hostnames
                        {provider.response_time && ` • ${provider.response_time}ms`}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={getStatusColor(provider.status)}>
                    {provider.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orphaned Records Alert */}
        {(health?.records.orphaned || 0) > 0 && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <Trash2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {health?.records.orphaned} orphaned records need attention
              </span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/dns-records')}
          >
            Manage DNS
          </Button>
          {(health?.records.orphaned || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => navigate('/orphaned-records')}
            >
              Clean Up
            </Button>
          )}
        </div>
      </div>
    </WidgetBase>
  )
}

export const dnsHealthDefinition: WidgetDefinition = {
  id: 'dns-health',
  name: 'DNS Health',
  description: 'DNS provider status and record health',
  category: 'dns',
  icon: Globe,
  defaultSize: { w: 4, h: 6 },
  minSize: { w: 3, h: 4 },
  maxSize: { w: 6, h: 8 }
}