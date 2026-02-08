/**
 * Zone Conversion Utilities
 * Handles hostname conversion between DNS zones for multi-provider record creation.
 */

/**
 * Extract subdomain from a hostname given a zone.
 *
 * Examples:
 *   extractSubdomain("app.example.com", "example.com") => "app"
 *   extractSubdomain("deep.sub.example.com", "example.com") => "deep.sub"
 *   extractSubdomain("example.com", "example.com") => null  (apex)
 *   extractSubdomain("app.other.com", "example.com") => null (no match)
 */
export function extractSubdomain(hostname: string, zone: string): string | null {
  const lowerHost = hostname.toLowerCase();
  const lowerZone = zone.toLowerCase();

  if (lowerHost === lowerZone) return null; // apex domain
  if (!lowerHost.endsWith(`.${lowerZone}`)) return null; // doesn't match zone

  return lowerHost.slice(0, -(lowerZone.length + 1));
}

/**
 * Convert a hostname from one zone to another.
 *
 * Examples:
 *   convertHostname("app.example.com", "example.com", "home.lab") => "app.home.lab"
 *   convertHostname("example.com", "example.com", "home.lab") => "home.lab" (apex -> apex)
 *   convertHostname("deep.sub.example.com", "example.com", "home.lab") => "deep.sub.home.lab"
 */
export function convertHostname(
  hostname: string,
  sourceZone: string,
  targetZone: string,
): string {
  if (sourceZone.toLowerCase() === targetZone.toLowerCase()) return hostname;

  const subdomain = extractSubdomain(hostname, sourceZone);
  if (subdomain === null) {
    // Apex domain: map to target apex
    return targetZone;
  }
  return `${subdomain}.${targetZone}`;
}

/** Record types where the content is a hostname that may need zone conversion */
const HOSTNAME_CONTENT_TYPES = new Set(['CNAME', 'MX', 'SRV', 'NS']);

/**
 * Check if a record type has hostname-based content that may need zone conversion.
 */
export function isHostnameContentType(type: string): boolean {
  return HOSTNAME_CONTENT_TYPES.has(type.toUpperCase());
}

/**
 * Convert record content from one zone to another for hostname-based record types.
 * Only converts if the content value matches the source zone.
 * Returns the original content unchanged for non-hostname types or external targets.
 *
 * Examples:
 *   convertContent("CNAME", "proxy.example.com", "example.com", "home.lab") => "proxy.home.lab"
 *   convertContent("CNAME", "external.other.com", "example.com", "home.lab") => "external.other.com"
 *   convertContent("A", "192.168.1.1", "example.com", "home.lab") => "192.168.1.1"
 */
export function convertContent(
  type: string,
  content: string,
  sourceZone: string,
  targetZone: string,
): string {
  if (!isHostnameContentType(type)) return content;
  if (sourceZone.toLowerCase() === targetZone.toLowerCase()) return content;

  const lower = content.toLowerCase();
  const lowerSource = sourceZone.toLowerCase();

  // Check if content is within the source zone
  if (lower === lowerSource || lower.endsWith(`.${lowerSource}`)) {
    return convertHostname(content, sourceZone, targetZone);
  }

  // Content is external — don't convert
  return content;
}

/**
 * Get zone from a provider's settings object.
 * Handles the varying field names across provider types:
 * - Cloudflare/Route53: zoneName
 * - DigitalOcean/AdGuard/Pi-hole: domain
 * - Technitium/RFC2136: zone
 */
export function getProviderZone(settings?: Record<string, unknown>): string | null {
  if (!settings) return null;
  return (
    (settings.zoneName as string) ||
    (settings.domain as string) ||
    (settings.zone as string) ||
    null
  );
}
