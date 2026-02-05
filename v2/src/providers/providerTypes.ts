/**
 * Provider type definitions with features and defaults
 */

export interface ProviderTypeInfo {
  type: string;
  name: string;
  features: {
    proxied: boolean;
    ttlMin: number;
    ttlMax: number;
    ttlDefault: number;
    supportedTypes: string[];
    batchOperations: boolean;
  };
  requiredCredentials: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required: boolean;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
}

/**
 * Provider type configurations
 * These define the capabilities and defaults for each provider type
 */
export const PROVIDER_TYPES: Record<string, ProviderTypeInfo> = {
  cloudflare: {
    type: 'cloudflare',
    name: 'Cloudflare',
    features: {
      proxied: true,
      ttlMin: 1, // 1 = auto in Cloudflare
      ttlMax: 86400,
      ttlDefault: 1, // Auto
      supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
      batchOperations: true,
    },
    requiredCredentials: [
      { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Cloudflare API token' },
      { key: 'zoneId', label: 'Zone ID', type: 'text', required: true, placeholder: 'e.g., abc123...' },
      { key: 'zoneName', label: 'Zone Name (Domain)', type: 'text', required: true, placeholder: 'e.g., example.com' },
    ],
  },
  digitalocean: {
    type: 'digitalocean',
    name: 'DigitalOcean',
    features: {
      proxied: false,
      ttlMin: 30,
      ttlMax: 86400,
      ttlDefault: 300, // 5 minutes - reasonable default
      supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
      batchOperations: false,
    },
    requiredCredentials: [
      { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'DigitalOcean API token' },
      { key: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'e.g., example.com' },
    ],
  },
  technitium: {
    type: 'technitium',
    name: 'Technitium DNS',
    features: {
      proxied: false,
      ttlMin: 1,
      ttlMax: 604800, // 7 days
      ttlDefault: 3600, // 1 hour
      supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
      batchOperations: false,
    },
    requiredCredentials: [
      { key: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'e.g., http://technitium:5380' },
      { key: 'zone', label: 'Zone', type: 'text', required: true, placeholder: 'e.g., example.com' },
      {
        key: 'authMethod',
        label: 'Auth Method',
        type: 'select',
        required: true,
        options: [
          { value: 'token', label: 'API Token' },
          { value: 'session', label: 'Username/Password' },
        ],
      },
      { key: 'apiToken', label: 'API Token', type: 'password', required: false, placeholder: 'For token auth' },
      { key: 'username', label: 'Username', type: 'text', required: false, placeholder: 'For session auth' },
      { key: 'password', label: 'Password', type: 'password', required: false, placeholder: 'For session auth' },
    ],
  },
  route53: {
    type: 'route53',
    name: 'AWS Route 53',
    features: {
      proxied: false,
      ttlMin: 0,
      ttlMax: 2147483647,
      ttlDefault: 300, // 5 minutes - AWS recommended default
      supportedTypes: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'],
      batchOperations: true,
    },
    requiredCredentials: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', required: true, placeholder: 'AWS access key' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true, placeholder: 'AWS secret key' },
      { key: 'hostedZoneId', label: 'Hosted Zone ID', type: 'text', required: true, placeholder: 'e.g., Z1234567890ABC' },
      { key: 'region', label: 'Region', type: 'text', required: false, placeholder: 'e.g., us-east-1 (optional)' },
    ],
  },
};

/**
 * Get provider type info
 */
export function getProviderTypeInfo(type: string): ProviderTypeInfo | undefined {
  return PROVIDER_TYPES[type];
}

/**
 * Get all provider types
 */
export function getAllProviderTypes(): ProviderTypeInfo[] {
  return Object.values(PROVIDER_TYPES);
}

/**
 * Get TTL constraints for a provider type
 */
export function getTTLConstraints(type: string): { min: number; max: number; default: number } {
  const info = PROVIDER_TYPES[type];
  if (!info) {
    // Fallback defaults
    return { min: 1, max: 86400, default: 300 };
  }
  return {
    min: info.features.ttlMin,
    max: info.features.ttlMax,
    default: info.features.ttlDefault,
  };
}
