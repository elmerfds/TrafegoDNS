/**
 * Hook for managing system alerts
 * Handles fetching and monitoring system-wide alerts
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SystemAlert {
  id: string
  type: 'warning' | 'error' | 'info'
  title: string
  description: string
  timestamp: string
  count?: number
  actionUrl?: string
}

export function useSystemAlerts() {
  return useQuery({
    queryKey: ['system-alerts'],
    queryFn: async (): Promise<SystemAlert[]> => {
      try {
        // Get current orphaned records (not history)
        const response = await api.get('/dns/orphaned')
        const orphaned = response.data.data

        const alerts: SystemAlert[] = []

        // Add orphaned records alert if any exist
        if (orphaned && orphaned.records && orphaned.records.length > 0) {
          alerts.push({
            id: 'orphaned-records',
            type: 'warning',
            title: 'Orphaned DNS Records',
            description: `${orphaned.records.length} orphaned DNS records need attention`,
            timestamp: new Date().toISOString(),
            count: orphaned.records.length,
            actionUrl: '/orphaned-records'
          })
        }

        // Future: Add other system alerts here
        // - Port conflicts
        // - Configuration issues
        // - Service connectivity issues
        // - etc.

        return alerts
      } catch (error) {
        console.error('Failed to fetch system alerts:', error)
        return []
      }
    },
    refetchInterval: 60000, // Check every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  })
}

/**
 * Get total count of all alerts
 */
export function useSystemAlertsCount() {
  const { data: alerts = [] } = useSystemAlerts()
  
  return alerts.reduce((total, alert) => {
    return total + (alert.count || 1)
  }, 0)
}

/**
 * Check if there are any critical alerts
 */
export function useHasCriticalAlerts() {
  const { data: alerts = [] } = useSystemAlerts()
  
  return alerts.some(alert => alert.type === 'error')
}