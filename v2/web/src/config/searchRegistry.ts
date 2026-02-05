/**
 * Central Search Registry
 * Defines all searchable items for the global command palette
 */

export type SearchCategory =
  | 'navigation'   // Page navigation
  | 'settings'     // Settings items
  | 'actions'      // Quick actions
  | 'dns'          // DNS records (dynamic)
  | 'help';        // Documentation links

export interface SearchableItem {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  category: SearchCategory;
  route: string;
  /** Element ID for spotlight highlighting */
  elementId?: string;
  /** Lucide icon name */
  icon?: string;
  /** Restrict to admin users */
  adminOnly?: boolean;
  /** Settings tab to open */
  settingsTab?: string;
}

/**
 * Navigation items - pages in the app
 */
const NAVIGATION_ITEMS: SearchableItem[] = [
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    description: 'View system overview and statistics',
    category: 'navigation',
    route: '/',
    icon: 'LayoutDashboard',
  },
  {
    id: 'nav-dns',
    label: 'DNS Records',
    description: 'Manage DNS records across providers',
    category: 'navigation',
    route: '/dns',
    icon: 'Globe',
  },
  {
    id: 'nav-providers',
    label: 'Providers',
    description: 'Configure DNS providers',
    category: 'navigation',
    route: '/providers',
    icon: 'Server',
  },
  {
    id: 'nav-tunnels',
    label: 'Tunnels',
    description: 'Manage Cloudflare tunnels',
    category: 'navigation',
    route: '/tunnels',
    icon: 'Cable',
  },
  {
    id: 'nav-webhooks',
    label: 'Webhooks',
    description: 'Configure webhook notifications',
    category: 'navigation',
    route: '/webhooks',
    icon: 'Webhook',
  },
  {
    id: 'nav-settings',
    label: 'Settings',
    description: 'Application settings',
    category: 'navigation',
    route: '/settings',
    icon: 'Settings',
  },
  {
    id: 'nav-users',
    label: 'Users',
    description: 'Manage users and permissions',
    category: 'navigation',
    route: '/users',
    icon: 'Users',
    adminOnly: true,
  },
  {
    id: 'nav-logs',
    label: 'Audit Logs',
    description: 'View system audit logs',
    category: 'navigation',
    route: '/logs',
    icon: 'FileText',
  },
  {
    id: 'nav-api-docs',
    label: 'API Reference',
    description: 'API documentation',
    category: 'navigation',
    route: '/api-docs',
    icon: 'BookOpen',
  },
];

/**
 * Settings items - individual settings with spotlight support
 */
