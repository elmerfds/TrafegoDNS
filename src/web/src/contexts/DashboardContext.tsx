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

// Default responsive configuration
const defaultLayouts: Record<string, Layout[]> = {
  lg: [
    { i: 'system-stats', x: 0, y: 0, w: 12, h: 4, minW: 6, minH: 3 },
    { i: 'dns-health', x: 0, y: 4, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'port-monitoring', x: 4, y: 4, w: 6, h: 6, minW: 4, minH: 5 }
  ],
  md: [
    { i: 'system-stats', x: 0, y: 0, w: 10, h: 4, minW: 5, minH: 3 },
    { i: 'dns-health', x: 0, y: 4, w: 5, h: 6, minW: 3, minH: 4 },
    { i: 'port-monitoring', x: 5, y: 4, w: 5, h: 6, minW: 3, minH: 5 }
  ],
  sm: [
    { i: 'system-stats', x: 0, y: 0, w: 4, h: 4, minW: 4, minH: 3 },
    { i: 'dns-health', x: 0, y: 4, w: 4, h: 6, minW: 4, minH: 4 },
    { i: 'port-monitoring', x: 0, y: 10, w: 4, h: 6, minW: 4, minH: 5 }
  ]
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // State
  const [widgets, setWidgets] = useState<string[]>(['system-stats', 'dns-health', 'port-monitoring'])
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
    mutationFn: async ({ name, layout }: { name: string, layout: Record<string, Layout[]> }) => {
      const response = await api.put(`/user/dashboard-layouts/${encodeURIComponent(name)}`, { layout })
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
  const addWidget = useCallback((widgetId: string) => {
    setWidgets(prev => [...prev.filter(id => id !== widgetId), widgetId])
    setHiddenWidgets(prev => {
      const newSet = new Set(prev)
      newSet.delete(widgetId)
      return newSet
    })
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

  const saveLayout = useCallback(async (name?: string) => {
    const layoutName = name || activeLayoutData?.data?.name || 'My Dashboard'
    setIsSaving(true)
    saveLayoutMutation.mutate({ name: layoutName, layout: currentLayouts })
  }, [saveLayoutMutation, currentLayouts, activeLayoutData])

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
      saveLayout()
    }
  }, [hasUnsavedChanges, saveLayout])

  const resetLayout = useCallback(() => {
    setCurrentLayouts(defaultLayouts)
    setHiddenWidgets(new Set())
    setWidgets(['system-stats', 'dns-health', 'port-monitoring'])
    setHasUnsavedChanges(true)
  }, [])

  // Load active layout when data changes
  useEffect(() => {
    if (activeLayoutData?.data?.layout) {
      // Convert DashboardLayout to Record<string, Layout[]>
      const layouts = activeLayoutData.data.layout as unknown as Record<string, Layout[]>
      setCurrentLayouts(layouts)
      setHasUnsavedChanges(false)
    }
  }, [activeLayoutData])

  const contextValue: DashboardContextType = {
    currentLayout: activeLayoutData?.data || null,
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