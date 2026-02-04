/**
 * Providers module exports
 */
export { DNSProvider, TRAFEGO_OWNERSHIP_MARKER, type ProviderCredentials, type RecordCache, type BatchResult, type ProviderInfo } from './base/index.js';
export { CloudflareProvider, type CloudflareProviderCredentials } from './cloudflare/index.js';
export { DigitalOceanProvider, type DigitalOceanProviderCredentials } from './digitalocean/index.js';
export { Route53Provider, type Route53ProviderCredentials } from './route53/index.js';
export { TechnitiumProvider, type TechnitiumProviderCredentials } from './technitium/index.js';
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
