/**
 * Modern DNS Health Widget
 * Shows DNS provider status and record information
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, AlertTriangle, CheckCircle } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface DNSHealth {
  totalRecords: number
  orphanedRecords: number
  providers: Array<{
    name: string
    status: 'connected' | 'disconnected' | 'error'
    lastSync?: string
  }>
  lastCheck: string
}

function useDNSHealth() {
  return useQuery({
    queryKey: ['dns-health'],
    queryFn: async (): Promise<DNSHealth> => {
      // Mock data - replace with actual API calls
      return {
        totalRecords: 12,
        orphanedRecords: 2,
        providers: [
          { name: 'Cloudflare', status: 'connected', lastSync: new Date().toISOString() },
          { name: 'DigitalOcean', status: 'disconnected' }
        ],
        lastCheck: new Date().toISOString()
      }
    },
    refetchInterval: 60000, // Refresh every minute
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
      case 'connected': return <CheckCircle className="h-3 w-3" />
      case 'error': return <AlertTriangle className="h-3 w-3" />
      default: return <div className="h-3 w-3 rounded-full bg-gray-400" />
    }
  }

  return (
    <WidgetBase
      {...props}
      title="DNS Health"
      icon={Globe}
      description="DNS provider status and record health"
      isLoading={isLoading}
      error={error?.message}
    >
      <div className="space-y-4">
        {/* Record Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <div className="text-xl font-bold text-blue-600">{health?.totalRecords || 0}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Records</div>
          </div>
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
            <div className="text-xl font-bold text-orange-600">{health?.orphanedRecords || 0}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Orphaned</div>
          </div>
        </div>

        {/* Provider Status */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Providers</h4>
          {health?.providers.map((provider) => (
            <div key={provider.name} className="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium">{provider.name}</span>
              <Badge variant="outline" className={getStatusColor(provider.status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(provider.status)}
                  {provider.status}
                </span>
              </Badge>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => navigate('/dns-records')}
          >
            View Records
          </Button>
          {(health?.orphanedRecords || 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => navigate('/orphaned-records')}
            >
              Fix Orphaned
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