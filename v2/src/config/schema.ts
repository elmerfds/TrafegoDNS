/**
 * Zod schemas for configuration validation
 */
import { z } from 'zod';

// Log level schema
export const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']);

// Operation mode schema
export const operationModeSchema = z.enum(['traefik', 'direct']);

// DNS routing mode schema - controls how hostnames are routed to providers
export const dnsRoutingModeSchema = z.enum([
  'auto',              // Auto-route based on zone matching, skip if no match
  'auto-with-fallback', // Auto-route based on zone, fallback to default if no match
  'default-only',       // Always use default provider (v1 behavior)
]);

// DNS record type schema
export const dnsRecordTypeSchema = z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS']);

// Provider type schema
export const providerTypeSchema = z.enum(['cloudflare', 'digitalocean', 'route53', 'technitium']);

// Base application config schema
export const appConfigSchema = z.object({
  operationMode: operationModeSchema.default('traefik'),
  logLevel: logLevelSchema.default('info'),
  dataDir: z.string().default('/config/data'),
  databasePath: z.string().optional(),
  apiPort: z.coerce.number().int().min(1).max(65535).default(3000),
  apiHost: z.string().default('0.0.0.0'),
  jwtSecret: z.string().min(32).optional(),
  jwtExpiresIn: z.string().default('24h'),
  encryptionKey: z.string().length(32).optional(),
  pollInterval: z.coerce.number().int().min(1000).default(60000),
  cleanupOrphaned: z.coerce.boolean().default(false),
  cleanupGracePeriod: z.coerce.number().int().min(0).default(15),
  webhookRetryAttempts: z.coerce.number().int().min(0).max(10).default(3),
  webhookRetryDelay: z.coerce.number().int().min(1000).default(5000),
  // DNS routing mode: how hostnames are routed to providers
  // - auto: Route based on zone matching, skip if no zone matches
  // - auto-with-fallback: Route based on zone, use default provider if no match
  // - default-only: Always use default provider (v1 behavior)
  dnsRoutingMode: dnsRoutingModeSchema.default('auto-with-fallback'),
  // When multiple providers have the same zone, create records in ALL of them
  dnsMultiProviderSameZone: z.coerce.boolean().default(true),
});

// Traefik config schema
export const traefikConfigSchema = z.object({
  apiUrl: z.string().url().default('http://traefik:8080/api'),
  apiUsername: z.string().optional(),
  apiPassword: z.string().optional(),
  labelPrefix: z.string().default('traefik.'),
});

// Docker config schema
export const dockerConfigSchema = z.object({
  socketPath: z.string().default('/var/run/docker.sock'),
  watchEvents: z.coerce.boolean().default(true),
  labelPrefix: z.string().default('dns.'),
});

// DNS defaults schema
export const dnsDefaultsSchema = z.object({
  recordType: dnsRecordTypeSchema.default('CNAME'),
  ttl: z.coerce.number().int().min(1).default(1),
  proxied: z.coerce.boolean().default(true),
  manage: z.coerce.boolean().default(true),
});

// Provider-specific credential schemas
export const cloudflareCredentialsSchema = z.object({
  apiToken: z.string().min(1),
  zoneName: z.string().min(1),
  zoneId: z.string().optional(),
  accountId: z.string().optional(),
});

export const digitalOceanCredentialsSchema = z.object({
  apiToken: z.string().min(1),
  domain: z.string().min(1),
});

export const route53CredentialsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  region: z.string().default('us-east-1'),
  zoneName: z.string().min(1),
  hostedZoneId: z.string().optional(),
});

export const technitiumCredentialsSchema = z.object({
  url: z.string().url(),
  authMethod: z.enum(['token', 'session']),
  apiToken: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  zone: z.string().min(1),
}).refine(
  (data) => {
    if (data.authMethod === 'token') {
      return !!data.apiToken;
    }
    return !!data.username && !!data.password;
  },
  {
    message: 'API token required for token auth, username/password required for session auth',
  }
);

// DNS record schema for API input
export const dnsRecordInputSchema = z.object({
  type: dnsRecordTypeSchema,
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.coerce.number().int().min(1).optional(),
  proxied: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).optional(),
  weight: z.coerce.number().int().min(0).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  flags: z.coerce.number().int().min(0).max(255).optional(),
  tag: z.string().optional(),
});

// Provider config schema
export const providerConfigSchema = z.object({
  name: z.string().min(1).max(100),
  type: providerTypeSchema,
  isDefault: z.boolean().default(false),
  credentials: z.record(z.string()),
  settings: z.record(z.unknown()).default({}),
});

// Webhook config schema
export const webhookEventTypeSchema = z.enum([
  'dns.record.created',
  'dns.record.updated',
  'dns.record.deleted',
  'dns.record.orphaned',
  'tunnel.created',
  'tunnel.deployed',
  'system.sync.completed',
  'system.error',
]);

export const webhookConfigSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(webhookEventTypeSchema).min(1),
  enabled: z.boolean().default(true),
});

// Tunnel config schema
export const tunnelConfigSchema = z.object({
  name: z.string().min(1).max(100),
  providerId: z.string().uuid(),
});

// Tunnel ingress rule schema
export const tunnelIngressRuleSchema = z.object({
  hostname: z.string().min(1),
  service: z.string().min(1),
  path: z.string().optional(),
});

// User schemas
export const userRoleSchema = z.enum(['admin', 'user', 'readonly']);

export const userCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  role: userRoleSchema.default('user'),
});

export const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: userRoleSchema.optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default(['read']),
  expiresAt: z.coerce.date().optional(),
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Export types inferred from schemas
export type AppConfig = z.infer<typeof appConfigSchema>;
export type TraefikConfig = z.infer<typeof traefikConfigSchema>;
export type DockerConfig = z.infer<typeof dockerConfigSchema>;
export type DNSDefaults = z.infer<typeof dnsDefaultsSchema>;
export type DNSRoutingMode = z.infer<typeof dnsRoutingModeSchema>;
export type CloudflareCredentials = z.infer<typeof cloudflareCredentialsSchema>;
export type DigitalOceanCredentials = z.infer<typeof digitalOceanCredentialsSchema>;
export type Route53Credentials = z.infer<typeof route53CredentialsSchema>;
export type TechnitiumCredentials = z.infer<typeof technitiumCredentialsSchema>;
export type DNSRecordInput = z.infer<typeof dnsRecordInputSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type TunnelConfig = z.infer<typeof tunnelConfigSchema>;
export type TunnelIngressRule = z.infer<typeof tunnelIngressRuleSchema>;
export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;
