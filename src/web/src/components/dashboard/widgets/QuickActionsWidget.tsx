/**
 * Quick Actions Widget
 * Provides quick access to common dashboard actions
 */

import React from 'react'
import { 
  Settings, 
  Globe, 
  Container, 
  Network, 
  FileText, 
  Users,
  AlertTriangle,
  Plus
} from 'lucide-react'
import { WidgetBase } from '../Widget'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { createResponsiveSizes } from '@/lib/responsiveUtils'
import { cn } from '@/lib/utils'
import type { WidgetProps, WidgetDefinition } from '@/types/dashboard'

export function QuickActionsWidget(props: WidgetProps) {
  const navigate = useNavigate()
  const { displayMode, currentBreakpoint } = props
  const isMobile = currentBreakpoint === 'xs'

  const quickActions = [
    {
      title: 'DNS Records',
      description: 'Manage DNS records',
      icon: Globe,
      path: '/dns-records',
      color: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400'
    },
    {
      title: 'Containers',
      description: 'View container status',
      icon: Container,
      path: '/containers',
      color: 'bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400'
    },
    {
      title: 'Port Management',
      description: 'Monitor ports',
      icon: Network,
      path: '/port-management',
      color: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-400'
    },
    {
      title: 'Orphaned Records',
      description: 'Clean up orphaned DNS',
      icon: AlertTriangle,
      path: '/orphaned-records',
      color: 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400'
    },
    {
      title: 'Logs',
      description: 'View system logs',
      icon: FileText,
      path: '/logs',
      color: 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-950/30 dark:hover:bg-gray-900/50 text-gray-700 dark:text-gray-400'
    },
    {
      title: 'Settings',
      description: 'System configuration',
      icon: Settings,
      path: '/settings',
      color: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400'
    }
  ]

  return (
    <WidgetBase
      {...props}
      title="Quick Actions"
      icon={Settings}
      description="Quick access to common tasks"
      widgetDefinition={props.widgetDefinition}
    >
      <div className={cn(
        "grid gap-3",
        isMobile ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"
      )}>
        {quickActions.map((action) => (
          <Button
            key={action.path}
            variant="ghost"
            className={cn(
              action.color,
              "h-auto flex flex-col items-center gap-2 text-center touch-manipulation",
              isMobile ? "p-3 min-h-[64px]" : "p-4"
            )}
            onClick={() => navigate(action.path)}
          >
            <action.icon className={cn(
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )} />
            <div>
              <div className={cn(
                "font-medium",
                isMobile ? "text-xs" : "text-sm"
              )}>{action.title}</div>
              {!isMobile && (
                <div className="text-xs opacity-70">{action.description}</div>
              )}
            </div>
          </Button>
        ))}
      </div>
    </WidgetBase>
  )
}

export const quickActionsDefinition: WidgetDefinition = {
  id: 'quick-actions',
  name: 'Quick Actions',
  description: 'Quick access to common dashboard tasks',
  category: 'system',
  icon: Settings,
  defaultSize: createResponsiveSizes({ w: 12, h: 6 }, { xsRatio: 1.0 }),
  minSize: createResponsiveSizes({ w: 8, h: 4 }, { mdRatio: 0.9, smRatio: 0.8, xsRatio: 1.0 }),
  maxSize: createResponsiveSizes({ w: 16, h: 8 }),
  responsiveDisplay: {
    lg: 'detailed',
    md: 'normal',
    sm: 'compact',
    xs: 'compact'
  }
}