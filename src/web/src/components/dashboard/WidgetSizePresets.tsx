/**
 * Widget Size Presets Component
 * Provides quick size preset buttons for widgets
 */

import React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Maximize2 } from 'lucide-react'
import { useDashboard } from '@/contexts/DashboardContext'
import type { WidgetDefinition } from '@/types/dashboard'

interface WidgetSizePresetsProps {
  widgetId: string
  widgetDefinition: WidgetDefinition
}

interface SizePreset {
  name: string
  description: string
  size: { w: number; h: number }
}

// Define size presets based on widget category
const getSizePresets = (category: string, minSize: { w: number; h: number }, maxSize?: { w: number; h: number }): SizePreset[] => {
  // Use larger defaults suitable for 24-column grid system
  const defaultMaxW = maxSize?.w || 24
  const defaultMaxH = maxSize?.h || 12
  
  const basePresets: SizePreset[] = [
    {
      name: 'Compact',
      description: 'Minimal size',
      size: { w: minSize.w, h: minSize.h }
    },
    {
      name: 'Medium',
      description: 'Balanced view',
      size: { 
        w: Math.min(minSize.w + 4, defaultMaxW), 
        h: Math.min(minSize.h + 2, defaultMaxH) 
      }
    },
    {
      name: 'Large',
      description: 'Expanded view',
      size: { 
        w: Math.min(minSize.w + 8, defaultMaxW), 
        h: Math.min(minSize.h + 4, defaultMaxH) 
      }
    }
  ]

  // Category-specific presets
  switch (category) {
    case 'system':
      return [
        ...basePresets,
        {
          name: 'Wide',
          description: 'Full width',
          size: { 
            w: Math.min(24, defaultMaxW), 
            h: Math.min(minSize.h + 2, defaultMaxH) 
          }
        }
      ]
    
    case 'dns':
      return [
        ...basePresets,
        {
          name: 'Tall',
          description: 'More vertical space',
          size: { 
            w: Math.min(minSize.w + 6, defaultMaxW), 
            h: Math.min(minSize.h + 6, defaultMaxH) 
          }
        }
      ]
    
    case 'ports':
      return [
        ...basePresets,
        {
          name: 'Grid',
          description: 'Square layout',
          size: { 
            w: Math.min(12, defaultMaxW), 
            h: Math.min(12, defaultMaxH) 
          }
        }
      ]
    
    case 'monitoring':
      return [
        ...basePresets,
        {
          name: 'Dashboard',
          description: 'Chart-friendly',
          size: { 
            w: Math.min(16, defaultMaxW), 
            h: Math.min(10, defaultMaxH) 
          }
        }
      ]
    
    case 'containers':
      return [
        ...basePresets,
        {
          name: 'List',
          description: 'List-optimized',
          size: { 
            w: Math.min(20, defaultMaxW), 
            h: Math.min(minSize.h + 4, defaultMaxH) 
          }
        }
      ]
    
    default:
      return basePresets
  }
}

export function WidgetSizePresets({ widgetId, widgetDefinition }: WidgetSizePresetsProps) {
  const { resizeWidget, isEditing } = useDashboard()
  
  if (!isEditing) return null
  
  const presets = getSizePresets(
    widgetDefinition.category, 
    widgetDefinition.minSize, 
    widgetDefinition.maxSize
  )
  
  const handleResize = (size: { w: number; h: number }) => {
    resizeWidget(widgetId, size)
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Quick resize"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Size Presets</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {presets.map((preset) => (
          <DropdownMenuItem
            key={preset.name}
            onClick={() => handleResize(preset.size)}
            className="flex flex-col items-start p-3"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">{preset.name}</span>
              <span className="text-xs text-muted-foreground">
                {preset.size.w}×{preset.size.h}
              </span>
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              {preset.description}
            </span>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => handleResize(widgetDefinition.defaultSize)}
          className="flex flex-col items-start p-3"
        >
          <div className="flex items-center justify-between w-full">
            <span className="font-medium">Default</span>
            <span className="text-xs text-muted-foreground">
              {widgetDefinition.defaultSize.w}×{widgetDefinition.defaultSize.h}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-1">
            Original size
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}