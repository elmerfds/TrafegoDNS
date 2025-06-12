/**
 * Dynamic Size Wrapper Component
 * Wraps widget content and automatically adjusts grid layout when content overflows
 */
import React, { useEffect } from 'react'
import { useDynamicWidgetSizing } from '@/hooks/useDynamicWidgetSizing'
import { Badge } from '@/components/ui/badge'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DynamicSizeWrapperProps {
  /** Current widget height in grid units */
  currentHeight: number
  /** Current widget ID for layout updates */
  widgetId: string
  /** Children to render */
  children: React.ReactNode
  /** Callback to update widget size in grid layout */
  onSizeChange?: (widgetId: string, newHeight: number) => void
  /** Enable/disable dynamic sizing */
  enabled?: boolean
  /** Show visual indicator when expanded */
  showIndicator?: boolean
  /** Additional CSS classes */
  className?: string
  /** Dynamic sizing options */
  options?: {
    minHeight?: number
    maxHeight?: number
    debounceMs?: number
    padding?: number
  }
}

export function DynamicSizeWrapper({
  currentHeight,
  widgetId,
  children,
  onSizeChange,
  enabled = true,
  showIndicator = true,
  className,
  options = {}
}: DynamicSizeWrapperProps) {
  const {
    contentRef,
    suggestedHeight,
    needsExpansion,
    recalculate
  } = useDynamicWidgetSizing(currentHeight, {
    enabled,
    ...options
  })

  // Update grid layout when suggested height changes
  useEffect(() => {
    if (enabled && onSizeChange && suggestedHeight !== currentHeight) {
      onSizeChange(widgetId, suggestedHeight)
    }
  }, [enabled, onSizeChange, widgetId, suggestedHeight, currentHeight])

  // Force recalculation when children change
  useEffect(() => {
    if (enabled) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(recalculate, 50)
      return () => clearTimeout(timer)
    }
  }, [children, enabled, recalculate])

  return (
    <div className={cn('relative h-full', className)}>
      {/* Dynamic size indicator */}
      {enabled && showIndicator && needsExpansion && (
        <div className="absolute top-2 right-2 z-10">
          <Badge 
            variant="secondary" 
            className="h-6 px-2 text-xs flex items-center gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <Maximize2 className="h-3 w-3" />
            Auto-expanded
          </Badge>
        </div>
      )}

      {/* Content container with ref for measurement */}
      <div 
        ref={contentRef}
        className="h-full overflow-hidden"
      >
        {children}
      </div>
    </div>
  )
}