/**
 * Dashboard-related type definitions
 */

export interface DashboardLayout {
  lg: LayoutItem[]
  md: LayoutItem[]
  sm: LayoutItem[]
}

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minH?: number
  minW?: number
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