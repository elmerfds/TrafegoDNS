/**
 * API Validation Schemas
 * Zod schemas for request validation
 */
import { z } from 'zod';

/**
 * Safe URL validator that prevents SSRF attacks
 * Blocks: localhost, private IPs, link-local addresses
 */
export const safeUrlSchema = z.string().url().refine(
  (urlString) => {
    try {
      const url = new URL(urlString);
      const hostname = url.hostname.toLowerCase();

      // Block localhost variations
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return false;
      }

      // Block common internal hostnames
      if (hostname === 'host.docker.internal' || hostname === 'kubernetes.default') {
        return false;
      }

      // Block 0.0.0.0
      if (hostname === '0.0.0.0') {
        return false;
      }

      // Block private IPv4 ranges
      const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = hostname.match(ipv4Pattern);
      if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        // 10.0.0.0/8
        if (a === 10) return false;
        // 172.16.0.0/12
        if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false;
        // 192.168.0.0/16
        if (a === 192 && b === 168) return false;
        // 169.254.0.0/16 (link-local)
        if (a === 169 && b === 254) return false;
      }

      // Only allow http and https
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  },
  { message: 'URL must be a valid public HTTP(S) URL. Private IPs and localhost are not allowed.' }
);

// Common schemas
export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// DNS Record schemas
export const dnsRecordTypeSchema = z.enum([
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'SRV',
  'CAA',
  'NS',
]);

export const createDnsRecordSchema = z.object({
  type: dnsRecordTypeSchema,
  name: z.string().min(1).max(255),
  content: z.string().min(1),
  ttl: z.number().int().positive().default(1),
  proxied: z.boolean().optional(),
  priority: z.number().int().nonnegative().optional(),
  weight: z.number().int().nonnegative().optional(),
  port: z.number().int().positive().optional(),
  flags: z.number().int().nonnegative().optional(),
  tag: z.string().optional(),
  comment: z.string().max(500).optional(),
});

export const updateDnsRecordSchema = createDnsRecordSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const dnsRecordFilterSchema = z.object({
  type: dnsRecordTypeSchema.optional(),
  name: z.string().optional(),
  content: z.string().optional(),
  providerId: z.string().uuid().optional(),
  source: z.enum(['traefik', 'direct', 'api', 'managed']).optional(),
  search: z.string().optional(), // General search across name and content
}).merge(paginationSchema);

// Provider schemas
export const providerTypeSchema = z.enum([
  'cloudflare',
  'digitalocean',
  'route53',
  'technitium',
]);

export const createProviderSchema = z.object({
  name: z.string().min(1).max(100),
  type: providerTypeSchema,
  credentials: z.record(z.string()),
  settings: z.record(z.unknown()).optional(),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  credentials: z.record(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

// Tunnel schemas
export const createTunnelSchema = z.object({
  name: z.string().min(1).max(100),
  secret: z.string().optional(),
});

export const tunnelIngressRuleSchema = z.object({
  hostname: z.string().min(1).max(255),
  service: z.string().min(1),
  path: z.string().optional(),
  originRequest: z.object({
    connectTimeout: z.number().optional(),
    tlsTimeout: z.number().optional(),
    tcpKeepAlive: z.number().optional(),
    noHappyEyeballs: z.boolean().optional(),
    keepAliveConnections: z.number().optional(),
    keepAliveTimeout: z.number().optional(),
    httpHostHeader: z.string().optional(),
    originServerName: z.string().optional(),
    noTLSVerify: z.boolean().optional(),
    disableChunkedEncoding: z.boolean().optional(),
  }).optional(),
});

export const updateTunnelConfigSchema = z.object({
  ingress: z.array(tunnelIngressRuleSchema),
});

// Webhook schemas
export const webhookEventSchema = z.enum([
  'dns.record.created',
  'dns.record.updated',
  'dns.record.deleted',
  'dns.record.orphaned',
  'tunnel.created',
  'tunnel.deployed',
  'tunnel.deleted',
  'system.sync.completed',
  'system.error',
]);

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: safeUrlSchema, // SSRF-protected URL validation
  secret: z.string().min(16).max(256), // Require webhook secret for security
  events: z.array(webhookEventSchema).min(1),
  enabled: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: safeUrlSchema.optional(), // SSRF-protected URL validation
  secret: z.string().min(16).max(256).optional(),
  events: z.array(webhookEventSchema).min(1).optional(),
  enabled: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

/**
 * Secure password schema with complexity requirements
 * - Minimum 12 characters (OWASP recommendation)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const securePasswordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    (password) => /[A-Z]/.test(password),
    { message: 'Password must contain at least one uppercase letter' }
  )
  .refine(
    (password) => /[a-z]/.test(password),
    { message: 'Password must contain at least one lowercase letter' }
  )
  .refine(
    (password) => /[0-9]/.test(password),
    { message: 'Password must contain at least one number' }
  )
  .refine(
    (password) => /[^A-Za-z0-9]/.test(password),
    { message: 'Password must contain at least one special character' }
  );

// User schemas
export const createUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  password: securePasswordSchema,
  role: z.enum(['admin', 'user', 'readonly']).default('user'),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: securePasswordSchema.optional(),
  role: z.enum(['admin', 'user', 'readonly']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// API Key schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).default(['read']),
  expiresAt: z.string().datetime().optional(),
});

// Settings schemas
export const updateSettingSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});

export const bulkSettingsSchema = z.record(z.string());

// Type exports
export type CreateDnsRecordInput = z.infer<typeof createDnsRecordSchema>;
export type UpdateDnsRecordInput = z.infer<typeof updateDnsRecordSchema>;
export type DnsRecordFilter = z.infer<typeof dnsRecordFilterSchema>;

export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;

export type CreateTunnelInput = z.infer<typeof createTunnelSchema>;
export type TunnelIngressRuleInput = z.infer<typeof tunnelIngressRuleSchema>;
export type UpdateTunnelConfigInput = z.infer<typeof updateTunnelConfigSchema>;

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
