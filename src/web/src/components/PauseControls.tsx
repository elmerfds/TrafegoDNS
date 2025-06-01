import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Pause, 
  Play, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  Timer,
  Settings
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface PauseStatus {
  isPaused: boolean
  pausedAt?: string
  pauseReason?: string
  pauseDuration?: number
  pausedBy?: string
  timeRemaining?: number
  autoResumeScheduled: boolean
}

export function PauseControls() {
  const queryClient = useQueryClient()
  const [selectedDuration, setSelectedDuration] = useState<string>('')

  // Query pause status
  const { data: pauseStatus, isLoading } = useQuery<{ success: boolean; data: PauseStatus }>({
    queryKey: ['pause-status'],
    queryFn: async () => {
      const response = await api.get('/system/pause-status')
      return response.data
    },
    refetchInterval: 5000, // Check every 5 seconds
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
        description: 'All DNS and monitoring operations have been paused.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Pause Failed',
        description: error.response?.data?.error || 'Failed to pause system operations',
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
        description: 'All DNS and monitoring operations have been resumed.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Resume Failed',
        description: error.response?.data?.error || 'Failed to resume system operations',
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
        description: 'System paused with automatic resume scheduled.',
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

  const formatTimeRemaining = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Control
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const status = pauseStatus?.data

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          System Control
        </CardTitle>
        <CardDescription>
          Pause or resume DNS and monitoring operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Current Status</span>
          <div className="flex items-center gap-2">
            {status?.isPaused ? (
              <>
                <Pause className="h-4 w-4 text-orange-500" />
                <Badge variant="destructive">System Paused</Badge>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 text-green-500" />
                <Badge variant="default">System Active</Badge>
              </>
            )}
          </div>
        </div>

        {/* Pause Details */}
        {status?.isPaused && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Paused at:</span>
                  <span>{status.pausedAt ? formatDateTime(status.pausedAt) : 'Unknown'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Reason:</span>
                  <span className="capitalize">{status.pauseReason || 'Unknown'}</span>
                </div>
                {status.pausedBy && (
                  <div className="flex justify-between text-sm">
                    <span>Paused by:</span>
                    <span>{status.pausedBy}</span>
                  </div>
                )}
                {status.autoResumeScheduled && status.timeRemaining !== null && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-sm">
                      <span>Auto-resume in:</span>
                      <span className="font-mono">{status.timeRemaining !== null ? formatTimeRemaining(status.timeRemaining) : '0s'}</span>
                    </div>
                    <Progress 
                      value={status.pauseDuration && status.timeRemaining !== null ? 
                        ((status.pauseDuration * 60 - status.timeRemaining) / (status.pauseDuration * 60)) * 100 : 0
                      } 
                      className="h-2"
                    />
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Control Buttons */}
        <div className="space-y-3">
          {status?.isPaused ? (
            <Button 
              onClick={handleResume}
              disabled={resumeMutation.isPending}
              className="w-full"
              size="lg"
            >
              <Play className="h-4 w-4 mr-2" />
              {resumeMutation.isPending ? 'Resuming...' : 'Resume Operations'}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button 
                onClick={handlePause}
                disabled={pauseMutation.isPending}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                <Pause className="h-4 w-4 mr-2" />
                {pauseMutation.isPending ? 'Pausing...' : 'Pause Operations'}
              </Button>

              {/* Scheduled Pause */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Timer className="h-4 w-4" />
                  Schedule Pause
                </div>
                <div className="flex gap-2">
                  <Select value={selectedDuration} onValueChange={setSelectedDuration}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes</SelectItem>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                      <SelectItem value="480">8 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleSchedulePause}
                    disabled={!selectedDuration || schedulePauseMutation.isPending}
                    variant="outline"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {schedulePauseMutation.isPending ? 'Scheduling...' : 'Schedule'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              <span>Pausing stops DNS record processing and container monitoring</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              <span>Existing records and API access remain unaffected</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              <span>Scheduled pauses automatically resume after the set duration</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default PauseControls