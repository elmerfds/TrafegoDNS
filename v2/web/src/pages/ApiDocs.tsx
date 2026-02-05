/**
 * API Documentation Page
 * Reference documentation for the TrafegoDNS REST API
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react';
import { Badge } from '../components/common';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth?: 'required' | 'optional' | 'none';
  permission?: string;
  body?: Record<string, string>;
  response?: string;
}

interface EndpointGroup {
  name: string;
  description: string;
  basePath: string;
  endpoints: Endpoint[];
}

const apiGroups: EndpointGroup[] = [
  {
    name: 'Health',
    description: 'Health check endpoints for monitoring',
    basePath: '/api/v1',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Basic health check', auth: 'none' },
      { method: 'GET', path: '/health/ready', description: 'Readiness probe', auth: 'none' },
      { method: 'GET', path: '/health/live', description: 'Liveness probe', auth: 'none' },
    ],
  },
  {
    name: 'Authentication',
    description: 'User authentication and API key management',
    basePath: '/api/v1/auth',
    endpoints: [
      { method: 'POST', path: '/login', description: 'Login with username/password', auth: 'none', body: { username: 'string', password: 'string' } },
      { method: 'POST', path: '/logout', description: 'Logout current session', auth: 'required' },
      { method: 'GET', path: '/me', description: 'Get current user info', auth: 'required' },
      { method: 'PUT', path: '/profile', description: 'Update current user profile (email, password, avatar)', auth: 'required', body: { email: 'string?', password: 'string?', avatar: 'string?' } },
      { method: 'GET', path: '/api-keys', description: 'List API keys for current user', auth: 'required' },
      { method: 'POST', path: '/api-keys', description: 'Create new API key', auth: 'required', body: { name: 'string', permissions: 'string[]', expiresAt: 'string?' } },
      { method: 'DELETE', path: '/api-keys/:id', description: 'Revoke API key', auth: 'required' },
    ],
  },
  {
    name: 'DNS Records',
    description: 'Manage DNS records across all providers',
    basePath: '/api/v1/dns',
    endpoints: [
      { method: 'GET', path: '/records', description: 'List all DNS records (with filters)', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/records/export', description: 'Export records as JSON or CSV', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/records/:id', description: 'Get single DNS record', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/records', description: 'Create new DNS record', auth: 'required', permission: 'write', body: { providerId: 'string', type: 'string', name: 'string', content: 'string', ttl: 'number?' } },
      { method: 'POST', path: '/records/import', description: 'Import records from JSON', auth: 'required', permission: 'write' },
      { method: 'PUT', path: '/records/:id', description: 'Update DNS record', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/records/:id', description: 'Delete DNS record', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/records/sync', description: 'Sync records with provider', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/records/bulk-delete', description: 'Delete multiple records', auth: 'required', permission: 'write', body: { ids: 'string[]' } },
      { method: 'PATCH', path: '/records/:id/managed', description: 'Toggle managed status', auth: 'required', permission: 'write' },
      { method: 'PATCH', path: '/records/:id/extend-grace', description: 'Extend orphan grace period', auth: 'required', permission: 'write', body: { minutes: 'number (1-10080)' } },
    ],
  },
  {
    name: 'Providers',
    description: 'DNS provider configuration',
    basePath: '/api/v1/providers',
    endpoints: [
      { method: 'GET', path: '/types', description: 'List available provider types', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/types/:type', description: 'Get provider type info', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/', description: 'List all providers', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:id', description: 'Get single provider', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/', description: 'Create new provider', auth: 'required', permission: 'admin' },
      { method: 'POST', path: '/test', description: 'Test credentials before creating', auth: 'required', permission: 'admin' },
      { method: 'PUT', path: '/:id', description: 'Update provider', auth: 'required', permission: 'admin' },
      { method: 'DELETE', path: '/:id', description: 'Delete provider', auth: 'required', permission: 'admin' },
      { method: 'POST', path: '/:id/test', description: 'Test provider connection', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/:id/discover', description: 'Discover and import records', auth: 'required', permission: 'write' },
    ],
  },
  {
    name: 'Tunnels',
    description: 'Cloudflare Tunnel management',
    basePath: '/api/v1/tunnels',
    endpoints: [
      { method: 'GET', path: '/', description: 'List all tunnels', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:id', description: 'Get single tunnel', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/', description: 'Create new tunnel', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/:id', description: 'Delete tunnel', auth: 'required', permission: 'write' },
      { method: 'GET', path: '/:id/ingress', description: 'List ingress rules', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/:id/ingress', description: 'Add ingress rule', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/:id/ingress/:hostname', description: 'Remove ingress rule', auth: 'required', permission: 'write' },
      { method: 'PUT', path: '/:id/config', description: 'Update tunnel config', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/:id/deploy', description: 'Deploy tunnel', auth: 'required', permission: 'write' },
    ],
  },
  {
    name: 'Webhooks',
    description: 'Webhook configuration for event notifications',
    basePath: '/api/v1/webhooks',
    endpoints: [
      { method: 'GET', path: '/', description: 'List all webhooks', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:id', description: 'Get single webhook', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/', description: 'Create new webhook', auth: 'required', permission: 'write' },
      { method: 'PUT', path: '/:id', description: 'Update webhook', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/:id', description: 'Delete webhook', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/:id/test', description: 'Test webhook delivery', auth: 'required', permission: 'write' },
      { method: 'GET', path: '/:id/deliveries', description: 'Get delivery history', auth: 'required', permission: 'read' },
    ],
  },
  {
    name: 'Users',
    description: 'User management (admin only)',
    basePath: '/api/v1/users',
    endpoints: [
      { method: 'GET', path: '/', description: 'List all users', auth: 'required', permission: 'admin' },
      { method: 'GET', path: '/:id', description: 'Get single user', auth: 'required', permission: 'admin' },
      { method: 'POST', path: '/', description: 'Create new user', auth: 'required', permission: 'admin' },
      { method: 'PUT', path: '/:id', description: 'Update user', auth: 'required', permission: 'admin' },
      { method: 'DELETE', path: '/:id', description: 'Delete user', auth: 'required', permission: 'admin' },
    ],
  },
  {
    name: 'Settings',
    description: 'Application settings',
    basePath: '/api/v1/settings',
    endpoints: [
      { method: 'GET', path: '/schema', description: 'Get settings schema', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/categories', description: 'Get settings by category', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/', description: 'List all settings', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:key', description: 'Get single setting', auth: 'required', permission: 'read' },
      { method: 'PUT', path: '/:key', description: 'Update setting', auth: 'required', permission: 'admin' },
      { method: 'PUT', path: '/', description: 'Bulk update settings', auth: 'required', permission: 'admin' },
      { method: 'POST', path: '/:key/reset', description: 'Reset setting to default', auth: 'required', permission: 'admin' },
      { method: 'DELETE', path: '/:key', description: 'Delete setting', auth: 'required', permission: 'admin' },
    ],
  },
  {
    name: 'Audit Logs',
    description: 'Audit trail for all actions (admin only)',
    basePath: '/api/v1/audit',
    endpoints: [
      { method: 'GET', path: '/', description: 'List audit logs (paginated)', auth: 'required', permission: 'admin' },
      { method: 'GET', path: '/stats', description: 'Get audit statistics', auth: 'required', permission: 'admin' },
      { method: 'GET', path: '/:id', description: 'Get single audit log', auth: 'required', permission: 'admin' },
    ],
  },
  {
    name: 'Preserved Hostnames',
    description: 'Hostnames protected from cleanup',
    basePath: '/api/v1/preserved-hostnames',
    endpoints: [
      { method: 'GET', path: '/', description: 'List preserved hostnames', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:id', description: 'Get single preserved hostname', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/', description: 'Add preserved hostname', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/bulk-delete', description: 'Bulk delete preserved hostnames', auth: 'required', permission: 'write', body: { ids: 'string[]' } },
      { method: 'PUT', path: '/:id', description: 'Update preserved hostname', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/:id', description: 'Remove preserved hostname', auth: 'required', permission: 'write' },
    ],
  },
  {
    name: 'Hostname Overrides',
    description: 'Per-hostname settings that persist across syncs',
    basePath: '/api/v1/overrides',
    endpoints: [
      { method: 'GET', path: '/', description: 'List all overrides', auth: 'required', permission: 'read' },
      { method: 'GET', path: '/:id', description: 'Get single override', auth: 'required', permission: 'read' },
      { method: 'POST', path: '/', description: 'Create override', auth: 'required', permission: 'write' },
      { method: 'POST', path: '/bulk-delete', description: 'Bulk delete overrides', auth: 'required', permission: 'write', body: { ids: 'string[]' } },
      { method: 'POST', path: '/from-record', description: 'Create override from existing record', auth: 'required', permission: 'write' },
      { method: 'PUT', path: '/:id', description: 'Update override', auth: 'required', permission: 'write' },
      { method: 'DELETE', path: '/:id', description: 'Delete override', auth: 'required', permission: 'write' },
    ],
  },
  {
    name: 'User Preferences',
    description: 'Per-user UI preferences (table columns, view settings)',
    basePath: '/api/v1/preferences',
    endpoints: [
      { method: 'GET', path: '/', description: 'List all preferences for current user', auth: 'required' },
      { method: 'GET', path: '/:key', description: 'Get specific preference', auth: 'required' },
      { method: 'PUT', path: '/:key', description: 'Update preference', auth: 'required' },
      { method: 'DELETE', path: '/:key', description: 'Delete preference (reset to default)', auth: 'required' },
    ],
  },
  {
    name: 'Application Logs',
    description: 'Access application logs',
    basePath: '/api/v1',
    endpoints: [
      { method: 'GET', path: '/logs', description: 'Get application logs', auth: 'required' },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function EndpointRow({ endpoint, basePath }: { endpoint: Endpoint; basePath: string }) {
  const [copied, setCopied] = useState(false);
  const fullPath = `${basePath}${endpoint.path}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-3 py-3 px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg group">
      <span className={`px-2 py-1 text-xs font-bold rounded ${methodColors[endpoint.method]}`}>
        {endpoint.method}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-gray-900 dark:text-gray-100">{fullPath}</code>
          <button
            onClick={copyToClipboard}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy path"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{endpoint.description}</p>
        <div className="flex items-center gap-2 mt-2">
          {endpoint.auth === 'required' && (
            <Badge variant="default" size="sm">Auth Required</Badge>
          )}
          {endpoint.auth === 'none' && (
            <Badge variant="success" size="sm">Public</Badge>
          )}
          {endpoint.permission === 'admin' && (
            <Badge variant="error" size="sm">Admin Only</Badge>
          )}
          {endpoint.permission === 'write' && (
            <Badge variant="warning" size="sm">Write Permission</Badge>
          )}
          {endpoint.permission === 'read' && (
            <Badge variant="info" size="sm">Read Permission</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointGroupCard({ group }: { group: EndpointGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{group.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{group.description}</p>
          <code className="text-xs text-primary-600 dark:text-primary-400 mt-1">{group.basePath}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{group.endpoints.length} endpoints</span>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {group.endpoints.map((endpoint, index) => (
            <EndpointRow key={index} endpoint={endpoint} basePath={group.basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ApiDocsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">API Reference</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          REST API documentation for TrafegoDNS v2
        </p>
      </div>

      {/* Quick Info */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Start</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Base URL:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">/api/v1</code></p>
          <p><strong>Authentication:</strong> Bearer token in <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">Authorization</code> header or API key</p>
          <p><strong>Content-Type:</strong> <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">application/json</code></p>
        </div>
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Example Request:</p>
          <code className="text-sm text-gray-900 dark:text-gray-100 block">
            curl -H "Authorization: Bearer YOUR_TOKEN" \<br />
            &nbsp;&nbsp;http://localhost:3070/api/v1/dns/records
          </code>
        </div>
      </div>

      {/* Permission Levels */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Permission Levels</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <Badge variant="info" size="sm" className="mb-2">Read</Badge>
            <p className="text-gray-600 dark:text-gray-400">View data (all authenticated users)</p>
          </div>
          <div>
            <Badge variant="warning" size="sm" className="mb-2">Write</Badge>
            <p className="text-gray-600 dark:text-gray-400">Create, update, delete resources</p>
          </div>
          <div>
            <Badge variant="error" size="sm" className="mb-2">Admin</Badge>
            <p className="text-gray-600 dark:text-gray-400">System configuration and user management</p>
          </div>
        </div>
      </div>

      {/* Endpoint Groups */}
      <div className="space-y-4">
        {apiGroups.map((group) => (
          <EndpointGroupCard key={group.name} group={group} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
        <p>Need help? Check the <a href="https://github.com/elmerfds/TrafegoDNS" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 inline-flex items-center gap-1">GitHub repository <ExternalLink className="w-3 h-3" /></a></p>
      </div>
    </div>
  );
}
