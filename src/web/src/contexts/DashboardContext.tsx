/**
 * Modern Dashboard Context
 * Provides centralized state management for dashboard functionality
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layout } from 'react-grid-layout'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import type { 
  DashboardContextType, 
  SavedLayout, 
  DashboardLayoutsResponse,
  DashboardLayoutResponse 
} from '@/types/dashboard'

const DashboardContext = createContext<DashboardContextType | null>(null)

interface DashboardProviderProps {
  children: React.ReactNode
}

// Default responsive configuration with status overview at top
const defaultLayouts: Record<string, Layout[]> = {
  lg: [
    { i: 'status-overview', x: 0, y: 0, w: 24, h: 6, minW: 8, minH: 4 },
    { i: 'system-stats', x: 0, y: 6, w: 24, h: 4, minW: 6, minH: 3 },
    { i: 'dns-health', x: 0, y: 10, w: 8, h: 8, minW: 3, minH: 6 },
    { i: 'port-monitoring', x: 8, y: 10, w: 16, h: 8, minW: 4, minH: 6 }
  ],
  md: [
    { i: 'status-overview', x: 0, y: 0, w: 20, h: 6, minW: 6, minH: 4 },
    { i: 'system-stats', x: 0, y: 6, w: 20, h: 4, minW: 5, minH: 3 },
    { i: 'dns-health', x: 0, y: 10, w: 10, h: 8, minW: 3, minH: 6 },
    { i: 'port-monitoring', x: 10, y: 10, w: 10, h: 8, minW: 3, minH: 6 }
  ],
  sm: [
    { i: 'status-overview', x: 0, y: 0, w: 12, h: 6, minW: 4, minH: 4 },
    { i: 'system-stats', x: 0, y: 6, w: 12, h: 4, minW: 4, minH: 3 },
    { i: 'dns-health', x: 0, y: 10, w: 12, h: 8, minW: 4, minH: 6 },
    { i: 'port-monitoring', x: 0, y: 18, w: 12, h: 8, minW: 4, minH: 6 }
  ]
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // State
  const [widgets, setWidgets] = useState<string[]>(['status-overview', 'system-stats', 'dns-health', 'port-monitoring'])
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set())
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [currentLayouts, setCurrentLayouts] = useState<Record<string, Layout[]>>(defaultLayouts)

  // Queries
  const { data: layoutsData } = useQuery({
    queryKey: ['dashboard-layouts'],
    queryFn: async (): Promise<DashboardLayoutsResponse> => {
      const response = await api.get('/user/dashboard-layouts')
      return response.data
    }
  })

  const { data: activeLayoutData } = useQuery({
    queryKey: ['dashboard-layouts-active'],
    queryFn: async (): Promise<DashboardLayoutResponse> => {
      const response = await api.get('/user/dashboard-layouts/active')
      return response.data
    }
  })

  // Mutations
  const saveLayoutMutation = useMutation({
    mutationFn: async ({ name, layout, widgets: widgetList, hiddenWidgets: hiddenList }: { 
      name: string, 
      layout: Record<string, Layout[]>,
      widgets: string[],
      hiddenWidgets: Set<string>
    }) => {
      const response = await api.put(`/user/dashboard-layouts/${encodeURIComponent(name)}`, { 
        layout: {
          ...layout,
          widgets: widgetList,
          hiddenWidgets: Array.from(hiddenList)
        }
      })
      return response.data
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Layout saved',
        description: `Layout "${variables.name}" saved successfully.`
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
      setHasUnsavedChanges(false)
      setIsSaving(false)
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save dashboard layout.',
        variant: 'destructive'
      })
      setIsSaving(false)
    }
  })

  const deleteLayoutMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.delete(`/user/dashboard-layouts/${encodeURIComponent(name)}`)
      return response.data
    },
    onSuccess: () => {
      toast({
        title: 'Layout deleted',
        description: 'Layout deleted successfully.'
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete layout.',
        variant: 'destructive'
      })
    }
  })

  const setActiveLayoutMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.put(`/user/dashboard-layouts/${encodeURIComponent(name)}/set-active`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-layouts-active'] })
    }
  })

  // Actions
  const addWidget = useCallback((widgetId: string, widgetDefinition?: any) => {
    // Add to widgets list
    setWidgets(prev => [...prev.filter(id => id !== widgetId), widgetId])
    setHiddenWidgets(prev => {
      const newSet = new Set(prev)
      newSet.delete(widgetId)
      return newSet
    })

    // Create layout entries for the new widget if definition is provided
    if (widgetDefinition) {
      setCurrentLayouts(prevLayouts => {
        const newLayouts = { ...prevLayouts }
        
        // Function to find optimal position for a widget
        const findOptimalPosition = (breakpoint: string, cols: number, defaultSize: { w: number; h: number }) => {
          const existingItems = newLayouts[breakpoint] || []
          const widgetWidth = Math.min(defaultSize.w, cols)
          const widgetHeight = defaultSize.h
          
          // Try to find an empty spot by checking each row
          for (let y = 0; y < 100; y += 2) { // Step by 2 to avoid tight packing
            for (let x = 0; x <= cols - widgetWidth; x += 2) { // Step by 2 for better spacing
              const hasCollision = existingItems.some(item => 
                !(x >= item.x + item.w || x + widgetWidth <= item.x || 
                  y >= item.y + item.h || y + widgetHeight <= item.y)
              )
              
              if (!hasCollision) {
                return { x, y, w: widgetWidth, h: widgetHeight }
              }
            }
          }
          
          // Fallback: place at bottom
          const maxY = existingItems.reduce((max, item) => Math.max(max, item.y + item.h), 0)
          return { x: 0, y: maxY + 1, w: widgetWidth, h: widgetHeight }
        }

        // Responsive configuration with better sizing logic
        const breakpointConfigs = {
          lg: { 
            cols: 24, 
            defaultSize: widgetDefinition.defaultSize 
          },
          md: { 
            cols: 20, 
            defaultSize: { 
              w: Math.min(widgetDefinition.defaultSize.w, 16), 
              h: widgetDefinition.defaultSize.h 
            } 
          },
          sm: { 
            cols: 12, 
            defaultSize: { 
              w: Math.min(widgetDefinition.defaultSize.w, 12), 
              h: widgetDefinition.defaultSize.h 
            } 
          },
          xs: { 
            cols: 8, 
            defaultSize: { 
              w: Math.min(widgetDefinition.defaultSize.w, 8), 
              h: widgetDefinition.defaultSize.h 
            } 
          }
        }

        // Create layout entry for each breakpoint
        Object.entries(breakpointConfigs).forEach(([breakpoint, config]) => {
          if (!newLayouts[breakpoint]) {
            newLayouts[breakpoint] = []
          }
          
          // Check if widget already exists in this breakpoint
          const existingIndex = newLayouts[breakpoint].findIndex(item => item.i === widgetId)
          
          if (existingIndex === -1) {
            // Find optimal position and add new layout item
            const position = findOptimalPosition(breakpoint, config.cols, config.defaultSize)
            
            newLayouts[breakpoint].push({
              i: widgetId,
              ...position,
              minW: widgetDefinition.minSize?.w || 2,
              minH: widgetDefinition.minSize?.h || 3,
              maxW: widgetDefinition.maxSize?.w || config.cols,
              maxH: widgetDefinition.maxSize?.h || 20
            })
          }
        })

        return newLayouts
      })
    }
    
    setHasUnsavedChanges(true)
    
    toast({
      title: 'Widget added',
      description: 'Widget has been added to your dashboard.'
    })
  }, [toast])

  const removeWidget = useCallback((widgetId: string) => {
    setHiddenWidgets(prev => new Set([...prev, widgetId]))
    setHasUnsavedChanges(true)
    
    toast({
      title: 'Widget removed',
      description: 'Widget has been removed from your dashboard.'
    })
  }, [toast])

  const toggleWidget = useCallback((widgetId: string) => {
    setHiddenWidgets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(widgetId)) {
        newSet.delete(widgetId)
      } else {
        newSet.add(widgetId)
      }
      return newSet
    })
    setHasUnsavedChanges(true)
  }, [])

  const updateLayout = useCallback((layouts: Record<string, Layout[]>) => {
    setCurrentLayouts(layouts)
    if (isEditing) {
      setHasUnsavedChanges(true)
    }
  }, [isEditing])

  const resizeWidget = useCallback((widgetId: string, size: { w: number; h: number }) => {
    if (!isEditing) return
    
    setCurrentLayouts(prevLayouts => {
      const newLayouts = { ...prevLayouts }
      
      // Update size for all breakpoints proportionally
      Object.keys(newLayouts).forEach(breakpoint => {
        const layoutItems = [...newLayouts[breakpoint]]
        const itemIndex = layoutItems.findIndex(item => item.i === widgetId)
        
        if (itemIndex !== -1) {
          const item = layoutItems[itemIndex]
          
          // Scale size based on breakpoint
          let scaledSize = { ...size }
          if (breakpoint === 'md') {
            scaledSize.w = Math.max(Math.floor(size.w * 0.8), item.minW || 2)
            scaledSize.h = Math.max(Math.floor(size.h * 0.9), item.minH || 3)
          } else if (breakpoint === 'sm') {
            scaledSize.w = Math.max(Math.floor(size.w * 0.6), item.minW || 2)
            scaledSize.h = Math.max(Math.floor(size.h * 0.8), item.minH || 3)
          }
          
          // Respect min/max constraints
          scaledSize.w = Math.max(scaledSize.w, item.minW || 2)
          scaledSize.h = Math.max(scaledSize.h, item.minH || 3)
          if (item.maxW) scaledSize.w = Math.min(scaledSize.w, item.maxW)
          if (item.maxH) scaledSize.h = Math.min(scaledSize.h, item.maxH)
          
          layoutItems[itemIndex] = {
            ...item,
            w: scaledSize.w,
            h: scaledSize.h
          }
        }
        
        newLayouts[breakpoint] = layoutItems
      })
      
      return newLayouts
    })
    
    setHasUnsavedChanges(true)
  }, [isEditing])

  const saveLayout = useCallback(async (name?: string) => {
    const layoutName = name || activeLayoutData?.data?.name || 'My Dashboard'
    
    console.log('Saving layout:', {
      name: layoutName,
      widgets: widgets,
      hiddenWidgets: Array.from(hiddenWidgets),
      layoutsCount: Object.keys(currentLayouts).length
    })
    
    setIsSaving(true)
    saveLayoutMutation.mutate({ 
      name: layoutName, 
      layout: currentLayouts,
      widgets,
      hiddenWidgets
    })
  }, [saveLayoutMutation, currentLayouts, widgets, hiddenWidgets, activeLayoutData])

  const loadLayout = useCallback(async (layoutId: string) => {
    setActiveLayoutMutation.mutate(layoutId)
  }, [setActiveLayoutMutation])

  const deleteLayout = useCallback(async (layoutId: string) => {
    deleteLayoutMutation.mutate(layoutId)
  }, [deleteLayoutMutation])

  const setEditing = useCallback((editing: boolean) => {
    setIsEditing(editing)
    if (!editing && hasUnsavedChanges) {
      // Auto-save when exiting edit mode
      const layoutName = activeLayoutData?.data?.name || 'My Dashboard'
      setIsSaving(true)
      saveLayoutMutation.mutate({ 
        name: layoutName, 
        layout: currentLayouts,
        widgets,
        hiddenWidgets
      })
    }
  }, [hasUnsavedChanges, activeLayoutData, currentLayouts, widgets, hiddenWidgets, saveLayoutMutation])

  const resetLayout = useCallback(() => {
    setCurrentLayouts(defaultLayouts)
    setHiddenWidgets(new Set())
    setWidgets(['status-overview', 'system-stats', 'dns-health', 'port-monitoring'])
    setHasUnsavedChanges(true)
  }, [])

  // Load active layout when data changes
  useEffect(() => {
    if (activeLayoutData?.data) {
      const layoutData = activeLayoutData.data as any
      
      if (layoutData.layout) {
        const layout = layoutData.layout as any
        
        // Extract grid layouts (remove widgets and hiddenWidgets from the grid config)
        const { widgets: savedWidgets, hiddenWidgets: savedHiddenWidgets, ...gridLayouts } = layout
        
        console.log('Loading layout data:', {
          savedWidgets,
          savedHiddenWidgets,
          hasGridLayouts: Object.keys(gridLayouts).length > 0
        })
        
        setCurrentLayouts(gridLayouts)
        
        // Restore widgets list if available
        if (savedWidgets && Array.isArray(savedWidgets)) {
          console.log('Loading saved widgets:', savedWidgets)
          setWidgets(savedWidgets)
        }
        
        // Restore hidden widgets if available
        if (savedHiddenWidgets && Array.isArray(savedHiddenWidgets)) {
          console.log('Loading saved hidden widgets:', savedHiddenWidgets)
          setHiddenWidgets(new Set(savedHiddenWidgets))
        }
      }
      
      setHasUnsavedChanges(false)
    }
  }, [activeLayoutData])

  const contextValue: DashboardContextType = {
    currentLayout: activeLayoutData?.data || null,
    currentLayouts,
    layouts: layoutsData?.data || [],
    widgets,
    hiddenWidgets,
    isEditing,
    isSaving,
    hasUnsavedChanges,
    addWidget,
    removeWidget,
    toggleWidget,
    updateLayout,
    resizeWidget,
    saveLayout,
    loadLayout,
    deleteLayout,
    setEditing,
    resetLayout
  }

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard(): DashboardContextType {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}

export default DashboardContext