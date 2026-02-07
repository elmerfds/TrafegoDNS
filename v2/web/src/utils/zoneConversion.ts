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
