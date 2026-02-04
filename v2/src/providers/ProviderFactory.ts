/**
 * DNS Provider Factory
 * Creates provider instances based on configuration
 */
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../core/Logger.js';
import { DNSProvider, type ProviderCredentials } from './base/DNSProvider.js';
import { CloudflareProvider, type CloudflareProviderCredentials } from './cloudflare/index.js';
import { DigitalOceanProvider, type DigitalOceanProviderCredentials } from './digitalocean/index.js';
import { Route53Provider, type Route53ProviderCredentials } from './route53/index.js';
import { TechnitiumProvider, type TechnitiumProviderCredentials } from './technitium/index.js';
import type { ProviderType, ProviderSettingsData } from '../types/index.js';

export interface CreateProviderOptions {
  id?: string;
  name: string;
  type: ProviderType;
  credentials: ProviderCredentials;
  settings?: ProviderSettingsData;
  cacheRefreshInterval?: number;
}

/**
 * Create a DNS provider instance
 */
export function createProvider(options: CreateProviderOptions): DNSProvider {
  const { id = uuidv4(), name, type, credentials, settings, cacheRefreshInterval } = options;

  logger.debug({ type, name }, 'Creating DNS provider');

  switch (type) {
    case 'cloudflare':
      return new CloudflareProvider(
        id,
        name,
        credentials as CloudflareProviderCredentials,
        { cacheRefreshInterval, settings }
      );

    case 'digitalocean':
      return new DigitalOceanProvider(
        id,
        name,
        credentials as DigitalOceanProviderCredentials,
        { cacheRefreshInterval, settings }
      );

    case 'route53':
      return new Route53Provider(
        id,
        name,
        credentials as Route53ProviderCredentials,
        { cacheRefreshInterval, settings }
      );

    case 'technitium':
      return new TechnitiumProvider(
        id,
        name,
        credentials as TechnitiumProviderCredentials,
        { cacheRefreshInterval, settings }
      );

    default:
      throw new Error(`Unsupported provider type: ${type}`);
  }
}

/**
 * Create a provider from environment variables (for v1 compatibility)
 */
