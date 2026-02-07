/**
 * Base provider exports
 */
export {
  DNSProvider,
  TRAFEGO_OWNERSHIP_MARKER,
  type ProviderCredentials,
  type RecordCache,
  type BatchResult,
  type ProviderInfo,
} from './DNSProvider.js';

export {
  BaseTunnelProvider,
  type TunnelProviderCapabilities,
  type TunnelProviderInfo,
  type CreateTunnelConfig,
  type TunnelInfo,
  type TunnelRoute,
  type TunnelRouteConfig,
  type ConnectorInfo,
} from './BaseTunnelProvider.js';
