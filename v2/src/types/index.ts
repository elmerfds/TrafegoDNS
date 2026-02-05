/**
 * Core type definitions for TrafegoDNS v2
 */

// DNS Record Types
export type DNSRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS';

export interface DNSRecord {
  id?: string;
  type: DNSRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  weight?: number;
  port?: number;
  flags?: number;
  tag?: string;
  comment?: string;
  providerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DNSRecordCreateInput {
  type: DNSRecordType;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  weight?: number;
  port?: number;
  flags?: number;
  tag?: string;
}

export interface DNSRecordUpdateInput {
  type?: DNSRecordType;
  name?: string;
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  weight?: number;
  port?: number;
  flags?: number;
  tag?: string;
}

// Provider Types
export type ProviderType = 'cloudflare' | 'digitalocean' | 'route53' | 'technitium' | 'adguard' | 'pihole';

export interface ProviderConfig {
  id?: string;
  name: string;
  type: ProviderType;
  isDefault: boolean;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CloudflareCredentials {
  apiToken: string;
  zoneId?: string;
  zoneName: string;
  accountId?: string;
}

export interface DigitalOceanCredentials {
  apiToken: string;
  domain: string;
}

export interface Route53Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  hostedZoneId?: string;
  zoneName: string;
}

export interface TechnitiumCredentials {
  url: string;
  authMethod: 'token' | 'session';
  apiToken?: string;
  username?: string;
  password?: string;
  zone: string;
}

export interface AdGuardCredentials {
  url: string;
  username: string;
  password: string;
  domain?: string; // Optional domain filter
}

export interface PiHoleCredentials {
  url: string;
  password: string;
  domain?: string; // Optional domain filter
}

// Tunnel Types (Cloudflare)
export interface Tunnel {
  id?: string;
  providerId: string;
  tunnelId: string;
  name: string;
  status: 'active' | 'inactive' | 'degraded';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TunnelIngressRule {
  id?: string;
  tunnelId: string;
  hostname: string;
  service: string;
  path?: string;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Webhook Types
export type WebhookEventType =
  | 'dns.record.created'
  | 'dns.record.updated'
  | 'dns.record.deleted'
  | 'dns.record.orphaned'
  | 'tunnel.created'
  | 'tunnel.deployed'
  | 'system.sync.completed'
  | 'system.error';

export interface Webhook {
  id?: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WebhookDelivery {
  id?: string;
  webhookId: string;
  event: WebhookEventType;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  attempts: number;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  createdAt?: Date;
}

// User and Auth Types
export type UserRole = 'admin' | 'user' | 'readonly';

export interface User {
  id?: string;
  username: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ApiKey {
  id?: string;
  userId?: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  permissions: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt?: Date;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// Audit Log Types
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'bulk_delete'
  | 'login'
  | 'logout'
  | 'sync'
  | 'deploy';

export interface AuditLog {
  id?: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: Date;
}

// Settings Types
export interface Setting {
  key: string;
  value: string;
  description?: string;
  updatedAt?: Date;
}

// Event Types
export interface EventPayload {
  timestamp: Date;
  source: string;
  data: Record<string, unknown>;
}

export interface DNSRecordEventPayload extends EventPayload {
  data: {
    record: DNSRecord;
    providerId: string;
    action: 'created' | 'updated' | 'deleted';
  };
}

export interface TunnelEventPayload extends EventPayload {
  data: {
    tunnel: Tunnel;
    action: 'created' | 'deployed' | 'deleted';
  };
}

export interface SyncEventPayload extends EventPayload {
  data: {
    providerId: string;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsDeleted: number;
    errors: string[];
  };
}

// Container Types
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  labels: Record<string, string>;
  state: 'running' | 'stopped' | 'paused';
  createdAt: Date;
}

export interface ContainerLabels {
  [key: string]: string;
}

// Traefik Types
export interface TraefikRouter {
  name: string;
  entryPoints: string[];
  rule: string;
  service: string;
  tls?: {
    certResolver?: string;
  };
}

export interface TraefikService {
  name: string;
  loadBalancer: {
    servers: Array<{ url: string }>;
  };
}

// API Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Configuration Types
export interface AppConfig {
  operationMode: 'traefik' | 'direct';
  logLevel: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  dataDir: string;
  databasePath: string;
  apiPort: number;
  apiHost: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
  pollInterval: number;
  cleanupOrphaned: boolean;
  cleanupGracePeriod: number;
  webhookRetryAttempts: number;
  webhookRetryDelay: number;
}

export interface TraefikConfig {
  apiUrl: string;
  apiUsername?: string;
  apiPassword?: string;
  labelPrefix: string;
}

export interface DockerConfig {
  socketPath: string;
  watchEvents: boolean;
  labelPrefix: string;
}

export interface DNSDefaults {
  recordType: DNSRecordType;
  ttl: number;
  proxied: boolean;
  manage: boolean;
}

/**
 * Per-record-type default settings
 * Used for provider-specific overrides
 */
export interface RecordTypeDefaults {
  content?: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
}

/**
 * Provider default settings structure
 * Stored in providers.settings.defaults JSON field
 */
export interface ProviderDefaults {
  /** Default DNS record type for this provider */
  recordType?: DNSRecordType;
  /** Default content for all record types (if not overridden per-type) */
  content?: string;
  /** Default TTL for all record types */
  ttl?: number;
  /** Default proxied setting (Cloudflare only) */
  proxied?: boolean;
  /** Override public IPv4 for A records (uses global if not set) */
  publicIp?: string;
  /** Override public IPv6 for AAAA records (uses global if not set) */
  publicIpv6?: string;
  /** Per-record-type overrides */
  byType?: Partial<Record<DNSRecordType, RecordTypeDefaults>>;
}

/**
 * Extended provider settings structure
 * This is what gets stored in providers.settings JSON field
 */
export interface ProviderSettingsData {
  /** Provider-specific settings (varies by provider type) */
  [key: string]: unknown;
  /** Default record settings for this provider */
  defaults?: ProviderDefaults;
}

/** Source of a resolved setting value */
export type SettingSource = 'provider-type' | 'provider' | 'global' | 'env' | 'builtin' | 'auto';

/**
 * Resolved default settings for a record
 * Result of the settings resolution hierarchy
 */
export interface ResolvedRecordDefaults {
  recordType: DNSRecordType;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
  /** Track where each value came from for debugging/UI */
  source: {
    recordType: SettingSource;
    content: SettingSource;
    ttl: SettingSource;
    proxied: SettingSource;
  };
}
