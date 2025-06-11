/**
 * Modern Widget Registry Hook
 * Manages widget registration and provides type-safe widget access
 */

import { useMemo } from 'react'
import type { WidgetComponent, WidgetDefinition, WidgetRegistry } from '@/types/dashboard'

class WidgetRegistryImpl implements WidgetRegistry {
  public widgets = new Map<string, WidgetComponent>()
  public categories = new Map<string, WidgetDefinition[]>()

  register(widget: WidgetComponent) {
    this.widgets.set(widget.definition.id, widget)
    
    // Update categories
    const category = widget.definition.category
    const existing = this.categories.get(category) || []
    const filtered = existing.filter(w => w.id !== widget.definition.id)
    this.categories.set(category, [...filtered, widget.definition])
  }

  unregister(id: string) {
    const widget = this.widgets.get(id)
    if (widget) {
      this.widgets.delete(id)
      
      // Update categories
      const category = widget.definition.category
      const existing = this.categories.get(category) || []
      this.categories.set(category, existing.filter(w => w.id !== id))
    }
  }

  get(id: string): WidgetComponent | undefined {
    return this.widgets.get(id)
  }

  getByCategory(category: string): WidgetDefinition[] {
    return this.categories.get(category) || []
  }

  getAll(): WidgetDefinition[] {
    return Array.from(this.widgets.values()).map(w => w.definition)
  }
}

// Singleton registry instance
const registryInstance = new WidgetRegistryImpl()

export function useWidgetRegistry(): WidgetRegistry {
  return useMemo(() => registryInstance, [])
}

// Helper hook to register widgets
export function useWidgetRegistration(widgets: WidgetComponent[]) {
  const registry = useWidgetRegistry()
  
  useMemo(() => {
    widgets.forEach(widget => registry.register(widget))
    
    // Cleanup function
    return () => {
      widgets.forEach(widget => registry.unregister(widget.definition.id))
    }
  }, [registry, widgets])
}

export default registryInstance