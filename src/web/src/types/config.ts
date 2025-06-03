export interface Config {
  operationMode: string
  pollInterval: number
  watchDockerEvents: boolean
  cleanupOrphaned: boolean
  cleanupGracePeriod: number
  dnsProvider: string
  dnsLabelPrefix: string
  dnsDefaultType: string
  dnsDefaultContent: string
  dnsDefaultProxied: boolean
  dnsDefaultTTL: number
  dnsDefaultManage: boolean
  cloudflareZone: string
  route53Zone: string
  route53ZoneId: string
  route53Region: string
  digitalOceanDomain: string
  traefikApiUrl: string
  traefikApiUsername: string
  dockerSocket: string
  genericLabelPrefix: string
  traefikLabelPrefix: string
  managedHostnames: string
  preservedHostnames: string
  domain: string
  publicIP: string
  publicIPv6: string
  hostIp: string
  ipRefreshInterval: number
  dnsCacheRefreshInterval: number
  apiTimeout: number
  recordDefaults: any
  // Secret fields
  cloudflareToken?: string
  route53AccessKey?: string
  route53SecretKey?: string
  digitalOceanToken?: string
  traefikApiPassword?: string
  // Secret flags to indicate if values are set
  hasCloudflareToken?: boolean
  hasRoute53AccessKey?: boolean
  hasRoute53SecretKey?: boolean
  hasDigitalOceanToken?: boolean
  hasTraefikApiPassword?: boolean
  // OIDC/SSO configuration
  oidcEnabled?: boolean
  oidcIssuerUrl?: string
  oidcClientId?: string
  oidcRedirectUri?: string
  oidcScopes?: string
  oidcRoleMapping?: string
}

export interface OidcStatus {
  enabled: boolean
  configured: boolean
  issuer?: string
  clientId?: string
  scopes?: string[]
  roleMapping?: Record<string, string>
}