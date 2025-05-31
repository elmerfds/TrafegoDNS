/**
 * Permission definitions for role-based access control
 */

// Permission categories
const PERMISSIONS = {
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
  
  // Authentication
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_REFRESH: 'auth:refresh'
};

// Role permission mappings
const ROLE_PERMISSIONS = {
  admin: [
    // Admin has all permissions
    ...Object.values(PERMISSIONS)
  ],
  
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
    
    // Authentication
    PERMISSIONS.AUTH_LOGIN,
    PERMISSIONS.AUTH_LOGOUT,
    PERMISSIONS.AUTH_REFRESH
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
    
    // Authentication
    PERMISSIONS.AUTH_LOGIN,
    PERMISSIONS.AUTH_LOGOUT,
    PERMISSIONS.AUTH_REFRESH
  ]
};

// UI Page access definitions
const PAGE_ACCESS = {
  '/': ['admin', 'operator', 'viewer'], // Dashboard
  '/dns': ['admin', 'operator', 'viewer'],
  '/containers': ['admin', 'operator', 'viewer'],
  '/hostnames': ['admin', 'operator', 'viewer'],
  '/orphaned': ['admin', 'operator', 'viewer'],
  '/users': ['admin'], // Admin only
  '/settings': ['admin'], // Admin only
  '/profile': ['admin', 'operator', 'viewer']
};

// UI Action visibility/enablement
const UI_ACTIONS = {
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
};

/**
 * Check if a role has a specific permission
 */
function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Check if a role has any of the specified permissions
 */
function hasAnyPermission(role, permissions) {
  if (!role || !permissions || !Array.isArray(permissions)) return false;
  return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if a role has all of the specified permissions
 */
function hasAllPermissions(role, permissions) {
  if (!role || !permissions || !Array.isArray(permissions)) return false;
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Check if a role can access a specific page
 */
function canAccessPage(role, path) {
  if (!role || !path) return false;
  const allowedRoles = PAGE_ACCESS[path];
  if (!allowedRoles) return true; // If not defined, allow access
  return allowedRoles.includes(role);
}

/**
 * Check if a role can perform a UI action
 */
function canPerformAction(role, action) {
  if (!role || !action) return false;
  const allowedRoles = UI_ACTIONS[action];
  if (!allowedRoles) return false; // If not defined, deny access
  return allowedRoles.includes(role);
}

/**
 * Get all permissions for a role
 */
function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Get human-readable permission description
 */
function getPermissionDescription(permission) {
  const descriptions = {
    [PERMISSIONS.DNS_VIEW]: 'View DNS records',
    [PERMISSIONS.DNS_CREATE]: 'Create DNS records',
    [PERMISSIONS.DNS_UPDATE]: 'Update DNS records',
    [PERMISSIONS.DNS_DELETE]: 'Delete DNS records',
    [PERMISSIONS.DNS_FORCE_DELETE]: 'Force delete DNS records',
    [PERMISSIONS.CONTAINER_VIEW]: 'View containers',
    [PERMISSIONS.CONTAINER_SYNC]: 'Sync containers',
    [PERMISSIONS.HOSTNAME_VIEW]: 'View hostnames',
    [PERMISSIONS.HOSTNAME_CREATE]: 'Create hostnames',
    [PERMISSIONS.HOSTNAME_UPDATE]: 'Update hostnames',
    [PERMISSIONS.HOSTNAME_DELETE]: 'Delete hostnames',
    [PERMISSIONS.ORPHANED_VIEW]: 'View orphaned records',
    [PERMISSIONS.ORPHANED_DELETE]: 'Delete orphaned records',
    [PERMISSIONS.ORPHANED_CLEANUP]: 'Cleanup orphaned records',
    [PERMISSIONS.ORPHANED_FORCE_DELETE]: 'Force delete orphaned records',
    [PERMISSIONS.USER_VIEW]: 'View users',
    [PERMISSIONS.USER_CREATE]: 'Create users',
    [PERMISSIONS.USER_UPDATE]: 'Update users',
    [PERMISSIONS.USER_DELETE]: 'Delete users',
    [PERMISSIONS.USER_UPDATE_OWN]: 'Update own profile',
    [PERMISSIONS.CONFIG_VIEW]: 'View configuration',
    [PERMISSIONS.CONFIG_UPDATE]: 'Update configuration',
    [PERMISSIONS.STATUS_VIEW]: 'View system status',
    [PERMISSIONS.AUTH_LOGIN]: 'Login',
    [PERMISSIONS.AUTH_LOGOUT]: 'Logout',
    [PERMISSIONS.AUTH_REFRESH]: 'Refresh authentication'
  };
  return descriptions[permission] || permission;
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  PAGE_ACCESS,
  UI_ACTIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessPage,
  canPerformAction,
  getRolePermissions,
  getPermissionDescription
};