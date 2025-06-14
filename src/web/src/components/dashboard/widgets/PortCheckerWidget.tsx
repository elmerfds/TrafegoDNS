/**
 * Port Checker Widget
 * Quick port availability checker
 */

import React, { useState } from 'react'
import { Search, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface PortCheckResult {
  port: number
  status: 'available' | 'in-use' | 'reserved' | 'error'
  service?: string
  container?: string
}

export function PortCheckerWidget(props: WidgetProps) {
  const [port, setPort] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<PortCheckResult | null>(null)
  const [recentChecks, setRecentChecks] = useState<PortCheckResult[]>([])
  const { displayMode = 'normal', currentBreakpoint = 'lg', layout } = props
  
  // Get current widget height from layout for dynamic sizing
  const currentHeight = layout?.h || 4
  
  // Calculate how many items to show based on widget size
  const getMaxItems = () => {
    if (displayMode === 'compact') return 3
    if (currentBreakpoint === 'lg') return 10  // More items on larger screens
    if (currentBreakpoint === 'md') return 6
    return 4
  }

  const checkPort = async () => {
    if (!port || isNaN(Number(port))) return
    
    setChecking(true)
    try {
      const response = await api.get(`/ports/check/${port}`)
      const checkResult: PortCheckResult = {
        port: Number(port),
        status: response.data.available ? 'available' : 'in-use',
        service: response.data.service,
        container: response.data.container
      }
      
      setResult(checkResult)
      setRecentChecks(prev => [checkResult, ...prev.slice(0, 4)]) // Keep last 5 checks
    } catch (error) {
      const errorResult: PortCheckResult = {
        port: Number(port),
        status: 'error'
      }
      setResult(errorResult)
    } finally {
      setChecking(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'in-use': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'reserved': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'error': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available': return <CheckCircle className="h-4 w-4" />
      case 'in-use': case 'reserved': return <XCircle className="h-4 w-4" />
      case 'error': return <XCircle className="h-4 w-4" />
      default: return <Search className="h-4 w-4" />
    }
  }

  return (
    <WidgetBase
      {...props}
      title="Port Checker"
      icon={Search}
      description="Check port availability"
      widgetDefinition={props.widgetDefinition}
      enableDynamicSizing={true}
      currentHeight={currentHeight}
      onSizeChange={props.onSizeChange}
    >
      <div className="flex flex-col h-full">
        {/* Port Input */}
        <div className="flex gap-2 mb-3">
          <Input
            type="number"
            placeholder={currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "Port" : "Enter port number"}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && checkPort()}
            min="1"
            max="65535"
            className={cn(
              "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] overflow-hidden",
              currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "text-base" : ""
            )}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          />
          <Button 
            onClick={checkPort} 
            disabled={checking || !port}
            size={currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "default" : "sm"}
            className="touch-manipulation"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Current Result */}
        {result && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Port {result.port}</span>
              <Badge variant="outline" className={getStatusColor(result.status)}>
                <span className="flex items-center gap-1">
                  {getStatusIcon(result.status)}
                  {result.status}
                </span>
              </Badge>
            </div>
            {result.service && (
              <p className="text-sm text-muted-foreground">
                Service: {result.service}
              </p>
            )}
            {result.container && (
              <p className="text-sm text-muted-foreground">
                Container: {result.container}
              </p>
            )}
          </div>
        )}

        {/* Recent Checks */}
        {recentChecks.length > 0 && (
          <div className="flex-1 space-y-2 overflow-y-auto min-h-0 mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Checks</h4>
            <div className="space-y-1">
              {recentChecks.slice(0, getMaxItems()).map((check, index) => (
                <div key={index} className="flex items-center justify-between p-2 text-sm bg-gray-50 dark:bg-gray-800 rounded">
                  <span>Port {check.port}</span>
                  <Badge variant="outline" className={getStatusColor(check.status)}>
                    {check.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Port Suggestions */}
        <div className="space-y-2 mt-auto">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Check</h4>
          <div className={cn(
            "grid gap-2",
            currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "grid-cols-2" : "grid-cols-3"
          )}>
            {(currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' 
              ? [3000, 8080] 
              : [3000, 8080, 9000]
            ).map(quickPort => (
              <Button
                key={quickPort}
                variant="outline"
                size={currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "default" : "sm"}
                onClick={() => {
                  setPort(quickPort.toString())
                  setTimeout(() => checkPort(), 100)
                }}
                className={cn(
                  "touch-manipulation",
                  currentBreakpoint === 'xs' || currentBreakpoint === 'xxs' ? "text-sm" : "text-xs"
                )}
              >
                {quickPort}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </WidgetBase>
  )
}

export const portCheckerDefinition: WidgetDefinition = {
  id: 'port-checker',
  name: 'Port Checker',
  description: 'Quick port availability checker',
  category: 'ports',
  icon: Search,
  defaultSize: createResponsiveSizes({ w: 6, h: 6 }, { xsRatio: 1.0, xxsRatio: 1.0 }), // Medium preset: min + 4 width, min + 2 height
  minSize: createResponsiveSizes({ w: 4, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0, xxsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 12, h: 10 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact',
    xxs: 'compact'
  }
}