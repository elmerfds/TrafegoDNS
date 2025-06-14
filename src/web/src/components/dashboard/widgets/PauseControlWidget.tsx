/**
 * Pause Control Widget
 * Provides system pause/resume controls in the dashboard
 */

import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Pause, 
  Play, 
  Clock, 
  AlertTriangle, 
  Timer,
  Settings
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PauseStatus {
  isPaused: boolean
  pausedAt?: string
  pauseReason?: string
  pauseDuration?: number
  pausedBy?: string
  timeRemaining?: number | null
  autoResumeScheduled: boolean
}

export function PauseControlWidget(props: WidgetProps) {
  const queryClient = useQueryClient()
  const [selectedDuration, setSelectedDuration] = useState<string>('')
  const { displayMode, currentBreakpoint } = props
  const isMobile = currentBreakpoint === 'xs' || currentBreakpoint === 'xxs'

  // Query pause status
  const { data: pauseStatus, isLoading } = useQuery<{ success: boolean; data: PauseStatus }>({
    queryKey: ['pause-status'],
    queryFn: async () => {
      const response = await api.get('/system/pause-status')
      return response.data
    },
    refetchInterval: 10000, // Check every 10 seconds for widget
    retry: 1, // Fewer retries for widget
  })

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: async ({ reason, duration }: { reason?: string; duration?: number }) => {
      const response = await api.post('/system/pause', { reason, duration })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pause-status'] })
      toast({
        title: 'System Paused',
        description: 'Operations paused successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Pause Failed',
        description: error.response?.data?.error || 'Failed to pause system',
        variant: 'destructive',
      })
    },
  })

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/system/resume')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pause-status'] })
      toast({
        title: 'System Resumed',
        description: 'Operations resumed successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Resume Failed',
        description: error.response?.data?.error || 'Failed to resume system',
        variant: 'destructive',
      })
    },
  })

  // Schedule pause mutation
  const schedulePauseMutation = useMutation({
    mutationFn: async (duration: number) => {
      const response = await api.post('/system/pause-schedule', { duration })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pause-status'] })
      setSelectedDuration('')
      toast({
        title: 'Scheduled Pause Active',
        description: 'Auto-resume scheduled.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Schedule Failed',
        description: error.response?.data?.error || 'Failed to schedule pause',
        variant: 'destructive',
      })
    },
  })

  const handlePause = () => {
    pauseMutation.mutate({ reason: 'manual' })
  }

  const handleResume = () => {
    resumeMutation.mutate()
  }

  const handleSchedulePause = () => {
    if (!selectedDuration) return
    const duration = parseInt(selectedDuration)
    schedulePauseMutation.mutate(duration)
  }

  const formatTimeRemaining = (seconds: number | null | undefined) => {
    if (!seconds || seconds < 60) return `${seconds || 0}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const status = pauseStatus?.data
  const isPaused = status?.isPaused || false

  const actions = (
    <div className="flex items-center gap-2">
      {isPaused ? (
        <>
          <Pause className="h-4 w-4 text-orange-500" />
          <Badge variant="destructive">Paused</Badge>
        </>
      ) : (
        <>
          <Play className="h-4 w-4 text-green-500" />
          <Badge variant="default">Active</Badge>
        </>
      )}
    </div>
  )

  return (
    <WidgetBase
      {...props}
      title="System Control"
      icon={Settings}
      description="Pause/resume operations"
      isLoading={isLoading}
      widgetDefinition={props.widgetDefinition}
      actions={actions}
    >
      <div className="space-y-4">
        {/* Status Info */}
        {isPaused && status?.autoResumeScheduled && status.timeRemaining !== null && (
          <div className="space-y-2">
            <div className={cn(
              "flex justify-between",
              isMobile ? "text-base" : "text-sm"
            )}>
              <span>Auto-resume:</span>
              <span className="font-mono">{formatTimeRemaining(status.timeRemaining)}</span>
            </div>
            <Progress 
              value={status.pauseDuration && status.timeRemaining ? 
                ((status.pauseDuration * 60 - status.timeRemaining) / (status.pauseDuration * 60)) * 100 : 0
              } 
              className={cn(isMobile ? "h-3" : "h-2")}
            />
          </div>
        )}

        {isPaused && status?.pauseReason && (
          <div className={cn(
            "text-muted-foreground",
            isMobile ? "text-base" : "text-sm"
          )}>
            Reason: <span className="capitalize">{status.pauseReason}</span>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-3">
          {isPaused ? (
            <Button 
              onClick={handleResume}
              disabled={resumeMutation.isPending}
              className={cn(
                "w-full",
                isMobile && "min-h-[44px]"
              )}
              size={isMobile ? "default" : "sm"}
            >
              <Play className={cn(isMobile ? "h-4 w-4" : "h-3 w-3", "mr-2")} />
              {resumeMutation.isPending ? 'Resuming...' : 'Resume'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button 
                onClick={handlePause}
                disabled={pauseMutation.isPending}
                variant="destructive"
                className={cn(
                  "w-full",
                  isMobile && "min-h-[44px]"
                )}
                size={isMobile ? "default" : "sm"}
              >
                <Pause className={cn(isMobile ? "h-4 w-4" : "h-3 w-3", "mr-2")} />
                {pauseMutation.isPending ? 'Pausing...' : 'Pause'}
              </Button>

              {/* Quick Schedule */}
              <div className="space-y-2">
                <div className={cn(
                  "font-medium text-muted-foreground",
                  isMobile ? "text-sm" : "text-xs"
                )}>
                  Schedule Pause
                </div>
                <div className="flex gap-2">
                  <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                    <SelectTrigger className={cn(
                      "flex-1",
                      isMobile ? "h-10 text-sm" : "h-8 text-xs"
                    )}>
                      <SelectValue placeholder="Duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15m</SelectItem>
                      <SelectItem value="30">30m</SelectItem>
                      <SelectItem value="60">1h</SelectItem>
                      <SelectItem value="120">2h</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleSchedulePause}
                    disabled={!selectedDuration || schedulePauseMutation.isPending}
                    variant="outline"
                    size={isMobile ? "default" : "sm"}
                    className={cn(
                      "px-2",
                      isMobile && "min-h-[44px] px-3"
                    )}
                  >
                    <Timer className={cn(isMobile ? "h-4 w-4" : "h-3 w-3")} />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Help text */}
        <div className={cn(
          "text-muted-foreground",
          isMobile ? "text-sm" : "text-xs"
        )}>
          Pausing stops DNS processing and monitoring
        </div>
      </div>
    </WidgetBase>
  )
}

export const pauseControlDefinition: WidgetDefinition = {
  id: 'pause-control',
  name: 'System Control',
  description: 'Pause and resume system operations',
  category: 'system',
  icon: Settings,
  defaultSize: createResponsiveSizes({ w: 8, h: 5 }),
  minSize: createResponsiveSizes({ w: 6, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 12, h: 6 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}