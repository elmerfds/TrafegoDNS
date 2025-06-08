/**
 * Modern Dashboard Type Definitions
 */

import { LucideIcon } from 'lucide-react'
import { Layout } from 'react-grid-layout'

// Legacy types for backward compatibility
export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minH?: number
  minW?: number
}

export interface DashboardLayout {
  lg: LayoutItem[]
  md: LayoutItem[]
  sm: LayoutItem[]
}

export interface SavedLayout {
  id: number
  user_id?: number
  name: string
  layout: DashboardLayout
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DashboardLayoutsResponse {
  success: boolean
  data: SavedLayout[]
}

export interface DashboardLayoutResponse {
  success: boolean
  data: SavedLayout | null
}

// Modern widget system types
export interface WidgetDefinition {
  id: string
  name: string
  description: string
  category: 'system' | 'dns' | 'containers' | 'ports' | 'monitoring'
  icon: LucideIcon
  defaultSize: {
    w: number
    h: number
  }
  minSize: {
    w: number
    h: number
  }
  maxSize?: {
    w: number
    h: number
  }
  settings?: Record<string, any>
  requirements?: string[]
}

export interface WidgetProps {
  id: string
  config?: Record<string, any>
  isEditing?: boolean
  onRemove?: () => void
  onConfigure?: () => void
  className?: string
  widgetDefinition?: WidgetDefinition
}

export interface WidgetComponent {
  definition: WidgetDefinition
  component: React.ComponentType<WidgetProps>
  useData?: () => any
}

export interface ResponsiveConfig {
  breakpoints: Record<string, number>
  cols: Record<string, number>
  margin: [number, number]
  containerPadding: [number, number]
  rowHeight: number
}

export interface WidgetRegistry {
  widgets: Map<string, WidgetComponent>
  categories: Map<string, WidgetDefinition[]>
  register: (widget: WidgetComponent) => void
  unregister: (id: string) => void
  get: (id: string) => WidgetComponent | undefined
  getByCategory: (category: string) => WidgetDefinition[]
  getAll: () => WidgetDefinition[]
}

export interface DashboardContextType {
  currentLayout: SavedLayout | null
  layouts: SavedLayout[]
  widgets: string[]
  hiddenWidgets: Set<string>
  isEditing: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  
  addWidget: (widgetId: string, widgetDefinition?: WidgetDefinition) => void
  removeWidget: (widgetId: string) => void
  toggleWidget: (widgetId: string) => void
  updateLayout: (layouts: Record<string, Layout[]>) => void
  resizeWidget: (widgetId: string, size: { w: number; h: number }) => void
  saveLayout: (name?: string) => Promise<void>
  loadLayout: (layoutId: string) => Promise<void>
  deleteLayout: (layoutId: string) => Promise<void>
  setEditing: (editing: boolean) => void
  resetLayout: () => void
}