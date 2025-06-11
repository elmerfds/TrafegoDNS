/**
 * Port Reservations Widget
 * Active port reservations management with quick reserve/release functionality
 */

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Plus, X, Clock, User, Server } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortReservation {
  id: string
  port: number
  service_name: string
  reserved_by: string
  server?: string
  created_at: string
  expires_at?: string
  status: 'active' | 'expired' | 'released'
}

function usePortReservations() {
  return useQuery({
    queryKey: ['port-reservations'],
    queryFn: async (): Promise<PortReservation[]> => {
      try {
        const response = await api.get('/ports/reservations')
        return response.data.data || []
      } catch {
        // Mock data if API fails
        return [
          {
            id: '1',
            port: 3000,
            service_name: 'React Dev Server',
            reserved_by: 'docker-compose',
            server: 'web-01',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            status: 'active'
          },
          {
            id: '2',
            port: 5432,
            service_name: 'PostgreSQL Database',
            reserved_by: 'docker-compose',
            server: 'db-01',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            status: 'active'
          },
          {
            id: '3',
            port: 6379,
            service_name: 'Redis Cache',
            reserved_by: 'kubernetes',
            server: 'cache-01',
            created_at: new Date(Date.now() - 1800000).toISOString(),
            expires_at: new Date(Date.now() + 1800000).toISOString(),
            status: 'active'
          }
        ]
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
  })
}

export function PortReservationsWidget(props: WidgetProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [quickReservePort, setQuickReservePort] = useState('')
  const [quickReserveService, setQuickReserveService] = useState('')
  const { data: reservations = [], isLoading, error } = usePortReservations()
  const { displayMode = 'normal', currentBreakpoint = 'lg' } = props
  
  // Calculate how many items to show based on widget size
  const getMaxItems = () => {
    if (displayMode === 'compact') return 3
    if (currentBreakpoint === 'lg') return 10  // More items on larger screens
    if (currentBreakpoint === 'md') return 6
    return 4
  }

  const reservePortMutation = useMutation({
    mutationFn: async ({ port, serviceName }: { port: number, serviceName: string }) => {
      const response = await api.post('/ports/reserve', {
        port,
        service_name: serviceName,
        duration: 3600 // 1 hour
      })
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Port Reserved',
        description: `Port ${quickReservePort} reserved successfully`
      })
      queryClient.invalidateQueries({ queryKey: ['port-reservations'] })
      setQuickReservePort('')
      setQuickReserveService('')
    },
    onError: () => {
      toast({
        title: 'Reservation Failed',
        description: 'Failed to reserve port',
        variant: 'destructive'
      })
    }
  })

  const releasePortMutation = useMutation({
    mutationFn: async (reservationId: string) => {
      const response = await api.delete(`/ports/reservations/${reservationId}`)
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Port Released',
        description: 'Port reservation released successfully'
      })
      queryClient.invalidateQueries({ queryKey: ['port-reservations'] })
    },
    onError: () => {
      toast({
        title: 'Release Failed',
        description: 'Failed to release port reservation',
        variant: 'destructive'
      })
    }
  })

  const quickReserve = () => {
    if (!quickReservePort || !quickReserveService) return
    
    const port = parseInt(quickReservePort)
    if (isNaN(port) || port < 1 || port > 65535) {
      toast({
        title: 'Invalid Port',
        description: 'Please enter a valid port number (1-65535)',
        variant: 'destructive'
      })
      return
    }

    reservePortMutation.mutate({ port, serviceName: quickReserveService })
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`
    }
  }

  const formatTimeUntil = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((date.getTime() - now.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 0) return 'Expired'
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m left`
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h left`
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d left`
    }
  }

  const activeReservations = reservations.filter(r => r.status === 'active')

  return (
    <WidgetBase
      {...props}
      title="Port Reservations"
      icon={Shield}
      description="Active port reservations management"
      isLoading={isLoading}
      error={error?.message}
      widgetDefinition={props.widgetDefinition}
      actions={
        <Badge variant="default">
          {activeReservations.length} active
        </Badge>
      }
    >
      <div className="flex flex-col h-full">
        {/* Quick Reserve */}
        <div className="space-y-2 mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Reserve</h4>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Port"
              value={quickReservePort}
              onChange={(e) => setQuickReservePort(e.target.value)}
              className="w-20"
              min="1"
              max="65535"
            />
            <Input
              placeholder="Service name"
              value={quickReserveService}
              onChange={(e) => setQuickReserveService(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={quickReserve}
              disabled={!quickReservePort || !quickReserveService || reservePortMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active Reservations */}
        {activeReservations.length > 0 ? (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0 mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Reservations</h4>
            <div className="space-y-2">
              {activeReservations.slice(0, getMaxItems()).map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-sm">
                        Port {reservation.port}
                      </span>
                      {reservation.expires_at && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTimeUntil(reservation.expires_at)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">
                      {reservation.service_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{reservation.reserved_by}</span>
                      {reservation.server && (
                        <>
                          <Server className="h-3 w-3" />
                          <span>{reservation.server}</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reserved {formatTimeAgo(reservation.created_at)}
                    </p>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => releasePortMutation.mutate(reservation.id)}
                    disabled={releasePortMutation.isPending}
                    className="ml-2"
                  >
                    <X className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Shield className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No active reservations</p>
          </div>
        )}

        {/* Summary Stats - only in detailed mode */}
        {reservations.length > 0 && displayMode === 'detailed' && currentBreakpoint === 'lg' && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700 mb-3">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {activeReservations.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Active
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">
                {reservations.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                Total
              </div>
            </div>
          </div>
        )}

        {/* Quick Suggestions */}
        <div className="space-y-2 mt-auto">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Reserve</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { port: 3000, service: 'Dev Server' },
              { port: 8080, service: 'HTTP Proxy' },
              { port: 9000, service: 'Monitoring' },
              { port: 5000, service: 'API Server' }
            ].map(({ port, service }) => (
              <Button
                key={port}
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuickReservePort(port.toString())
                  setQuickReserveService(service)
                }}
                className="text-xs"
              >
                {port} - {service}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </WidgetBase>
  )
}

export const portReservationsDefinition: WidgetDefinition = {
  id: 'port-reservations',
  name: 'Port Reservations',
  description: 'Active port reservations management',
  category: 'ports',
  icon: Shield,
  defaultSize: createResponsiveSizes({ w: 8, h: 10 }),
  minSize: createResponsiveSizes({ w: 6, h: 8 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 0.7 }),
  maxSize: createResponsiveSizes({ w: 12, h: 12 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}