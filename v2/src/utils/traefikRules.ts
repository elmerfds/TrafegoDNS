/**
 * Parse hostnames out of Traefik router rules.
 *
 * Handles Host(`a`), Host(`a`, `b`) (Traefik v2 multi-arg), double-quoted
 * arguments, legacy comma-joined values, and rules combined with || / &&.
 * HostRegexp/HostSNI are not matched here.
 */
export function extractHostArgs(rule: string): string[] {
  const hosts: string[] = [];
  for (const call of rule.matchAll(/\bHost\(([^)]*)\)/g)) {
    for (const arg of (call[1] ?? '').matchAll(/[`"]([^`"]+)[`"]/g)) {
      for (const host of (arg[1] ?? '').split(',')) {
        const trimmed = host.trim();
        if (trimmed) hosts.push(trimmed);
      }
    }
  }
  return hosts;
}
