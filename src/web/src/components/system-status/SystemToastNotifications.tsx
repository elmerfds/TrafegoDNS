/**
 * System Toast Notifications Component
 * Handles showing toast notifications for new system alerts
 */
import React, { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { useSystemAlerts, type SystemAlert } from '@/hooks/useSystemAlerts'

export function SystemToastNotifications() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: alerts = [] } = useSystemAlerts()
  const previousAlertsRef = useRef<SystemAlert[]>([])

  useEffect(() => {
    const previousAlerts = previousAlertsRef.current
    const currentAlerts = alerts

    // Find new alerts that weren't in the previous list
    const newAlerts = currentAlerts.filter(current => 
      !previousAlerts.some(previous => 
        previous.id === current.id && 
        previous.timestamp === current.timestamp
      )
    )

    // Show toast for each new alert
    newAlerts.forEach(alert => {
      toast({
        title: alert.title,
        description: alert.description,
        variant: alert.type === 'error' ? 'destructive' : 'default',
        duration: alert.type === 'error' ? 10000 : 7000, // Longer for errors
        action: alert.actionUrl ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(alert.actionUrl!)}
            className="gap-1"
          >
            View
            <AlertTriangle className="h-3 w-3" />
          </Button>
        ) : undefined,
      })
    })

    // Update the reference
    previousAlertsRef.current = currentAlerts
  }, [alerts, toast, navigate])

  // This component doesn't render anything visible
  return null
}