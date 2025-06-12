/**
 * Dynamic Widget Sizing Hook
 * Automatically adjusts widget height when content overflows
 */
import { useEffect, useRef, useState, useCallback } from 'react'
// Simple debounce implementation to avoid external dependencies
function debounce<T extends (...args: any[]) => any>(
  func: T, 
  wait: number
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), wait)
  }) as T & { cancel: () => void }
  
  debounced.cancel = () => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
  }
  
  return debounced
}

interface DynamicSizingOptions {
  /** Minimum height in grid units */
  minHeight?: number
  /** Maximum height in grid units */
  maxHeight?: number
  /** Enable/disable dynamic sizing */
  enabled?: boolean
  /** Debounce delay for resize calculations (ms) */
  debounceMs?: number
  /** Additional padding in pixels to add to calculated height */
  padding?: number
  /** Grid unit height in pixels (default: 60px) */
  gridUnitHeight?: number
}

interface DynamicSizingReturn {
  /** Ref to attach to the content container */
  contentRef: React.RefObject<HTMLDivElement>
  /** Current calculated height in grid units */
  suggestedHeight: number
  /** Whether the widget needs to expand */
  needsExpansion: boolean
  /** Force recalculation of height */
  recalculate: () => void
}

export function useDynamicWidgetSizing(
  currentHeight: number,
  options: DynamicSizingOptions = {}
): DynamicSizingReturn {
  const {
    minHeight = currentHeight,
    maxHeight = currentHeight + 4, // Allow up to 4 units expansion
    enabled = true,
    debounceMs = 150,
    padding = 16,
    gridUnitHeight = 60
  } = options

  const contentRef = useRef<HTMLDivElement>(null)
  const [suggestedHeight, setSuggestedHeight] = useState(currentHeight)
  const [needsExpansion, setNeedsExpansion] = useState(false)

  const calculateRequiredHeight = useCallback(() => {
    if (!enabled || !contentRef.current) {
      return currentHeight
    }

    const element = contentRef.current
    const scrollHeight = element.scrollHeight
    const clientHeight = element.clientHeight
    
    // Check if content is overflowing
    const isOverflowing = scrollHeight > clientHeight
    
    if (isOverflowing) {
      // Calculate how many grid units we need
      const totalHeightNeeded = scrollHeight + padding
      const gridUnitsNeeded = Math.ceil(totalHeightNeeded / gridUnitHeight)
      
      // Constrain to min/max bounds
      const constrainedHeight = Math.min(Math.max(gridUnitsNeeded, minHeight), maxHeight)
      
      setNeedsExpansion(constrainedHeight > currentHeight)
      return constrainedHeight
    } else {
      // Content fits, can we shrink back to original size?
      const canShrink = suggestedHeight > currentHeight
      if (canShrink) {
        // Try original size and see if it still fits
        const originalHeightPx = currentHeight * gridUnitHeight
        if (scrollHeight + padding <= originalHeightPx) {
          setNeedsExpansion(false)
          return currentHeight
        }
      }
      
      setNeedsExpansion(false)
      return suggestedHeight
    }
  }, [enabled, currentHeight, minHeight, maxHeight, padding, gridUnitHeight, suggestedHeight])

  // Debounced calculation function
  const debouncedCalculate = useCallback(
    debounce(() => {
      const newHeight = calculateRequiredHeight()
      setSuggestedHeight(newHeight)
    }, debounceMs),
    [calculateRequiredHeight, debounceMs]
  )

  const recalculate = useCallback(() => {
    debouncedCalculate()
  }, [debouncedCalculate])

  // Observer for content changes
  useEffect(() => {
    if (!enabled || !contentRef.current) return

    const element = contentRef.current
    
    // Create ResizeObserver to watch for content size changes
    const resizeObserver = new ResizeObserver(() => {
      debouncedCalculate()
    })

    // Create MutationObserver to watch for DOM changes
    const mutationObserver = new MutationObserver(() => {
      debouncedCalculate()
    })

    // Start observing
    resizeObserver.observe(element)
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    })

    // Initial calculation
    debouncedCalculate()

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      debouncedCalculate.cancel()
    }
  }, [enabled, debouncedCalculate])

  // Recalculate when current height changes
  useEffect(() => {
    if (enabled) {
      debouncedCalculate()
    }
  }, [currentHeight, enabled, debouncedCalculate])

  return {
    contentRef,
    suggestedHeight,
    needsExpansion,
    recalculate
  }
}