export function createProviderFromEnv(): DNSProvider | null {
  const providerType = process.env['DNS_PROVIDER']?.toLowerCase() as ProviderType | undefined;

  if (!providerType) {
    logger.warn('DNS_PROVIDER not set');
    return null;
  }

  const id = 'default';
  const name = `Default ${providerType} Provider`;

  switch (providerType) {
    case 'cloudflare': {
      const apiToken = process.env['CLOUDFLARE_TOKEN'];
      const zoneName = process.env['CLOUDFLARE_ZONE'];

      if (!apiToken || !zoneName) {
        throw new Error('CLOUDFLARE_TOKEN and CLOUDFLARE_ZONE are required');
      }

      return createProvider({
        id,
        name,
        type: 'cloudflare',
        credentials: {
          apiToken,
          zoneName,
          zoneId: process.env['CLOUDFLARE_ZONE_ID'],
          accountId: process.env['CLOUDFLARE_ACCOUNT_ID'],
        } as CloudflareProviderCredentials,
      });
    }

    case 'digitalocean': {
      const apiToken = process.env['DO_TOKEN'];
      const domain = process.env['DO_DOMAIN'];

      if (!apiToken || !domain) {
        throw new Error('DO_TOKEN and DO_DOMAIN are required');
      }

      return createProvider({
        id,
        name,
        type: 'digitalocean',
        credentials: {
          apiToken,
          domain,
        } as DigitalOceanProviderCredentials,
      });
    }

    case 'route53': {
      const accessKeyId = process.env['ROUTE53_ACCESS_KEY'];
      const secretAccessKey = process.env['ROUTE53_SECRET_KEY'];
      const zoneName = process.env['ROUTE53_ZONE'];
      const region = process.env['ROUTE53_REGION'] ?? 'us-east-1';

      if (!accessKeyId || !secretAccessKey || !zoneName) {
        throw new Error('ROUTE53_ACCESS_KEY, ROUTE53_SECRET_KEY, and ROUTE53_ZONE are required');
      }

      return createProvider({
        id,
        name,
        type: 'route53',
        credentials: {
          accessKeyId,
          secretAccessKey,
          region,
          zoneName,
          hostedZoneId: process.env['ROUTE53_ZONE_ID'],
        } as Route53ProviderCredentials,
      });
    }

    case 'technitium': {
      const url = process.env['TECHNITIUM_URL'];
      const zone = process.env['TECHNITIUM_ZONE'];
      const authMethod = (process.env['TECHNITIUM_AUTH_METHOD'] ?? 'token') as 'token' | 'session';

      if (!url || !zone) {
        throw new Error('TECHNITIUM_URL and TECHNITIUM_ZONE are required');
      }

      return createProvider({
        id,
        name,
        type: 'technitium',
        credentials: {
          url,
          zone,
          authMethod,
          apiToken: process.env['TECHNITIUM_API_TOKEN'],
          username: process.env['TECHNITIUM_USERNAME'],
          password: process.env['TECHNITIUM_PASSWORD'],
        } as TechnitiumProviderCredentials,
      });
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
}

/**
 * Validate provider credentials without creating an instance
 */
export function validateCredentials(type: ProviderType, credentials: ProviderCredentials): boolean {
  switch (type) {
    case 'cloudflare': {
      const creds = credentials as CloudflareProviderCredentials;
      return !!(creds.apiToken && creds.zoneName);
    }

    case 'digitalocean': {
      const creds = credentials as DigitalOceanProviderCredentials;
      return !!(creds.apiToken && creds.domain);
    }

    case 'route53': {
      const creds = credentials as Route53ProviderCredentials;
      return !!(creds.accessKeyId && creds.secretAccessKey && creds.zoneName);
    }

    case 'technitium': {
      const creds = credentials as TechnitiumProviderCredentials;
      if (!creds.url || !creds.zone) return false;
      if (creds.authMethod === 'token') return !!creds.apiToken;
      return !!(creds.username && creds.password);
    }

    default:
      return false;
  }
}

/**
 * Get supported provider types
 */
export function getSupportedProviders(): ProviderType[] {
  return ['cloudflare', 'digitalocean', 'route53', 'technitium'];
}

/**
 * Provider configuration detected from environment
 */
export interface DetectedProviderConfig {
  type: ProviderType;
  name: string;
  credentials: ProviderCredentials;
  zone: string;
}

/**
 * Detect all configured providers from environment variables
 * Returns all providers that have valid credentials configured
 */
export function detectProvidersFromEnv(): DetectedProviderConfig[] {
  const detected: DetectedProviderConfig[] = [];

  // Check Cloudflare
  const cfToken = process.env['CLOUDFLARE_TOKEN'] || process.env['CF_API_TOKEN'] || process.env['CLOUDFLARE_API_TOKEN'];
  const cfZone = process.env['CLOUDFLARE_ZONE'] || process.env['CF_ZONE_NAME'];

  if (cfToken && cfZone) {
    detected.push({
      type: 'cloudflare',
      name: `Cloudflare (${cfZone})`,
      zone: cfZone,
      credentials: {
        apiToken: cfToken,
        zoneName: cfZone,
        zoneId: process.env['CLOUDFLARE_ZONE_ID'] || process.env['CF_ZONE_ID'],
        accountId: process.env['CLOUDFLARE_ACCOUNT_ID'] || process.env['CF_ACCOUNT_ID'],
      } as CloudflareProviderCredentials,
    });
  }

  // Check DigitalOcean
  const doToken = process.env['DO_TOKEN'] || process.env['DIGITALOCEAN_TOKEN'];
  const doDomain = process.env['DO_DOMAIN'];

  if (doToken && doDomain) {
    detected.push({
      type: 'digitalocean',
      name: `DigitalOcean (${doDomain})`,
      zone: doDomain,
      credentials: {
        apiToken: doToken,
        domain: doDomain,
      } as DigitalOceanProviderCredentials,
    });
  }

  // Check Route53
  const r53AccessKey = process.env['ROUTE53_ACCESS_KEY'] || process.env['AWS_ACCESS_KEY_ID'];
  const r53SecretKey = process.env['ROUTE53_SECRET_KEY'] || process.env['AWS_SECRET_ACCESS_KEY'];
  const r53Zone = process.env['ROUTE53_ZONE'] || process.env['ROUTE53_ZONE_NAME'];

  if (r53AccessKey && r53SecretKey && r53Zone) {
    detected.push({
      type: 'route53',
      name: `Route53 (${r53Zone})`,
      zone: r53Zone,
      credentials: {
        accessKeyId: r53AccessKey,
        secretAccessKey: r53SecretKey,
        region: process.env['ROUTE53_REGION'] || process.env['AWS_REGION'] || 'us-east-1',
        zoneName: r53Zone,
        hostedZoneId: process.env['ROUTE53_ZONE_ID'] || process.env['ROUTE53_HOSTED_ZONE_ID'],
      } as Route53ProviderCredentials,
    });
  }

  // Check Technitium
  const techUrl = process.env['TECHNITIUM_URL'];
  const techZone = process.env['TECHNITIUM_ZONE'];
  const techToken = process.env['TECHNITIUM_API_TOKEN'];
  const techUser = process.env['TECHNITIUM_USERNAME'];
  const techPass = process.env['TECHNITIUM_PASSWORD'];

  if (techUrl && techZone && (techToken || (techUser && techPass))) {
    const authMethod = techToken ? 'token' : 'session';
    detected.push({
      type: 'technitium',
      name: `Technitium (${techZone})`,
      zone: techZone,
      credentials: {
        url: techUrl,
        zone: techZone,
        authMethod: authMethod as 'token' | 'session',
        apiToken: techToken,
        username: techUser,
        password: techPass,
      } as TechnitiumProviderCredentials,
    });
  }

  return detected;
}

/**
 * Create all providers from environment variables
 * Supports multi-provider configuration for zone-based routing
 */
export function createAllProvidersFromEnv(): DNSProvider[] {
  const detected = detectProvidersFromEnv();

  if (detected.length === 0) {
    logger.warn('No DNS providers configured in environment');
    return [];
  }

  logger.info({ count: detected.length, providers: detected.map(d => `${d.type}:${d.zone}`) }, 'Detected providers from environment');

  const providers: DNSProvider[] = [];

  for (const config of detected) {
    try {
      const provider = createProvider({
        id: `env-${config.type}-${config.zone.replace(/\./g, '-')}`,
        name: config.name,
        type: config.type,
        credentials: config.credentials,
      });
      providers.push(provider);
      logger.info({ type: config.type, zone: config.zone }, 'Created provider from environment');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ type: config.type, zone: config.zone, error: message }, 'Failed to create provider from environment');
    }
  }

  return providers;
}
