/**
 * Outbound HTTP for user-supplied URLs (webhooks).
 *
 * URL validation at save time cannot stop SSRF on its own: a public hostname
 * can resolve to an internal address (or be re-pointed later), and a public
 * server can redirect to one. Here every address the connection would use is
 * checked inside the socket's DNS lookup, so the validated IP is the one we
 * connect to, and redirects are never followed.
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(addr, prefix, 'ipv6');
}

/** True if the address is loopback, private, link-local, reserved, etc. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped?.[1]) return blocked.check(mapped[1], 'ipv4');
    // Hex form of IPv4-mapped (::ffff:a00:1) — treat the whole range as blocked
    if (/^::ffff:/i.test(address)) return true;
    return blocked.check(address, 'ipv6');
  }
  return true; // not an IP at all: refuse
}

export class BlockedAddressError extends Error {
  constructor(host: string, address: string) {
    super(`Refusing to connect to ${host}: resolves to non-public address ${address}`);
    this.name = 'BlockedAddressError';
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number
) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (bad) return callback(new BlockedAddressError(hostname, bad.address), '');
    if (options.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(new Error(`No addresses for ${hostname}`), '');
    callback(null, first.address, first.family);
  });
}

export interface SafePostResult {
  status: number;
  body: string;
}

/**
 * POST to a user-supplied URL. Only http/https, only public addresses,
 * no redirects (a 3xx is returned as-is), response body capped.
 */
export function safePost(
  urlString: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 30000,
  maxBodyBytes = 64 * 1024
): Promise<SafePostResult> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      return reject(new Error('Invalid URL'));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error(`Unsupported protocol ${url.protocol}`));
    }

    // IP literals bypass the lookup hook, so check them here
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedAddress(host)) {
      return reject(new BlockedAddressError(host, host));
    }

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
        lookup: safeLookup as unknown as typeof dns.lookup,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < maxBodyBytes) chunks.push(chunk);
          size += chunk.length;
          if (size > maxBodyBytes) res.destroy();
        });
        const finish = () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', finish);
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end(body);
  });
}
