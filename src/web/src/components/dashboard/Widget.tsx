/**
 * Modern Widget Base Component
 * Provides consistent styling and behavior for all dashboard widgets
 */

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GripVertical, X, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetSizePresets } from './WidgetSizePresets'
import { DynamicSizeWrapper } from './DynamicSizeWrapper'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

interface WidgetBaseProps extends WidgetProps {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  isLoading?: boolean
  error?: string
  widgetDefinition?: WidgetDefinition
  // Dynamic sizing options
  enableDynamicSizing?: boolean
  onSizeChange?: (widgetId: string, newHeight: number) => void
  currentHeight?: number
}

export function WidgetBase({
  id,
  title,
  icon: Icon,
  description,
  children,
  actions,
  isEditing = false,
  isLoading = false,
  error,
  onRemove,
  onConfigure,
  className,
  widgetDefinition,
  enableDynamicSizing = false,
  onSizeChange,
  currentHeight = 4
}: WidgetBaseProps) {
  const widgetContent = (
    <Card className={cn(
      "h-full flex flex-col transition-all duration-200",
      isEditing && "ring-2 ring-blue-200 dark:ring-blue-800",
      error && "ring-2 ring-red-200 dark:ring-red-800",
      className
    )}>
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {isEditing && (
              <GripVertical className="h-4 w-4 text-gray-400 drag-handle cursor-move" />
            )}
            {Icon && <Icon className="h-5 w-5" />}
            <span className="truncate">{title}</span>
          </CardTitle>
          
          <div className="flex items-center gap-1">
            {actions}
            {isEditing && widgetDefinition && (
              <WidgetSizePresets
                widgetId={id}
                widgetDefinition={widgetDefinition}
              />
            )}
            {isEditing && onConfigure && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onConfigure}
                className="h-8 w-8 p-0"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            {isEditing && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-destructive">
              <p className="font-medium">Error loading widget</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )

  // Wrap with dynamic sizing if enabled
  if (enableDynamicSizing && onSizeChange) {
    return (
      <DynamicSizeWrapper
        widgetId={id}
        currentHeight={currentHeight}
        onSizeChange={onSizeChange}
        enabled={!isEditing} // Disable during editing to avoid conflicts
        showIndicator={!isEditing}
      >
        {widgetContent}
      </DynamicSizeWrapper>
    )
  }

  return widgetContent
}

// Higher-order component for creating widgets
export function createWidget<T extends Record<string, any> = {}>(
  component: React.ComponentType<WidgetProps & T>
) {
  const WrappedComponent = React.forwardRef<HTMLDivElement, WidgetProps & T>((props, ref) => {
    const Component = component
    return (
      <div ref={ref} className="h-full w-full">
        <Component {...(props as WidgetProps & T)} />
      </div>
    )
  })
  
  WrappedComponent.displayName = `createWidget(${component.displayName || component.name})`
  return WrappedComponent
}