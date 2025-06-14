/**
 * Responsive Utilities for Dashboard Widgets
 * Handles breakpoint detection and responsive sizing calculations
 */

import type { ResponsiveSizeConfig, ResponsiveWidgetSizes } from '@/types/dashboard'

export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs'

// Breakpoint definitions (must match ModernDashboard.tsx)
export const BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 320  // Added extra small breakpoint for very small phones
} as const

// Column counts per breakpoint (must match ModernDashboard.tsx)
export const COLUMNS = {
  lg: 24,
  md: 20,
  sm: 12,
  xs: 4,    // Reduced from 8 to 4 for better mobile layout
  xxs: 2    // Very minimal columns for smallest screens
} as const

/**
 * Get the current breakpoint based on window width
 */
export const getCurrentBreakpoint = (): Breakpoint => {
  if (typeof window === 'undefined') return 'lg'
  
  const width = window.innerWidth
  
  if (width >= BREAKPOINTS.lg) return 'lg'
  if (width >= BREAKPOINTS.md) return 'md'
  if (width >= BREAKPOINTS.sm) return 'sm'
  if (width >= BREAKPOINTS.xs) return 'xs'
  return 'xxs'
}

/**
 * Get size configuration for a specific breakpoint
 */
export const getSizeForBreakpoint = (
  sizeConfig: ResponsiveSizeConfig | ResponsiveWidgetSizes, 
  breakpoint: Breakpoint
): ResponsiveSizeConfig => {
  // If it's already a simple config, return it
  if ('w' in sizeConfig && 'h' in sizeConfig) {
    return sizeConfig
  }
  // Otherwise it's responsive, return the breakpoint-specific config
  return sizeConfig[breakpoint]
}

/**
 * Get maximum columns for a breakpoint
 */
export const getMaxColumnsForBreakpoint = (breakpoint: Breakpoint): number => {
  return COLUMNS[breakpoint]
}

/**
 * Constrain size to fit within breakpoint limits
 */
export const constrainSizeToBreakpoint = (
  size: ResponsiveSizeConfig,
  breakpoint: Breakpoint
): ResponsiveSizeConfig => {
  const maxCols = getMaxColumnsForBreakpoint(breakpoint)
  
  return {
    w: Math.min(size.w, maxCols),
    h: size.h // Height is not constrained by breakpoint
  }
}

/**
 * Create responsive size configuration from base sizes
 */
export const createResponsiveSizes = (
  lgSize: ResponsiveSizeConfig,
  options?: {
    mdRatio?: number
    smRatio?: number  
    xsRatio?: number
    xxsRatio?: number
  }
): ResponsiveWidgetSizes => {
  const { mdRatio = 0.8, smRatio = 0.6, xsRatio = 1.0, xxsRatio = 1.0 } = options || {}
  
  return {
    lg: constrainSizeToBreakpoint(lgSize, 'lg'),
    md: constrainSizeToBreakpoint({
      w: Math.max(Math.round(lgSize.w * mdRatio), 1),
      h: lgSize.h
    }, 'md'),
    sm: constrainSizeToBreakpoint({
      w: Math.max(Math.round(lgSize.w * smRatio), 1),
      h: lgSize.h
    }, 'sm'),
    xs: constrainSizeToBreakpoint({
      w: Math.max(Math.round(lgSize.w * xsRatio), Math.min(4, lgSize.w)), // Use full width on mobile (4 cols max)
      h: Math.max(lgSize.h, 4) // Ensure minimum height for readability
    }, 'xs'),
    xxs: constrainSizeToBreakpoint({
      w: Math.max(Math.round(lgSize.w * xxsRatio), Math.min(2, lgSize.w)), // Full width on very small screens
      h: Math.max(lgSize.h + 1, 5) // Extra height for very small screens
    }, 'xxs')
  }
}

/**
 * Get display mode for widget based on size and breakpoint
 */
export const getDisplayMode = (
  size: ResponsiveSizeConfig,
  breakpoint: Breakpoint,
  thresholds?: {
    compact?: number
    detailed?: number
  }
): 'compact' | 'normal' | 'detailed' => {
  const { compact = 6, detailed = 12 } = thresholds || {}
  const maxCols = getMaxColumnsForBreakpoint(breakpoint)
  
  // Calculate relative size as percentage of available columns
  const relativeSize = (size.w / maxCols) * 24 // Normalize to 24-column base
  
  if (relativeSize <= compact) return 'compact'
  if (relativeSize >= detailed) return 'detailed'
  return 'normal'
}