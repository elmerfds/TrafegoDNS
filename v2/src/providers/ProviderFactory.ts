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
import type { ProviderType } from '../types/index.js';

export interface CreateProviderOptions {
  id?: string;
  name: string;
  type: ProviderType;
  credentials: ProviderCredentials;
  cacheRefreshInterval?: number;
}

/**
 * Create a DNS provider instance
 */
export function createProvider(options: CreateProviderOptions): DNSProvider {
  const { id = uuidv4(), name, type, credentials, cacheRefreshInterval } = options;

  logger.debug({ type, name }, 'Creating DNS provider');

  switch (type) {
    case 'cloudflare':
      return new CloudflareProvider(
        id,
        name,
        credentials as CloudflareProviderCredentials,
        { cacheRefreshInterval }
      );

    case 'digitalocean':
      return new DigitalOceanProvider(
        id,
        name,
        credentials as DigitalOceanProviderCredentials,
        { cacheRefreshInterval }
      );

    case 'route53':
      return new Route53Provider(
        id,
        name,
        credentials as Route53ProviderCredentials,
        { cacheRefreshInterval }
      );

    case 'technitium':
      return new TechnitiumProvider(
        id,
        name,
        credentials as TechnitiumProviderCredentials,
        { cacheRefreshInterval }
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