const SETTINGS_ITEMS: SearchableItem[] = [
  // General settings
  {
    id: 'setting-operation_mode',
    label: 'Operation Mode',
    description: 'How TrafegoDNS discovers hostnames (traefik or direct)',
    keywords: ['traefik', 'direct', 'mode'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-operation_mode',
  },
  {
    id: 'setting-log_level',
    label: 'Log Level',
    description: 'Logging verbosity (error, warn, info, debug, trace)',
    keywords: ['logging', 'verbosity', 'debug'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-log_level',
  },
  {
    id: 'setting-poll_interval',
    label: 'Poll Interval',
    description: 'How often to check for hostname changes (milliseconds)',
    keywords: ['polling', 'frequency', 'check'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-poll_interval',
  },
  {
    id: 'setting-public_ip',
    label: 'Public IP Override',
    description: 'Override detected public IPv4 address',
    keywords: ['ipv4', 'ip address'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-public_ip',
  },
  {
    id: 'setting-public_ipv6',
    label: 'Public IPv6 Override',
    description: 'Override detected public IPv6 address',
    keywords: ['ipv6', 'ip address'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-public_ipv6',
  },
  {
    id: 'setting-ip_refresh_interval',
    label: 'IP Refresh Interval',
    description: 'How often to refresh public IP (milliseconds)',
    keywords: ['ip detection', 'refresh'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'general',
    elementId: 'setting-ip_refresh_interval',
  },

  // DNS settings
  {
    id: 'setting-dns_default_type',
    label: 'Default Record Type',
    description: 'Default DNS record type (A, AAAA, CNAME)',
    keywords: ['record type', 'dns type'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_type',
  },
  {
    id: 'setting-dns_default_ttl_override',
    label: 'Override TTL',
    description: 'Use global TTL for all records',
    keywords: ['ttl override'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_ttl_override',
  },
  {
    id: 'setting-dns_default_ttl',
    label: 'Default TTL',
    description: 'Time to live for DNS records (seconds)',
    keywords: ['time to live', 'cache'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_ttl',
  },
  {
    id: 'setting-dns_default_proxied',
    label: 'Default Proxied',
    description: 'Enable Cloudflare proxy by default',
    keywords: ['cloudflare', 'proxy', 'orange cloud'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_proxied',
  },
  {
    id: 'setting-dns_default_manage',
    label: 'Auto-Manage Records',
    description: 'Automatically manage hostnames without labels',
    keywords: ['auto manage', 'automatic'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_manage',
  },
  {
    id: 'setting-dns_default_content',
    label: 'Default Content',
    description: 'Default record content/value',
    keywords: ['record content', 'value'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_default_content',
  },
  {
    id: 'setting-dns_routing_mode',
    label: 'DNS Routing Mode',
    description: 'How records are routed to providers',
    keywords: ['routing', 'provider selection'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_routing_mode',
  },
  {
    id: 'setting-dns_multi_provider_same_zone',
    label: 'Multi-Provider Same Zone',
    description: 'Allow multiple providers for the same zone',
    keywords: ['multi provider', 'same zone'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'dns',
    elementId: 'setting-dns_multi_provider_same_zone',
  },

  // Cleanup settings
  {
    id: 'setting-cleanup_orphaned',
    label: 'Cleanup Orphaned Records',
    description: 'Automatically remove orphaned DNS records',
    keywords: ['orphan', 'cleanup', 'delete'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'cleanup',
    elementId: 'setting-cleanup_orphaned',
  },
  {
    id: 'setting-cleanup_grace_period',
    label: 'Cleanup Grace Period',
    description: 'Minutes to wait before deleting orphaned records',
    keywords: ['grace period', 'orphan timeout'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'cleanup',
    elementId: 'setting-cleanup_grace_period',
  },

  // Traefik settings
  {
    id: 'setting-traefik_api_url',
    label: 'Traefik API URL',
    description: 'Traefik API endpoint URL',
    keywords: ['traefik', 'api', 'url'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'integrations',
    elementId: 'setting-traefik_api_url',
  },
  {
    id: 'setting-traefik_label_prefix',
    label: 'Traefik Label Prefix',
    description: 'Prefix for Traefik labels',
    keywords: ['traefik', 'label', 'prefix'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'integrations',
    elementId: 'setting-traefik_label_prefix',
  },

  // Docker settings
  {
    id: 'setting-docker_socket',
    label: 'Docker Socket',
    description: 'Path to Docker socket',
    keywords: ['docker', 'socket', 'path'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'integrations',
    elementId: 'setting-docker_socket',
  },
  {
    id: 'setting-watch_docker_events',
    label: 'Watch Docker Events',
    description: 'Listen to Docker events for real-time updates',
    keywords: ['docker', 'events', 'watch'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'integrations',
    elementId: 'setting-watch_docker_events',
  },
  {
    id: 'setting-dns_label_prefix',
    label: 'DNS Label Prefix',
    description: 'Prefix for DNS labels on containers',
    keywords: ['dns', 'label', 'prefix'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'integrations',
    elementId: 'setting-dns_label_prefix',
  },

  // Webhook settings
  {
    id: 'setting-webhook_retry_attempts',
    label: 'Webhook Retry Attempts',
    description: 'Number of retry attempts for failed webhooks',
    keywords: ['webhook', 'retry', 'attempts'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'webhooks',
    elementId: 'setting-webhook_retry_attempts',
  },
  {
    id: 'setting-webhook_retry_delay',
    label: 'Webhook Retry Delay',
    description: 'Delay between webhook retry attempts (ms)',
    keywords: ['webhook', 'retry', 'delay'],
    category: 'settings',
    route: '/settings',
    settingsTab: 'webhooks',
    elementId: 'setting-webhook_retry_delay',
  },
];

/**
 * Quick action items
 */
const ACTION_ITEMS: SearchableItem[] = [
  {
    id: 'action-sync-dns',
    label: 'Sync DNS Records',
    description: 'Force sync DNS records with providers',
    category: 'actions',
    route: '/dns',
    icon: 'RefreshCw',
    keywords: ['sync', 'refresh', 'update'],
  },
  {
    id: 'action-create-record',
    label: 'Create DNS Record',
    description: 'Create a new DNS record',
    category: 'actions',
    route: '/dns',
    icon: 'Plus',
    keywords: ['new', 'add', 'create'],
  },
  {
    id: 'action-add-provider',
    label: 'Add Provider',
    description: 'Add a new DNS provider',
    category: 'actions',
    route: '/providers',
    icon: 'Plus',
    keywords: ['new', 'add', 'cloudflare', 'digitalocean'],
  },
  {
    id: 'action-create-tunnel',
    label: 'Create Tunnel',
    description: 'Create a new Cloudflare tunnel',
    category: 'actions',
    route: '/tunnels',
    icon: 'Plus',
    keywords: ['new', 'add', 'cloudflare'],
  },
  {
    id: 'action-add-webhook',
    label: 'Add Webhook',
    description: 'Add a new webhook notification',
    category: 'actions',
    route: '/webhooks',
    icon: 'Plus',
    keywords: ['new', 'add', 'notification'],
  },
  {
    id: 'action-view-logs',
    label: 'View Audit Logs',
    description: 'View recent system activity',
    category: 'actions',
    route: '/logs',
    icon: 'FileText',
    keywords: ['audit', 'history', 'activity'],
  },
];

/**
 * Help/documentation items
 */
const HELP_ITEMS: SearchableItem[] = [
  {
    id: 'help-api-docs',
    label: 'API Documentation',
    description: 'View API reference documentation',
    category: 'help',
    route: '/api-docs',
    icon: 'BookOpen',
    keywords: ['api', 'docs', 'reference', 'endpoints'],
  },
];

/**
 * Complete search registry
 */
export const SEARCH_REGISTRY: SearchableItem[] = [
  ...NAVIGATION_ITEMS,
  ...SETTINGS_ITEMS,
  ...ACTION_ITEMS,
  ...HELP_ITEMS,
];

/**
 * Category display names and order
 */
export const CATEGORY_CONFIG: Record<SearchCategory, { label: string; order: number }> = {
  navigation: { label: 'Navigation', order: 1 },
  actions: { label: 'Quick Actions', order: 2 },
  dns: { label: 'DNS Records', order: 3 },
  settings: { label: 'Settings', order: 4 },
  help: { label: 'Help', order: 5 },
};

/**
 * Simple fuzzy search function
 */
export function searchItems(query: string, items: SearchableItem[], isAdmin: boolean): SearchableItem[] {
  if (!query.trim()) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const words = normalizedQuery.split(/\s+/);

  return items
    .filter((item) => {
      // Filter out admin-only items for non-admin users
      if (item.adminOnly && !isAdmin) {
        return false;
      }

      // Check if all words match something
      return words.every((word) => {
        const matchLabel = item.label.toLowerCase().includes(word);
        const matchDesc = item.description?.toLowerCase().includes(word);
        const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(word));
        return matchLabel || matchDesc || matchKeywords;
      });
    })
    .sort((a, b) => {
      // Prioritize exact label matches
      const aExact = a.label.toLowerCase() === normalizedQuery;
      const bExact = b.label.toLowerCase() === normalizedQuery;
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;

      // Then prioritize label starts with query
      const aStarts = a.label.toLowerCase().startsWith(normalizedQuery);
      const bStarts = b.label.toLowerCase().startsWith(normalizedQuery);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      // Then by category order
      const aOrder = CATEGORY_CONFIG[a.category].order;
      const bOrder = CATEGORY_CONFIG[b.category].order;
      if (aOrder !== bOrder) return aOrder - bOrder;

      // Finally alphabetically
      return a.label.localeCompare(b.label);
    });
}

/**
 * Group items by category
 */
export function groupByCategory(items: SearchableItem[]): Map<SearchCategory, SearchableItem[]> {
  const grouped = new Map<SearchCategory, SearchableItem[]>();

  for (const item of items) {
    const existing = grouped.get(item.category) || [];
    grouped.set(item.category, [...existing, item]);
  }

  // Sort by category order
  const sorted = new Map<SearchCategory, SearchableItem[]>();
  const categories = Array.from(grouped.keys()).sort(
    (a, b) => CATEGORY_CONFIG[a].order - CATEGORY_CONFIG[b].order
  );

  for (const cat of categories) {
    sorted.set(cat, grouped.get(cat)!);
  }

  return sorted;
}
