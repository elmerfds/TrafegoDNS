import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, Clock } from 'lucide-react'

interface PauseStatus {
  isPaused: boolean
  pausedAt?: string
  pauseReason?: string
  pauseDuration?: number
  timeRemaining?: number
  autoResumeScheduled: boolean
}

export function PauseStatusIndicator() {
  const { data: pauseStatus } = useQuery<{ success: boolean; data: PauseStatus }>({
    queryKey: ['pause-status'],
    queryFn: async () => {
      const response = await api.get('/system/pause-status')
      return response.data
    },
    refetchInterval: 5000, // Check every 5 seconds
  })

  const status = pauseStatus?.data

  if (!status?.isPaused) {
    return null // Don't show anything when system is active
  }

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  return (
    <Badge 
      variant="destructive" 
      className="flex items-center gap-1 text-xs"
    >
      <Pause className="h-3 w-3" />
      <span>System Paused</span>
      {status.autoResumeScheduled && status.timeRemaining !== null && (
        <>
          <Clock className="h-3 w-3 ml-1" />
          <span>{status.timeRemaining !== null ? formatTimeRemaining(status.timeRemaining) : '0s'}</span>
        </>
      )}
    </Badge>
  )
}

export default PauseStatusIndicator