/**
 * Providers module exports
 */
export { DNSProvider, TRAFEGO_OWNERSHIP_MARKER, type ProviderCredentials, type RecordCache, type BatchResult, type ProviderInfo } from './base/index.js';
export { CloudflareProvider, type CloudflareProviderCredentials } from './cloudflare/index.js';
export { DigitalOceanProvider, type DigitalOceanProviderCredentials } from './digitalocean/index.js';
export { Route53Provider, type Route53ProviderCredentials } from './route53/index.js';
export { TechnitiumProvider, type TechnitiumProviderCredentials } from './technitium/index.js';
export { AdGuardProvider, type AdGuardProviderCredentials } from './adguard/index.js';
export { PiHoleProvider, type PiHoleProviderCredentials } from './pihole/index.js';
export { RFC2136Provider, type RFC2136ProviderCredentials } from './rfc2136/index.js';
export {
  createProvider,
  createProviderFromEnv,
  createAllProvidersFromEnv,
  detectProvidersFromEnv,
  validateCredentials,
  getSupportedProviders,
  type CreateProviderOptions,
  type DetectedProviderConfig,
} from './ProviderFactory.js';
