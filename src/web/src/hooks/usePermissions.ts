import { useAuthStore } from '../store/authStore'
import { useMemo } from 'react'

// Permission definitions (matching backend)
export const PERMISSIONS = {
  // DNS Record Management
  DNS_VIEW: 'dns:view',
  DNS_CREATE: 'dns:create',
  DNS_UPDATE: 'dns:update',
  DNS_DELETE: 'dns:delete',
  DNS_FORCE_DELETE: 'dns:force_delete',
  
  // Container Management
  CONTAINER_VIEW: 'container:view',
  CONTAINER_SYNC: 'container:sync',
  
  // Hostname Management
  HOSTNAME_VIEW: 'hostname:view',
  HOSTNAME_CREATE: 'hostname:create',
  HOSTNAME_UPDATE: 'hostname:update',
  HOSTNAME_DELETE: 'hostname:delete',
  
  // Orphaned Records
  ORPHANED_VIEW: 'orphaned:view',
  ORPHANED_DELETE: 'orphaned:delete',
  ORPHANED_CLEANUP: 'orphaned:cleanup',
  ORPHANED_FORCE_DELETE: 'orphaned:force_delete',
  
  // User Management
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_UPDATE_OWN: 'user:update_own',
  
  // Configuration
  CONFIG_VIEW: 'config:view',
  CONFIG_UPDATE: 'config:update',
  
  // System Status
  STATUS_VIEW: 'status:view',
} as const

// Role permission mappings
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: Object.values(PERMISSIONS), // Admin has all permissions
  
  operator: [
    // DNS management
    PERMISSIONS.DNS_VIEW,
    PERMISSIONS.DNS_CREATE,
    PERMISSIONS.DNS_UPDATE,
    PERMISSIONS.DNS_DELETE,
    
    // Container operations
    PERMISSIONS.CONTAINER_VIEW,
    PERMISSIONS.CONTAINER_SYNC,
    
    // Hostname management
    PERMISSIONS.HOSTNAME_VIEW,
    PERMISSIONS.HOSTNAME_CREATE,
    PERMISSIONS.HOSTNAME_UPDATE,
    PERMISSIONS.HOSTNAME_DELETE,
    
    // Orphaned records (view and cleanup only)
    PERMISSIONS.ORPHANED_VIEW,
    PERMISSIONS.ORPHANED_DELETE,
    PERMISSIONS.ORPHANED_CLEANUP,
    
    // Limited user management (own profile only)
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_UPDATE_OWN,
    
    // Read-only config and status
    PERMISSIONS.CONFIG_VIEW,
    PERMISSIONS.STATUS_VIEW,
  ],
  
  viewer: [
    // View-only permissions
    PERMISSIONS.DNS_VIEW,
    PERMISSIONS.CONTAINER_VIEW,
    PERMISSIONS.HOSTNAME_VIEW,
    PERMISSIONS.ORPHANED_VIEW,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.CONFIG_VIEW,
    PERMISSIONS.STATUS_VIEW,
    
    // Own profile management
    PERMISSIONS.USER_UPDATE_OWN,
  ]
}

// UI Page access definitions
const PAGE_ACCESS: Record<string, string[]> = {
  '/': ['admin', 'operator', 'viewer'], // Dashboard
  '/dns': ['admin', 'operator', 'viewer'],
  '/containers': ['admin', 'operator', 'viewer'],
  '/hostnames': ['admin', 'operator', 'viewer'],
  '/orphaned': ['admin', 'operator', 'viewer'],
  '/users': ['admin'], // Admin only
  '/settings': ['admin'], // Admin only
  '/profile': ['admin', 'operator', 'viewer']
}

// UI Action visibility/enablement
const UI_ACTIONS: Record<string, string[]> = {
  // DNS Records page
  'dns.create': ['admin', 'operator'],
  'dns.edit': ['admin', 'operator'],
  'dns.delete': ['admin', 'operator'],
  
  // Containers page
  'container.sync': ['admin', 'operator'],
  
  // Hostnames page
  'hostname.create': ['admin', 'operator'],
  'hostname.edit': ['admin', 'operator'],
  'hostname.delete': ['admin', 'operator'],
  
  // Orphaned Records page
  'orphaned.delete': ['admin', 'operator'],
  'orphaned.cleanup': ['admin', 'operator'],
  'orphaned.forceDelete': ['admin'],
  
  // Users page
  'user.create': ['admin'],
  'user.edit': ['admin'],
  'user.delete': ['admin'],
  
  // Settings page
  'settings.update': ['admin']
}

export function usePermissions() {
  const { user } = useAuthStore()
  
  const permissions = useMemo(() => {
    const userRole = user?.role || 'viewer'
    return ROLE_PERMISSIONS[userRole] || []
  }, [user?.role])
  
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission)
  }
  
  const hasAnyPermission = (perms: string[]): boolean => {
    return perms.some(p => permissions.includes(p))
  }
  
  const hasAllPermissions = (perms: string[]): boolean => {
    return perms.every(p => permissions.includes(p))
  }
  
  const canAccessPage = (path: string): boolean => {
    const allowedRoles = PAGE_ACCESS[path]
    if (!allowedRoles) return true // If not defined, allow access
    return allowedRoles.includes(user?.role || 'viewer')
  }
  
  const canPerformAction = (action: string): boolean => {
    const allowedRoles = UI_ACTIONS[action]
    if (!allowedRoles) return false // If not defined, deny access
    return allowedRoles.includes(user?.role || 'viewer')
  }
  
  const isAdmin = (): boolean => {
    return user?.role === 'admin'
  }
  
  const isOperator = (): boolean => {
    return user?.role === 'operator'
  }
  
  const isViewer = (): boolean => {
    return user?.role === 'viewer' || !user?.role
  }
  
  const canEditOwnProfile = (userId: string): boolean => {
    return user?.id === userId || hasPermission(PERMISSIONS.USER_UPDATE)
  }
  
  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessPage,
    canPerformAction,
    isAdmin,
    isOperator,
    isViewer,
    canEditOwnProfile,
    user
  }
}