/**
 * Database schema definitions using Drizzle ORM
 */
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Common timestamp columns
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
};

/**
 * DNS Providers table
 * Stores provider configurations with encrypted credentials
 */
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type', { enum: ['cloudflare', 'digitalocean', 'route53', 'technitium', 'adguard', 'pihole', 'rfc2136'] }).notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  credentials: text('credentials').notNull(), // Encrypted JSON
  settings: text('settings').notNull().default('{}'), // JSON
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * DNS Records table
 * Tracks all managed DNS records
 */
export const dnsRecords = sqliteTable('dns_records', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  externalId: text('external_id'), // Provider's record ID
  type: text('type', { enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] }).notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  ttl: integer('ttl').notNull().default(1),
  proxied: integer('proxied', { mode: 'boolean' }),
  priority: integer('priority'),
  weight: integer('weight'),
  port: integer('port'),
  flags: integer('flags'),
  tag: text('tag'),
  comment: text('comment'),
  source: text('source', { enum: ['traefik', 'direct', 'api', 'managed', 'discovered'] }).notNull().default('traefik'),
  managed: integer('managed', { mode: 'boolean' }).notNull().default(true), // Whether TrafegoDNS owns this record
  orphanedAt: integer('orphaned_at', { mode: 'timestamp' }),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  ...timestamps,
});

/**
 * Cloudflare Tunnels table
 */
export const tunnels = sqliteTable('tunnels', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  tunnelId: text('tunnel_id').notNull(), // Cloudflare tunnel ID
  name: text('name').notNull(),
  secret: text('secret'), // Encrypted tunnel secret
  status: text('status', { enum: ['active', 'inactive', 'degraded', 'deleted'] }).notNull().default('inactive'),
  connectorId: text('connector_id'),
  ...timestamps,
});

/**
 * Tunnel Ingress Rules table
 */
export const tunnelIngressRules = sqliteTable('tunnel_ingress_rules', {
  id: text('id').primaryKey(),
  tunnelId: text('tunnel_id').notNull().references(() => tunnels.id, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  service: text('service').notNull(),
  path: text('path'),
  originRequest: text('origin_request'), // JSON
  order: integer('order').notNull().default(0),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * Webhooks table
 */
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'), // Encrypted
  events: text('events').notNull(), // JSON array
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * Webhook Deliveries table
 * Tracks delivery attempts and status
 */
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: text('payload').notNull(), // JSON
  statusCode: integer('status_code'),
  response: text('response'),
  attempts: integer('attempts').notNull().default(0),
  nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  ...timestamps,
});

/**
 * Users table
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user', 'readonly'] }).notNull().default('user'),
  avatar: text('avatar'), // Base64 data URI or URL
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  ...timestamps,
});

/**
 * API Keys table
 */
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  permissions: text('permissions').notNull().default('["read"]'), // JSON array
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  ...timestamps,
});

/**
 * Audit Logs table
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action', { enum: ['create', 'update', 'delete', 'bulk_delete', 'login', 'logout', 'sync', 'deploy', 'orphan', 'import', 'export'] }).notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  details: text('details').notNull().default('{}'), // JSON
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps,
});

/**
 * Settings table (key-value store)
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  ...timestamps,
});

/**
 * Container Labels Cache table
 * Caches Docker container labels for quick lookups
 */
export const containerLabels = sqliteTable('container_labels', {
  containerId: text('container_id').primaryKey(),
  containerName: text('container_name').notNull(),
  labels: text('labels').notNull().default('{}'), // JSON
  state: text('state', { enum: ['running', 'stopped', 'paused'] }).notNull().default('running'),
  ...timestamps,
});

/**
 * Managed Hostnames table
 * Hostnames that should always be managed regardless of container state
 */
export const managedHostnames = sqliteTable('managed_hostnames', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull().unique(),
  providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  recordType: text('record_type', { enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] }).notNull(),
  content: text('content').notNull(),
  ttl: integer('ttl').notNull().default(1),
  proxied: integer('proxied', { mode: 'boolean' }),
  priority: integer('priority'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * Preserved Hostnames table
 * Hostnames that should never be deleted during cleanup
 */
export const preservedHostnames = sqliteTable('preserved_hostnames', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull().unique(),
  reason: text('reason'),
  ...timestamps,
});

/**
 * Hostname Overrides table
 * Per-hostname settings that override global/provider defaults during sync
 * Useful for: manually edited records, specific apps that need proxied=false, etc.
 */
export const hostnameOverrides = sqliteTable('hostname_overrides', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull().unique(), // Exact hostname or pattern (*.example.com)
  proxied: integer('proxied', { mode: 'boolean' }), // Nullable - only override if set
  ttl: integer('ttl'), // Nullable
  recordType: text('record_type', { enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] }), // Nullable
  content: text('content'), // Nullable
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }), // Nullable - override provider routing
  reason: text('reason'), // Why this override exists (e.g., "Plex needs direct IP")
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

// Export types inferred from schema
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type DNSRecord = typeof dnsRecords.$inferSelect;
export type NewDNSRecord = typeof dnsRecords.$inferInsert;

export type Tunnel = typeof tunnels.$inferSelect;
export type NewTunnel = typeof tunnels.$inferInsert;

export type TunnelIngressRule = typeof tunnelIngressRules.$inferSelect;
export type NewTunnelIngressRule = typeof tunnelIngressRules.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type ContainerLabel = typeof containerLabels.$inferSelect;
export type NewContainerLabel = typeof containerLabels.$inferInsert;

export type ManagedHostname = typeof managedHostnames.$inferSelect;
export type NewManagedHostname = typeof managedHostnames.$inferInsert;

export type PreservedHostname = typeof preservedHostnames.$inferSelect;
export type NewPreservedHostname = typeof preservedHostnames.$inferInsert;

export type HostnameOverride = typeof hostnameOverrides.$inferSelect;
export type NewHostnameOverride = typeof hostnameOverrides.$inferInsert;

/**
 * User Preferences table
 * Stores per-user UI preferences like table column visibility, sort order, etc.
 */
export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  preferenceKey: text('preference_key').notNull(), // e.g., 'dns_records_view', 'providers_view'
  value: text('value').notNull(), // JSON stringified preference object
  ...timestamps,
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
