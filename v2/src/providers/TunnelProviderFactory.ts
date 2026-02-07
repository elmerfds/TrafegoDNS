/**
 * Tunnel Provider Factory
 * Creates tunnel provider instances from database provider records.
 */
import { BaseTunnelProvider } from './base/BaseTunnelProvider.js';
import { CloudflareTunnelProvider } from './cloudflare/CloudflareTunnelProvider.js';
import { createChildLogger } from '../core/Logger.js';

const logger = createChildLogger({ service: 'TunnelProviderFactory' });

interface ProviderRecord {
  id: string;
  type: string;
  credentials: string; // JSON string
}

/**
 * Attempt to create a tunnel provider from a database provider record.
 * Returns null if the provider type doesn't support tunnels or required credentials are missing.
 */
export function createTunnelProvider(providerRecord: ProviderRecord): BaseTunnelProvider | null {
  let credentials: Record<string, string | undefined>;
  try {
    credentials = JSON.parse(providerRecord.credentials);
  } catch {
    logger.warn({ providerId: providerRecord.id }, 'Failed to parse provider credentials');
    return null;
  }

  switch (providerRecord.type) {
    case 'cloudflare': {
      const accountId = credentials.accountId;
      if (!accountId) {
        // Cloudflare provider exists but doesn't have accountId — tunnel support requires it
        return null;
      }
      return new CloudflareTunnelProvider(
        providerRecord.id,
        credentials.apiToken ?? '',
        accountId,
        credentials.zoneName ?? '',
        credentials.zoneId,
      );
    }

    // Future tunnel providers:
    // case 'tailscale': { ... }

    default:
      return null;
  }
}
