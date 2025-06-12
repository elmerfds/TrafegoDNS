/**
 * System Status Indicator Component
 * Shows a compact status indicator with alert count in the header
 */
import React from 'react'
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import { useSystemAlerts, useSystemAlertsCount, useHasCriticalAlerts } from '@/hooks/useSystemAlerts'
import { cn } from '@/lib/utils'

export function SystemStatusIndicator() {
  const navigate = useNavigate()
  const { data: alerts = [], isLoading } = useSystemAlerts()
  const alertCount = useSystemAlertsCount()
  const hasCritical = useHasCriticalAlerts()

  // Determine status
  const getStatusInfo = () => {
    if (isLoading) {
      return {
        icon: CheckCircle,
        color: 'text-muted-foreground',
        label: 'Checking...'
      }
    }

    if (hasCritical) {
      return {
        icon: AlertCircle,
        color: 'text-destructive',
        label: 'Critical Issues'
      }
    }

    if (alertCount > 0) {
      return {
        icon: AlertTriangle,
        color: 'text-orange-600',
        label: 'Warnings'
      }
    }

    return {
      icon: CheckCircle,
      color: 'text-green-600',
      label: 'All Systems Normal'
    }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "relative h-8 gap-2 px-2",
            alertCount > 0 && "animate-pulse"
          )}
        >
          <StatusIcon className={cn("h-4 w-4", statusInfo.color)} />
          <span className="text-sm font-medium hidden sm:inline">
            System Status
          </span>
          {alertCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {alertCount > 9 ? '9+' : alertCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", statusInfo.color)} />
          {statusInfo.label}
        </DropdownMenuLabel>
        
        {alerts.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {alerts.map((alert) => (
              <DropdownMenuItem
                key={alert.id}
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                onClick={() => alert.actionUrl && navigate(alert.actionUrl)}
              >
                <div className="flex items-center gap-2 w-full">
                  <AlertTriangle className={cn(
                    "h-4 w-4 flex-shrink-0",
                    alert.type === 'error' ? 'text-destructive' : 'text-orange-600'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {alert.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {alert.description}
                    </div>
                  </div>
                  {alert.count && alert.count > 1 && (
                    <Badge variant="outline" className="text-xs">
                      {alert.count}
                    </Badge>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        {alerts.length === 0 && !isLoading && (
          <>
            <DropdownMenuSeparator />
            <div className="p-3 text-center text-sm text-muted-foreground">
              No active alerts
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}